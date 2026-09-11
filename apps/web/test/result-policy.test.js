import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const { outputText } = ts.transpileModule(
  readFileSync(new URL('../src/app/result-policy.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
);
const { createChartDraftActions, createGuidedChartResult, getChartDraftActions, usesRawSourceInputs } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('guided source action creates one configured chart without executing it', () => {
  assert.deepEqual(createGuidedChartResult('source-node-a', '板橋青年人口'), {
    kind: 'chart',
    name: '板橋青年人口趨勢分析',
    sourceNodeIds: ['source-node-a'],
    prompt: '整理「板橋青年人口」的主要變化與政策洞察，並清楚標示資料限制與來源。',
  });
  assert.equal(createGuidedChartResult('source-node-a', '   ').name, '資料來源趨勢分析');
});

test('raw sources create one single-source chart draft each', () => {
  const sources = ['source-node-a', 'source-node-b'];
  const actions = createChartDraftActions('draft-1', '請分析並製作簡報', sources);
  assert.equal(actions.length, 2);
  assert.deepEqual(actions.map(action => action.kind), ['chart', 'chart']);
  assert.deepEqual(actions.map(action => action.sourceNodeIds), [['source-node-a'], ['source-node-b']]);
  actions[0].sourceNodeIds.pop();
  assert.equal(sources.length, 2);
});

test('duplicate source IDs do not create duplicate chart drafts', () => {
  const actions = createChartDraftActions('draft-1', '分析', ['source-node-a', 'source-node-a']);
  assert.equal(actions.length, 1);
  assert.deepEqual(actions[0].sourceNodeIds, ['source-node-a']);
});

test('no sources produces no executable draft', () => {
  assert.deepEqual(createChartDraftActions('draft-1', '做簡報', []), []);
});

test('old mixed drafts cannot execute presentation actions', () => {
  const chart = { kind: 'chart', sourceNodeIds: ['source-node'] };
  const presentation = { kind: 'presentation', sourceNodeIds: ['source-node'] };
  const original = [presentation, chart];
  assert.deepEqual(getChartDraftActions(original), [chart]);
  assert.deepEqual(getChartDraftActions([presentation]), []);
  assert.equal(original.length, 2);
});

test('legacy presentation cards do not consume raw-source connections', () => {
  assert.equal(usesRawSourceInputs({ kind: 'presentation', sourceNodeIds: ['source-node'] }), false);
  assert.equal(usesRawSourceInputs({ kind: 'chart', sourceNodeIds: ['source-node'] }), true);
  assert.equal(usesRawSourceInputs({ kind: null, sourceNodeIds: [] }), true);
});
