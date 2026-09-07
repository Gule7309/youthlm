import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const { outputText } = ts.transpileModule(
  readFileSync(new URL('../src/app/result-policy.ts', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
);
const { createChartDraftActions, getChartDraftActions, usesRawSourceInputs } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('raw sources create one chart draft even when the prompt requests a presentation', () => {
  const sources = ['source-node-a', 'source-node-b'];
  const actions = createChartDraftActions('draft-1', '請分析並製作簡報', sources);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].kind, 'chart');
  assert.deepEqual(actions[0].sourceNodeIds, sources);
  actions[0].sourceNodeIds.pop();
  assert.equal(sources.length, 2);
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
