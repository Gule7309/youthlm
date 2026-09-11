import type {
  CanvasNode,
  PolicyRadarCounts,
  PolicyRadarState,
  SourceConfig,
} from './types';

export function createPolicyRadarState(): PolicyRadarState {
  return { collapsed: true, running: false };
}

export function preparePolicyRadarStateForOpen(
  state: PolicyRadarState | undefined,
): PolicyRadarState {
  if (!state) return createPolicyRadarState();
  if (state.collapsed && !state.running) return state;
  return { ...state, collapsed: true, running: false };
}

export function cloneSourceConfig(source: SourceConfig): SourceConfig {
  return structuredClone(source);
}

function hasSameSourceData(previous: SourceConfig | undefined, next: SourceConfig) {
  if (!previous || previous.kind !== next.kind) return false;
  if (next.kind === 'registry') {
    return Boolean(next.registrySourceId)
      && previous.registrySourceId === next.registrySourceId;
  }
  if (next.kind === 'api') {
    return Boolean(next.apiUrl?.trim()) && previous.apiUrl?.trim() === next.apiUrl?.trim();
  }
  if (next.kind === 'file') {
    const first = previous.file;
    const second = next.file;
    return Boolean(first && second
      && first.name === second.name
      && first.size === second.size
      && first.type === second.type
      && first.lastModified === second.lastModified);
  }
  return false;
}

// Registry selection explicitly replaces the binding and filters. Local file/API
// edits preserve bindings only while their underlying input remains unchanged.
export function updateSourceConfig(
  previous: SourceConfig | undefined,
  next: SourceConfig,
): SourceConfig {
  if (next.kind === 'registry') {
    const { file: _file, apiUrl: _apiUrl, ...registry } = next;
    return cloneSourceConfig({ ...registry, autoClean: false, filters: next.filters ?? {} });
  }
  const sameSourceData = hasSameSourceData(previous, next);
  return cloneSourceConfig({
    ...next,
    registrySourceId: sameSourceData ? previous?.registrySourceId : undefined,
    filters: sameSourceData ? previous?.filters ?? {} : {},
  });
}

export function isSourceConfigured(source: SourceConfig | undefined): boolean {
  if (source?.kind === 'file') return Boolean(source.file?.name);
  if (source?.kind === 'api') return Boolean(source.apiUrl?.trim());
  if (source?.kind === 'registry') return Boolean(source.registrySourceId && source.filters && Object.keys(source.filters).length);
  return false;
}

export function getPolicyRadarCounts(workspace: CanvasNode[]): PolicyRadarCounts {
  const sourceNodes = workspace.filter(node => node.type === 'source');
  const resultNodes = workspace.filter(node => node.type === 'result');
  const sourceNodeIds = new Set(sourceNodes.map(node => node.id));
  const chartNodeIds = new Set(
    resultNodes
      .filter(node => node.result?.kind === 'chart')
      .map(node => node.id),
  );

  const configuredResultCount = resultNodes.filter(node => {
    if (node.result?.kind === 'chart') {
      return node.result.sourceNodeIds.length > 0
        && node.result.sourceNodeIds.every(sourceNodeId => sourceNodeIds.has(sourceNodeId));
    }
    if (node.result?.kind === 'presentation') {
      const sourceModuleIds = node.result.sourceModuleIds ?? [];
      return sourceModuleIds.length > 0
        && sourceModuleIds.every(sourceModuleId => chartNodeIds.has(sourceModuleId));
    }
    return false;
  }).length;

  return {
    sourceCount: sourceNodes.length,
    readySourceCount: sourceNodes.filter(
      node => node.source?.enabled && isSourceConfigured(node.source),
    ).length,
    resultCount: resultNodes.length,
    configuredResultCount,
  };
}

export function cloneWorkspaceNode(node: CanvasNode): CanvasNode {
  return {
    ...node,
    source: node.source ? cloneSourceConfig(node.source) : undefined,
    result: node.result
      ? {
        ...node.result,
        sourceNodeIds: [...node.result.sourceNodeIds],
        ...(node.result.sourceModuleIds
          ? { sourceModuleIds: [...node.result.sourceModuleIds] }
          : {}),
      }
      : undefined,
    assistant: node.assistant
      ? {
        ...node.assistant,
        messages: node.assistant.messages.map(message => ({ ...message })),
        draftActions: node.assistant.draftActions.map(action => ({
          ...action,
          sourceNodeIds: [...action.sourceNodeIds],
        })),
      }
      : undefined,
  };
}

export function duplicateWorkspaceNodes(nodes: CanvasNode[]): CanvasNode[] {
  const duplicateKey = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const idMap = new Map(
    nodes.map((node, index) => [node.id, `${node.type}-${duplicateKey}-${index + 1}`]),
  );

  return nodes.map(node => {
    const clone = cloneWorkspaceNode(node);
    const duplicateNodeId = idMap.get(node.id) ?? node.id;
    return {
      ...clone,
      id: duplicateNodeId,
      result: clone.result
        ? {
          ...clone.result,
          sourceNodeIds: clone.result.sourceNodeIds
            .map(sourceNodeId => idMap.get(sourceNodeId))
            .filter((sourceNodeId): sourceNodeId is string => Boolean(sourceNodeId)),
          ...(clone.result.sourceModuleIds
            ? {
              sourceModuleIds: clone.result.sourceModuleIds
                .map(sourceModuleId => idMap.get(sourceModuleId))
                .filter((sourceModuleId): sourceModuleId is string => Boolean(sourceModuleId)),
            }
            : {}),
        }
        : undefined,
      assistant: clone.assistant
        ? {
          ...clone.assistant,
          messages: clone.assistant.messages.map((message, index) => ({
            ...message,
            id: `${duplicateNodeId}-message-${index + 1}`,
          })),
          draftActions: clone.assistant.draftActions.map((action, index) => ({
            ...action,
            id: `${duplicateNodeId}-draft-${index + 1}`,
            sourceNodeIds: action.sourceNodeIds
              .map(sourceNodeId => idMap.get(sourceNodeId))
              .filter((sourceNodeId): sourceNodeId is string => Boolean(sourceNodeId)),
          })),
        }
        : undefined,
    };
  });
}

export function removeResultNode(nodes: CanvasNode[], resultNodeId: string): CanvasNode[] {
  return nodes
    .filter(node => node.id !== resultNodeId)
    .map(node => {
      if (node.type !== 'result' || !node.result?.sourceModuleIds) return node;
      return {
        ...node,
        result: {
          ...node.result,
          sourceModuleIds: node.result.sourceModuleIds.filter(
            sourceModuleId => sourceModuleId !== resultNodeId,
          ),
        },
      };
    });
}

export function removeSourceNode(nodes: CanvasNode[], sourceNodeId: string): CanvasNode[] {
  return nodes
    .filter(node => node.id !== sourceNodeId)
    .map(node => {
      if (node.type === 'result' && node.result) {
        return {
          ...node,
          result: {
            ...node.result,
            sourceNodeIds: node.result.sourceNodeIds.filter(id => id !== sourceNodeId),
          },
        };
      }
      if (node.type === 'assistant' && node.assistant) {
        return {
          ...node,
          assistant: {
            ...node.assistant,
            draftActions: node.assistant.draftActions.map(action => ({
              ...action,
              sourceNodeIds: action.sourceNodeIds.filter(id => id !== sourceNodeId),
            })),
          },
        };
      }
      return node;
    });
}

export function getPolicyRadarWorkspaceSignature(workspace: CanvasNode[]) {
  const trackedNodes = workspace
    .filter(node => node.type === 'source' || node.type === 'result')
    .sort((first, second) => first.id.localeCompare(second.id))
    .map(node => {
      if (node.type === 'source') {
        return {
          id: node.id,
          type: node.type,
          kind: node.source?.kind ?? null,
          name: node.source?.name ?? '',
          enabled: node.source?.enabled ?? false,
          autoClean: node.source?.autoClean ?? false,
          apiUrl: node.source?.apiUrl ?? '',
          file: node.source?.file ? { ...node.source.file } : null,
          registrySourceId: node.source?.registrySourceId ?? null,
          filters: node.source?.filters ?? {},
        };
      }

      return {
        id: node.id,
        type: node.type,
        kind: node.result?.kind ?? null,
        name: node.result?.name ?? '',
        sourceNodeIds: [...(node.result?.sourceNodeIds ?? [])].sort(),
        sourceModuleIds: [...(node.result?.sourceModuleIds ?? [])].sort(),
        prompt: node.result?.prompt ?? '',
      };
    });

  return JSON.stringify(trackedNodes);
}
