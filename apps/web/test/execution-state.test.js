import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.js';
const { RequestGate, resultInputSignature } = await loadTs('../src/app/execution-state.ts');
const { buildPresentationRequest } = await loadTs('../src/app/presentation-integration.ts');
const nodes = [
  { id: 's', type: 'source', x: 0, y: 0, source: { kind: 'registry', registrySourceId: 'dataset', filters: { start_year: 2023 } } },
  { id: 'a', type: 'result', x: 0, y: 0, result: { kind: 'chart', name: 'chart', prompt: 'query', sourceNodeIds: ['s'] } },
  { id: 'p', type: 'result', x: 0, y: 0, result: { kind: 'presentation', name: 'deck', prompt: '', sourceNodeIds: [], sourceModuleIds: ['a'] } },
];
const analysis = { state: 'ready', projectId: 'project', moduleId: 'run_2', view: { kind: 'chart', status: 'partial' } };

test('retry, cancel and session exit reject stale request completions', () => {
  const gate = new RequestGate();
  const old = gate.begin('a');
  const latest = gate.begin('a');
  assert.equal(old.signal.aborted, true);
  gate.finish('a', old);
  assert.equal(gate.isCurrent('a', latest), true);
  const other = gate.begin('b');
  gate.cancel('a');
  assert.equal(gate.isCurrent('a', latest), false);
  assert.equal(gate.isCurrent('b', other), true);
  gate.cancelAll();
  assert.equal(other.signal.aborted, true);
});

test('card movement keeps analysis; source filters, removal and prompts invalidate it', () => {
  const before = resultInputSignature('a', nodes);
  const moved = structuredClone(nodes); moved[0].x += 500;
  assert.equal(resultInputSignature('a', moved), before);
  moved[0].source.filters.start_year = 2024;
  assert.notEqual(resultInputSignature('a', moved), before);
  assert.notEqual(resultInputSignature('a', nodes.slice(1)), before);
  const edited = structuredClone(nodes); edited[1].result.prompt = 'new query';
  assert.notEqual(resultInputSignature('a', edited), before);
});

test('presentation invalidates when upstream analysis reruns or loses readiness', () => {
  const before = resultInputSignature('p', nodes, { a: analysis });
  assert.notEqual(resultInputSignature('p', nodes, { a: { ...analysis, moduleId: 'run_3' } }), before);
  assert.notEqual(resultInputSignature('p', nodes, {}), before);
});

test('report uses generated-artifact dependencies in its input signature', () => {
  const reportNodes = nodes.map(node => node.id === 'p'
    ? { ...node, result: { ...node.result, kind: 'report' } }
    : node);
  const analyses = { a: analysis };
  const before = resultInputSignature('p', reportNodes, analyses);
  const rerun = { a: { ...analysis, moduleId: 'analysis-a-rerun' } };
  assert.notEqual(resultInputSignature('p', reportNodes, rerun), before);
});

test('presentation sends successful backend run IDs, never Canvas card IDs', () => {
  const request = buildPresentationRequest({ projectId: 'project', result: nodes[2].result, analyses: { a: analysis } });
  assert.deepEqual(request.source_module_ids, ['run_2']);
  for (const change of [{ state: 'running' }, { projectId: 'wrong' }, { moduleId: undefined }, { view: { kind: 'blocked', status: 'blocked' } }]) {
    assert.throws(() => buildPresentationRequest({ projectId: 'project', result: nodes[2].result, analyses: { a: { ...analysis, ...change } } }), /尚未完成或已過期/);
  }
});
