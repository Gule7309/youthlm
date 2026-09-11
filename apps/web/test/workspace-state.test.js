import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

// Load the actual TypeScript helpers without adding a second test runner.
// The full type check remains part of `npm run check`.
const helperUrl = new URL("../src/app/workspace-state.ts", import.meta.url);
const { outputText } = ts.transpileModule(readFileSync(helperUrl, "utf8"), {
  fileName: helperUrl.pathname,
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
});
const {
  cloneSourceConfig,
  createPolicyRadarState,
  preparePolicyRadarStateForOpen,
  updateSourceConfig,
  cloneWorkspaceNode,
  duplicateWorkspaceNodes,
  removeResultNode,
  removeSourceNode,
  getPolicyRadarWorkspaceSignature,
  getPolicyRadarCounts,
  isSourceConfigured,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

const REGISTRY_SOURCE_ID = "ntpc_population_by_age_sex_district";

test('new policy radar starts collapsed so it cannot cover card settings', () => {
  assert.deepEqual(createPolicyRadarState(), { collapsed: true, running: false });
});

test('opening a notebook collapses persisted radar UI without losing its latest record', () => {
  const latestRecord = {
    createdAt: '2026-09-11T00:50:00.000Z',
    workspaceSignature: 'saved-signature',
    counts: {
      sourceCount: 1,
      readySourceCount: 1,
      resultCount: 2,
      configuredResultCount: 2,
    },
  };
  const persisted = { collapsed: false, running: true, latestRecord };
  const prepared = preparePolicyRadarStateForOpen(persisted);

  assert.deepEqual(prepared, { collapsed: true, running: false, latestRecord });
  assert.notEqual(prepared, persisted);
  assert.equal(preparePolicyRadarStateForOpen(prepared), prepared);
  assert.deepEqual(preparePolicyRadarStateForOpen(undefined), createPolicyRadarState());
});

test('explicit registry selection replaces prior filters and removes local input metadata', () => {
  const previous = sourceConfig();
  const next = { ...previous, kind: 'registry', registrySourceId: 'ntpc_unemployment_by_age_sex', filters: { start_year: 2024, end_year: 2024, age_groups: ['25-29'], sexes: ['female'] } };
  const saved = updateSourceConfig(previous, next);
  assert.equal(saved.registrySourceId, next.registrySourceId);
  assert.deepEqual(saved.filters, next.filters);
  assert.equal(saved.autoClean, false);
  assert.equal(saved.file, undefined);
  assert.equal(saved.apiUrl, undefined);
  next.filters.sexes.push('male');
  assert.deepEqual(saved.filters.sexes, ['female']);
  assert.equal(isSourceConfigured(saved), true);
});

test('registry filter edits persist while switching back to a local source clears binding', () => {
  const original = { ...sourceConfig(), kind: 'registry' };
  const edited = updateSourceConfig(original, { ...original, name: '修改名稱', enabled: false, filters: { ...original.filters, geographies: ['淡水區'] } });
  assert.deepEqual(edited.filters.geographies, ['淡水區']);
  assert.equal(edited.enabled, false);
  assert.equal(edited.registrySourceId, REGISTRY_SOURCE_ID);
  const local = updateSourceConfig(edited, { ...sourceConfig(), kind: 'api', apiUrl: 'https://example.test/data' });
  assert.equal(local.registrySourceId, undefined);
  assert.deepEqual(local.filters, {});
});

test('a new registry binding survives save and notebook copy with separate canvas IDs', () => {
  const saved = updateSourceConfig(undefined, { ...sourceConfig(), kind: 'registry' });
  const nodes = duplicateWorkspaceNodes([{ id: 'canvas-1', type: 'source', x: 0, y: 0, source: saved }]);
  assert.notEqual(nodes[0].id, 'canvas-1');
  assert.equal(nodes[0].source.registrySourceId, REGISTRY_SOURCE_ID);
  nodes[0].source.filters.geographies.push('淡水區');
  assert.deepEqual(saved.filters.geographies, ['板橋區']);
  assert.equal(isSourceConfigured({ ...saved, registrySourceId: undefined }), false);
});

function sourceConfig(overrides = {}) {
  return {
    kind: "file",
    name: "人口資料",
    file: { name: "population.csv", size: 123, type: "text/csv", lastModified: 456 },
    enabled: true,
    autoClean: true,
    registrySourceId: REGISTRY_SOURCE_ID,
    filters: {
      geographies: ["板橋區"],
      age_groups: ["20-24"],
      sexes: ["all"],
      start_year: 2022,
      end_year: 2024,
      nested: { values: [null, true, { label: "原始值" }] },
    },
    ...overrides,
  };
}

function formConfig(source, overrides = {}) {
  const { registrySourceId: _registrySourceId, filters: _filters, ...form } = source;
  return { ...form, ...overrides };
}

function workspaceFixture() {
  return [
    { id: "source-node-a", type: "source", x: 10, y: 20, source: sourceConfig() },
    {
      id: "source-node-b",
      type: "source",
      x: 10,
      y: 300,
      source: sourceConfig({ name: "同資料集的另一張來源卡片" }),
    },
    {
      id: "result-node",
      type: "result",
      x: 400,
      y: 20,
      result: {
        kind: "chart",
        name: "人口趨勢",
        sourceNodeIds: ["source-node-a", "source-node-b"],
        prompt: "比較人口趨勢",
      },
    },
    {
      id: "assistant-node",
      type: "assistant",
      x: 800,
      y: 20,
      assistant: {
        name: "小幫手",
        messages: [{ id: "message-1", role: "user", content: "分析資料", createdAt: "2026-09-06T00:00:00Z" }],
        draftActions: [{
          id: "draft-1",
          kind: "chart",
          name: "圖表草稿",
          sourceNodeIds: ["source-node-a", "source-node-b"],
          prompt: "比較人口趨勢",
        }],
      },
    },
    {
      id: "presentation-node",
      type: "result",
      x: 1200,
      y: 20,
      result: {
        kind: "presentation",
        name: "人口政策簡報",
        sourceNodeIds: [],
        sourceModuleIds: ["result-node"],
        prompt: "保留資料限制與來源",
      },
    },
  ];
}

test('policy radar counts configured charts and presentations without accepting dangling links', () => {
  const workspace = workspaceFixture();
  assert.deepEqual(getPolicyRadarCounts(workspace), {
    sourceCount: 2,
    readySourceCount: 2,
    resultCount: 2,
    configuredResultCount: 2,
  });

  const broken = workspace.map(cloneWorkspaceNode);
  broken[2].result.sourceNodeIds = ['missing-source'];
  broken[4].result.sourceModuleIds = ['missing-analysis'];
  broken[1].source.enabled = false;
  assert.deepEqual(getPolicyRadarCounts(broken), {
    sourceCount: 2,
    readySourceCount: 1,
    resultCount: 2,
    configuredResultCount: 0,
  });
});

test("source cloning preserves registry identity without sharing nested filters or file metadata", () => {
  const original = sourceConfig();
  const before = structuredClone(original);
  const clone = cloneSourceConfig(original);

  assert.deepEqual(clone, original);
  assert.notEqual(clone, original);
  assert.notEqual(clone.file, original.file);
  assert.notEqual(clone.filters, original.filters);
  assert.notEqual(clone.filters.geographies, original.filters.geographies);
  assert.notEqual(clone.filters.nested.values[2], original.filters.nested.values[2]);
  clone.file.name = "copy.csv";
  clone.filters.geographies.push("三重區");
  clone.filters.nested.values[2].label = "副本值";

  assert.deepEqual(original, before);
  assert.equal(clone.registrySourceId, REGISTRY_SOURCE_ID);
});

test("ordinary source edits preserve and independently copy registry binding and filters", () => {
  const original = sourceConfig();
  const before = structuredClone(original);
  const updated = updateSourceConfig(original, formConfig(original, {
    name: "重新命名",
    enabled: false,
    autoClean: false,
  }));

  assert.equal(updated.name, "重新命名");
  assert.equal(updated.enabled, false);
  assert.equal(updated.autoClean, false);
  assert.equal(updated.registrySourceId, REGISTRY_SOURCE_ID);
  assert.deepEqual(updated.filters, original.filters);
  updated.filters.nested.values[2].label = "修改後";
  updated.file.name = "copy.csv";
  assert.deepEqual(original, before);
});

test("equivalent file metadata and trimmed API URLs retain the existing binding", () => {
  const fileSource = sourceConfig();
  const fileUpdate = updateSourceConfig(fileSource, formConfig(fileSource, {
    file: { ...fileSource.file },
  }));
  assert.equal(fileUpdate.registrySourceId, REGISTRY_SOURCE_ID);
  assert.deepEqual(fileUpdate.filters, fileSource.filters);

  const apiSource = sourceConfig({ kind: "api", file: undefined, apiUrl: " https://example.test/data " });
  const apiUpdate = updateSourceConfig(apiSource, formConfig(apiSource, {
    apiUrl: "https://example.test/data",
  }));
  assert.equal(apiUpdate.registrySourceId, REGISTRY_SOURCE_ID);
  assert.deepEqual(apiUpdate.filters, apiSource.filters);
});

test("changing any file identity metadata invalidates the previous binding and filters", async (t) => {
  const changes = { name: "other.csv", size: 999, type: "application/json", lastModified: 789 };
  for (const [field, value] of Object.entries(changes)) {
    await t.test(field, () => {
      const original = sourceConfig();
      const updated = updateSourceConfig(original, formConfig(original, {
        file: { ...original.file, [field]: value },
      }));
      assert.equal(updated.registrySourceId, undefined);
      assert.deepEqual(updated.filters, {});
      assert.equal(original.registrySourceId, REGISTRY_SOURCE_ID);
      assert.deepEqual(original.filters.geographies, ["板橋區"]);
    });
  }
});

test("changing source kind or API URL clears stale registry metadata", () => {
  const original = sourceConfig();
  const changedKind = updateSourceConfig(original, {
    kind: "api", name: original.name, apiUrl: "https://example.test/data", enabled: true, autoClean: true,
  });
  assert.equal(changedKind.registrySourceId, undefined);
  assert.deepEqual(changedKind.filters, {});

  const apiSource = sourceConfig({ kind: "api", file: undefined, apiUrl: "https://example.test/data" });
  const changedUrl = updateSourceConfig(apiSource, formConfig(apiSource, {
    apiUrl: "https://example.test/other-data",
  }));
  assert.equal(changedUrl.registrySourceId, undefined);
  assert.deepEqual(changedUrl.filters, {});
});

test("saving a new local source never invents a registry ID or query filters", () => {
  const updated = updateSourceConfig(undefined, formConfig(sourceConfig()));
  assert.equal(updated.registrySourceId, undefined);
  assert.deepEqual(updated.filters, {});
});

test("saving an installed registry source preserves its explicit identity and filters", () => {
  const filters = { age_groups: ["20-24"], start_year: 2022, end_year: 2024 };
  const updated = updateSourceConfig(undefined, {
    kind: "registry",
    name: "現住人口之年齡分配",
    enabled: true,
    autoClean: true,
    registrySourceId: REGISTRY_SOURCE_ID,
    filters,
  });

  assert.equal(updated.registrySourceId, REGISTRY_SOURCE_ID);
  assert.deepEqual(updated.filters, filters);
  assert.notEqual(updated.filters, filters);
});

test("workspace cloning independently copies source, analysis, messages, and drafts", () => {
  const original = workspaceFixture();
  const before = structuredClone(original);
  const clones = original.map(cloneWorkspaceNode);
  for (let index = 0; index < original.length; index += 1) {
    const node = original[index];
    assert.deepEqual(clones[index], {
      ...node,
      source: node.source,
      result: node.result,
      assistant: node.assistant,
    });
  }

  clones[0].source.filters.age_groups.push("25-29");
  clones[2].result.sourceNodeIds.pop();
  clones[3].assistant.messages[0].content = "副本對話";
  clones[3].assistant.draftActions[0].sourceNodeIds.pop();
  clones[4].result.sourceModuleIds.pop();
  assert.deepEqual(original, before);
  assert.equal(Object.hasOwn(clones[2].result, "sourceIds"), false);
  assert.equal(Object.hasOwn(clones[3].assistant.draftActions[0], "sourceIds"), false);
});

test("duplicating a notebook remaps only canvas links and drops dangling references", () => {
  const original = workspaceFixture();
  original[2].result.sourceNodeIds.push("missing-source-node");
  original[3].assistant.draftActions[0].sourceNodeIds.push("missing-source-node");
  const before = structuredClone(original);
  const duplicate = duplicateWorkspaceNodes(original);
  const originalIds = new Set(original.map(node => node.id));
  const duplicateIds = duplicate.map(node => node.id);

  assert.equal(new Set(duplicateIds).size, duplicate.length);
  assert.ok(duplicateIds.every(id => !originalIds.has(id)));
  assert.deepEqual(duplicate[2].result.sourceNodeIds, duplicateIds.slice(0, 2));
  assert.deepEqual(duplicate[3].assistant.draftActions[0].sourceNodeIds, duplicateIds.slice(0, 2));
  assert.deepEqual(duplicate[4].result.sourceModuleIds, [duplicateIds[2]]);
  assert.notEqual(duplicate[3].assistant.messages[0].id, original[3].assistant.messages[0].id);
  assert.notEqual(duplicate[3].assistant.draftActions[0].id, original[3].assistant.draftActions[0].id);
  for (const index of [0, 1]) {
    assert.equal(duplicate[index].source.registrySourceId, REGISTRY_SOURCE_ID);
    assert.deepEqual(duplicate[index].source.filters, original[index].source.filters);
  }
  duplicate[0].source.filters.nested.values[2].label = "副本資料";
  duplicate[2].result.sourceNodeIds.pop();
  duplicate[3].assistant.draftActions[0].sourceNodeIds.pop();
  duplicate[4].result.sourceModuleIds.pop();
  assert.deepEqual(original, before);
  assert.equal(duplicate[1].source.filters.nested.values[2].label, "原始值");
});

test("deleting one canvas source leaves its same-registry sibling and links intact", () => {
  const original = workspaceFixture();
  const before = structuredClone(original);
  const remaining = removeSourceNode(original, "source-node-a");

  assert.deepEqual(
    remaining.map(node => node.id),
    ["source-node-b", "result-node", "assistant-node", "presentation-node"],
  );
  assert.equal(remaining[0].source.registrySourceId, REGISTRY_SOURCE_ID);
  assert.deepEqual(remaining[1].result.sourceNodeIds, ["source-node-b"]);
  assert.deepEqual(remaining[2].assistant.draftActions[0].sourceNodeIds, ["source-node-b"]);
  assert.deepEqual(original, before);
  assert.deepEqual(removeSourceNode(original, REGISTRY_SOURCE_ID), original);
});

test("deleting an analysis result also removes presentation dependencies", () => {
  const original = workspaceFixture();
  const before = structuredClone(original);
  const remaining = removeResultNode(original, "result-node");

  assert.equal(remaining.some(node => node.id === "result-node"), false);
  assert.deepEqual(remaining.find(node => node.id === "presentation-node").result.sourceModuleIds, []);
  assert.deepEqual(original, before);
});

test("radar signature tracks registry binding and nested filter changes", () => {
  const original = workspaceFixture();
  const baseline = getPolicyRadarWorkspaceSignature(original);
  const changedBinding = original.map(cloneWorkspaceNode);
  changedBinding[0].source.registrySourceId = "ntpc_unemployment_by_age_sex";
  assert.notEqual(getPolicyRadarWorkspaceSignature(changedBinding), baseline);

  const changedFilters = original.map(cloneWorkspaceNode);
  changedFilters[0].source.filters.nested.values[2].label = "篩選條件變更";
  assert.notEqual(getPolicyRadarWorkspaceSignature(changedFilters), baseline);

  const changedLinks = original.map(cloneWorkspaceNode);
  changedLinks[2].result.sourceNodeIds.pop();
  assert.notEqual(getPolicyRadarWorkspaceSignature(changedLinks), baseline);

  const changedModuleLinks = original.map(cloneWorkspaceNode);
  changedModuleLinks[4].result.sourceModuleIds.pop();
  assert.notEqual(getPolicyRadarWorkspaceSignature(changedModuleLinks), baseline);
});

test("radar signature ignores canvas coordinates, node ordering, and assistant-only edits", () => {
  const original = workspaceFixture();
  const before = structuredClone(original);
  const baseline = getPolicyRadarWorkspaceSignature(original);
  const changed = original.map(cloneWorkspaceNode).reverse();
  for (const node of changed) {
    node.x += 100;
    node.y -= 50;
    if (node.assistant) {
      node.assistant.name = "重新命名小幫手";
      node.assistant.messages[0].content = "另一個問題";
      node.assistant.draftActions[0].sourceNodeIds = [];
    }
  }
  assert.equal(getPolicyRadarWorkspaceSignature(changed), baseline);
  assert.deepEqual(original, before);
});
