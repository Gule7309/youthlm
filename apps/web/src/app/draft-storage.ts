import type { CanvasNode, Notebook, PolicyRadarStateByNotebook } from './types';

export type DraftSnapshot = {
  version: 1;
  workspaceTourSeen?: boolean;
  notebooks: Notebook[];
  workspaces: Record<string, CanvasNode[]>;
  radar: PolicyRadarStateByNotebook;
};
const MAX_BYTES = 4_000_000;
const record = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length <= 20_000;
const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(value);
const ids = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 500 && value.every(id);
const finite = (value: unknown) => typeof value === 'number' && Number.isFinite(value);

function jsonValue(value: unknown, depth = 0): boolean {
  if (depth > 8) return false;
  if (value === null || typeof value === 'boolean' || text(value) || finite(value)) return true;
  if (Array.isArray(value)) return value.length <= 500 && value.every(item => jsonValue(item, depth + 1));
  return record(value) && Object.entries(value).every(([key, item]) => !['__proto__', 'prototype', 'constructor'].includes(key) && jsonValue(item, depth + 1));
}

function validNode(node: unknown): node is CanvasNode {
  if (!record(node) || !id(node.id) || !finite(node.x) || !finite(node.y)) return false;
  if (node.type === 'transform' || node.type === 'analysis') return true;
  if (node.type === 'source') {
    const source = node.source;
    return record(source) && [null, 'registry', 'file', 'api'].includes(source.kind) && text(source.name)
      && typeof source.enabled === 'boolean' && typeof source.autoClean === 'boolean'
      && (source.registrySourceId === undefined || id(source.registrySourceId))
      && (source.apiUrl === undefined || text(source.apiUrl))
      && (source.filters === undefined || (record(source.filters) && jsonValue(source.filters)))
      && (source.file === undefined || (record(source.file) && text(source.file.name) && text(source.file.type)
        && finite(source.file.size) && source.file.size >= 0 && finite(source.file.lastModified)));
  }
  if (node.type === 'result') {
    const result = node.result;
    return record(result) && [null, 'chart', 'presentation'].includes(result.kind)
      && text(result.name) && text(result.prompt) && ids(result.sourceNodeIds)
      && (result.sourceModuleIds === undefined || ids(result.sourceModuleIds));
  }
  if (node.type === 'assistant') {
    const assistant = node.assistant;
    return record(assistant) && text(assistant.name)
      && (assistant.lastPrompt === undefined || text(assistant.lastPrompt))
      && Array.isArray(assistant.messages) && assistant.messages.length <= 1000
      && assistant.messages.every((item: unknown) => record(item) && id(item.id)
        && ['user', 'assistant'].includes(item.role) && text(item.content) && text(item.createdAt))
      && Array.isArray(assistant.draftActions) && assistant.draftActions.length <= 500
      && assistant.draftActions.every((item: unknown) => record(item) && id(item.id)
        && ['chart', 'presentation'].includes(item.kind) && text(item.name) && text(item.prompt) && ids(item.sourceNodeIds));
  }
  return false;
}

export function parseDraft(raw: string): DraftSnapshot {
  if (raw.length > MAX_BYTES) throw new Error('本機草稿過大。');
  const data: unknown = JSON.parse(raw);
  if (!record(data) || data.version !== 1
    || (data.workspaceTourSeen !== undefined && typeof data.workspaceTourSeen !== 'boolean')
    || !Array.isArray(data.notebooks) || data.notebooks.length > 200
    || !record(data.workspaces) || !record(data.radar)) throw new Error('本機草稿版本或格式不相容。');
  const seen = new Set<string>();
  const notebooks: Notebook[] = [];
  const workspaces: Record<string, CanvasNode[]> = {};
  const radarByNotebook: PolicyRadarStateByNotebook = {};
  for (const notebook of data.notebooks) {
    if (!record(notebook) || !id(notebook.id) || seen.has(notebook.id) || !text(notebook.name)
      || !text(notebook.description) || !text(notebook.updatedAt) || !finite(notebook.cardCount)) throw new Error('筆記本草稿格式不正確。');
    seen.add(notebook.id);
    const draftNodes = data.workspaces[notebook.id];
    if (!Array.isArray(draftNodes) || draftNodes.length > 500 || !draftNodes.every(validNode)
      || new Set(draftNodes.map(node => node.id)).size !== draftNodes.length) throw new Error('白板草稿格式不正確。');
    // transform/analysis were read-only prototype cards that could never be created
    // by a user. Accept them only long enough to migrate old local drafts.
    const nodes = (draftNodes as CanvasNode[]).filter(node => node.type !== 'transform' && node.type !== 'analysis');
    for (const node of nodes) {
      if (node.result?.sourceNodeIds.some((linked: string) => nodes.find(item => item.id === linked)?.type !== 'source')) {
        throw new Error('成果草稿引用的來源不存在。');
      }
      if (node.result?.sourceModuleIds?.some((linked: string) => nodes.find(item => item.id === linked)?.result?.kind !== 'chart')) {
        throw new Error('簡報草稿引用的圖表不存在。');
      }
    }
    const radar = data.radar[notebook.id];
    if (radar !== undefined) {
      if (!record(radar) || typeof radar.collapsed !== 'boolean') throw new Error('政策雷達草稿格式不正確。');
      radar.running = false;
      delete radar.activeRunId;
      if (radar.latestRecord) {
        const latest = radar.latestRecord;
        if (!record(latest) || !text(latest.createdAt) || !text(latest.workspaceSignature) || !record(latest.counts)
          || !['sourceCount', 'readySourceCount', 'resultCount', 'configuredResultCount'].every(key => finite(latest.counts[key]))) {
          throw new Error('政策雷達紀錄格式不正確。');
        }
      }
      radarByNotebook[notebook.id] = radar as PolicyRadarStateByNotebook[string];
    }
    workspaces[notebook.id] = nodes;
    notebooks.push({
      ...(notebook as Notebook),
      cardCount: nodes.filter(node => node.type !== 'assistant').length,
    });
  }
  return {
    version: 1,
    workspaceTourSeen: data.workspaceTourSeen === true,
    notebooks,
    workspaces,
    radar: radarByNotebook,
  };
}

// An email is only a local draft selector, not an authentication/security boundary.
export function draftStorageKey(email: string) {
  return `youthlm:draft:v1:${encodeURIComponent(email.trim().toLowerCase())}`;
}
export function readDraft(storage: Pick<Storage, 'getItem'>, email: string): DraftSnapshot | null {
  const raw = storage.getItem(draftStorageKey(email));
  return raw === null ? null : parseDraft(raw);
}
export function writeDraft(storage: Pick<Storage, 'setItem'>, email: string, draft: DraftSnapshot) {
  // Whitelist only notebook settings, never credentials or backend execution responses.
  const raw = JSON.stringify({
    version: 1,
    workspaceTourSeen: draft.workspaceTourSeen === true,
    notebooks: draft.notebooks,
    workspaces: draft.workspaces,
    radar: draft.radar,
  });
  const sanitized = parseDraft(raw);
  storage.setItem(draftStorageKey(email), JSON.stringify(sanitized));
}
