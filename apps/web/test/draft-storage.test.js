import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.js';
const { parseDraft, readDraft, writeDraft, draftStorageKey } = await loadTs('../src/app/draft-storage.ts');
const draft = { version: 1, workspaceTourSeen: true, notebooks: [{ id: 'nb', name: '研究', description: '', updatedAt: '剛剛', cardCount: 1 }],
  workspaces: { nb: [{ id: 's', type: 'source', x: 100, y: 100, source: { kind: 'registry', name: '人口', enabled: true, autoClean: false, registrySourceId: 'population', filters: { sexes: ['all'] } } }] },
  radar: { nb: { collapsed: true, running: true, activeRunId: 'previous' } } };
test('local drafts round trip without credentials or execution state', () => {
  const values = new Map(); const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readDraft(storage, 'a@example.test'), null);
  writeDraft(storage, ' A@example.test ', { ...draft, password: 'never-store', analysisByNode: { secret: 'response' } });
  const restored = readDraft(storage, 'a@example.test');
  assert.deepEqual(restored.workspaces, draft.workspaces);
  assert.equal(restored.workspaceTourSeen, true);
  assert.deepEqual(restored.radar.nb, { collapsed: true, running: false });
  assert.equal(values.values().next().value.includes('never-store'), false);
  assert.equal(values.values().next().value.includes('analysisByNode'), false);
  assert.equal(readDraft(storage, 'b@example.test'), null);
  assert.equal(draftStorageKey(' A@example.test '), draftStorageKey('a@example.test'));
});

test('older drafts default the first-workspace tour preference safely', () => {
  const legacyPreference = structuredClone(draft);
  delete legacyPreference.workspaceTourSeen;
  assert.equal(parseDraft(JSON.stringify(legacyPreference)).workspaceTourSeen, false);
});
test('malformed, unsupported and broken node drafts fail without overwriting storage', () => {
  for (const value of ['invalid JSON', JSON.stringify({ ...draft, version: 99 }), JSON.stringify({ ...draft, workspaceTourSeen: 'yes' }), JSON.stringify({ ...draft, workspaces: { nb: [{}] } }), JSON.stringify({ ...draft, notebooks: [...draft.notebooks, ...draft.notebooks] })]) {
    assert.throws(() => parseDraft(value));
  }
  const broken = structuredClone(draft); broken.workspaces.nb[0].source.filters = { nested: { constructor: 'bad' } };
  assert.throws(() => parseDraft(JSON.stringify(broken)));
  const danglingSource = structuredClone(draft);
  danglingSource.workspaces.nb.push({ id: 'chart', type: 'result', x: 400, y: 100, result: { kind: 'chart', name: '圖表', prompt: '分析', sourceNodeIds: ['missing'] } });
  assert.throws(() => parseDraft(JSON.stringify(danglingSource)), /來源不存在/);
});
test('browser storage and quota failures propagate to the visible UI warning', () => {
  assert.throws(() => readDraft({ getItem() { throw new Error('blocked'); } }, 'a'), /blocked/);
  assert.throws(() => writeDraft({ setItem() { throw new Error('quota'); } }, 'a', draft), /quota/);
});

test('legacy prototype nodes are removed and assistant history no longer counts as a canvas card', () => {
  const legacy = {
    version: 1,
    notebooks: [{ id: 'legacy', name: '既有研究', description: '使用者草稿', updatedAt: '昨天', cardCount: 5 }],
    workspaces: {
      legacy: [
        { id: 'transform', type: 'transform', x: 100, y: 160 },
        { id: 'analysis', type: 'analysis', x: 530, y: 160 },
        { id: 'source', type: 'source', x: 40, y: 80, source: { kind: 'registry', name: '人口資料', enabled: true, autoClean: true, registrySourceId: 'population' } },
        { id: 'chart', type: 'result', x: 420, y: 80, result: { kind: 'chart', name: '使用者圖表', prompt: '比較趨勢', sourceNodeIds: ['source'] } },
        { id: 'helper', type: 'assistant', x: 800, y: 80, assistant: { name: '我的小幫手', lastPrompt: '保留這段對話', messages: [{ id: 'message-1', role: 'user', content: '保留這段對話', createdAt: '昨天' }], draftActions: [{ id: 'draft-1', kind: 'chart', name: '草稿圖表', prompt: '分析資料', sourceNodeIds: ['source'] }] } },
      ],
    },
    radar: { legacy: { collapsed: false, running: false } },
  };

  const migrated = parseDraft(JSON.stringify(legacy));
  assert.deepEqual(migrated.workspaces.legacy.map(node => node.type), ['source', 'result', 'assistant']);
  assert.equal(migrated.notebooks[0].cardCount, 2);
  assert.equal(migrated.workspaces.legacy[0].source.name, '人口資料');
  assert.equal(migrated.workspaces.legacy[1].result.prompt, '比較趨勢');
  assert.equal(migrated.workspaces.legacy[2].assistant.messages[0].content, '保留這段對話');
  assert.equal(migrated.workspaces.legacy[2].assistant.draftActions[0].name, '草稿圖表');

  const values = new Map();
  writeDraft({ setItem: (key, value) => values.set(key, value) }, 'legacy@example.test', legacy);
  const saved = JSON.parse(values.get(draftStorageKey('legacy@example.test')));
  assert.deepEqual(saved.workspaces.legacy.map(node => node.type), ['source', 'result', 'assistant']);
  assert.equal(saved.notebooks[0].cardCount, 2);
});
