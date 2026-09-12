import assert from 'node:assert/strict';
import test from 'node:test';

import { loadTs } from './load-ts.js';

const {
  CONNECTION_COLORS,
  buildConnectionPath,
  canvasPointFromClient,
  connectCanvasNodes,
  connectionHandleKey,
  connectionKindBetween,
  connectionPortPoint,
  getFitCanvasTransform,
  isPointNearRect,
  outputConnectionKind,
} = await loadTs('../src/app/canvas-connections.ts');

const source = (id) => ({ id, type: 'source', x: 0, y: 0, source: { kind: 'registry', name: id, enabled: true } });
const result = (id, kind = null, extra = {}) => ({
  id,
  type: 'result',
  x: 400,
  y: 0,
  result: {
    kind,
    name: id,
    sourceNodeIds: [],
    prompt: '',
    ...(kind === 'presentation' ? { sourceModuleIds: [] } : {}),
    ...extra,
  },
});

test('only sources and chart results expose output connection kinds', () => {
  assert.equal(outputConnectionKind(source('s')), 'source');
  assert.equal(outputConnectionKind(result('c', 'chart')), 'analysis');
  assert.equal(outputConnectionKind(result('p', 'presentation')), null);
  assert.equal(outputConnectionKind(result('empty')), null);
});

test('source connects to an empty result as a single-source chart', () => {
  const nodes = [source('s'), result('target')];
  const outcome = connectCanvasNodes(nodes, 's', 'target');

  assert.equal(outcome.status, 'connected');
  assert.equal(outcome.kind, 'source');
  assert.equal(outcome.nodes.find(node => node.id === 'target').result.kind, 'chart');
  assert.deepEqual(outcome.nodes.find(node => node.id === 'target').result.sourceNodeIds, ['s']);
  assert.equal(nodes[1].result.kind, null, 'input state remains immutable');
});

test('a new source replaces the chart source to preserve Contract v0', () => {
  const nodes = [
    source('old'),
    source('new'),
    result('chart', 'chart', { sourceNodeIds: ['old'], prompt: '分析' }),
  ];
  const outcome = connectCanvasNodes(nodes, 'new', 'chart');

  assert.equal(outcome.status, 'replaced');
  assert.deepEqual(outcome.nodes.find(node => node.id === 'chart').result.sourceNodeIds, ['new']);
  assert.equal(outcome.nodes.find(node => node.id === 'chart').result.prompt, '分析');
});

test('reconnecting an existing source is a no-op', () => {
  const nodes = [source('s'), result('chart', 'chart', { sourceNodeIds: ['s'] })];
  const outcome = connectCanvasNodes(nodes, 's', 'chart');

  assert.equal(outcome.status, 'duplicate');
  assert.equal(outcome.nodes, nodes);
});

test('chart results connect to presentations and can be appended', () => {
  const nodes = [
    result('chart-a', 'chart'),
    result('chart-b', 'chart'),
    result('deck', 'presentation', { sourceModuleIds: ['chart-a'] }),
  ];
  const outcome = connectCanvasNodes(nodes, 'chart-b', 'deck');

  assert.equal(outcome.status, 'connected');
  assert.equal(outcome.kind, 'analysis');
  assert.deepEqual(outcome.nodes.find(node => node.id === 'deck').result.sourceModuleIds, ['chart-a', 'chart-b']);
});

test('chart results connect to reports without changing their artifact kind', () => {
  const nodes = [
    result('chart-a', 'chart'),
    result('chart-b', 'chart'),
    result('report', 'report', { sourceModuleIds: ['chart-a'] }),
  ];
  const outcome = connectCanvasNodes(nodes, 'chart-b', 'report');

  assert.equal(outcome.status, 'connected');
  assert.equal(outcome.kind, 'analysis');
  assert.equal(outcome.nodes.find(node => node.id === 'report').result.kind, 'report');
  assert.deepEqual(outcome.nodes.find(node => node.id === 'report').result.sourceModuleIds, ['chart-a', 'chart-b']);
});

test('chart output turns an empty result into a presentation', () => {
  const nodes = [result('chart', 'chart'), result('target')];
  const outcome = connectCanvasNodes(nodes, 'chart', 'target');

  assert.equal(outcome.status, 'connected');
  assert.equal(outcome.nodes.find(node => node.id === 'target').result.kind, 'presentation');
  assert.deepEqual(outcome.nodes.find(node => node.id === 'target').result.sourceModuleIds, ['chart']);
  assert.deepEqual(outcome.nodes.find(node => node.id === 'target').result.sourceNodeIds, []);
});

test('invalid directions and incompatible result kinds are rejected', () => {
  const nodes = [source('s'), result('chart-a', 'chart'), result('chart-b', 'chart'), result('deck', 'presentation'), result('report', 'report')];

  assert.equal(connectionKindBetween(nodes, 's', 'deck'), null);
  assert.equal(connectionKindBetween(nodes, 's', 'report'), null);
  assert.equal(connectionKindBetween(nodes, 'chart-a', 'chart-b'), null);
  assert.equal(connectionKindBetween(nodes, 'deck', 'chart-a'), null);
  assert.equal(connectionKindBetween(nodes, 'chart-a', 'chart-a'), null);
  assert.equal(connectCanvasNodes(nodes, 's', 'deck').status, 'invalid');
});

test('client coordinates convert to world coordinates under pan and zoom', () => {
  assert.deepEqual(
    canvasPointFromClient({ x: 260, y: 190 }, { x: 10, y: 20 }, { x: 50, y: 30 }, 2),
    { x: 100, y: 70 },
  );
  assert.equal(connectionHandleKey('node-a', 'output'), 'node-a:output');
  assert.deepEqual(connectionPortPoint({ ...source('s'), x: 10, y: 20 }, 'output'), { x: 330, y: 128 });
  assert.deepEqual(connectionPortPoint({ ...result('r'), x: 400, y: 50 }, 'input'), { x: 400, y: 230 });
  assert.deepEqual(connectionPortPoint({ ...result('r'), x: 400, y: 50 }, 'output'), { x: 760, y: 230 });
  assert.equal(connectionPortPoint(source('s'), 'input'), null);
});

test('fit transform brings restored negative and offscreen card positions into the usable canvas', () => {
  const rects = [
    { x: 100, y: 200, width: 320, height: 216 },
    { x: 500, y: 200, width: 360, height: 360 },
    { x: 900, y: -180, width: 360, height: 360 },
  ];
  const transform = getFitCanvasTransform(rects, 1280, 720, 82, 82);
  assert.ok(transform);

  const screenRects = rects.map(rect => ({
    left: rect.x * transform.zoom + transform.pan.x,
    right: (rect.x + rect.width) * transform.zoom + transform.pan.x,
    top: rect.y * transform.zoom + transform.pan.y,
    bottom: (rect.y + rect.height) * transform.zoom + transform.pan.y,
  }));
  assert.ok(Math.min(...screenRects.map(rect => rect.left)) >= 82);
  assert.ok(Math.max(...screenRects.map(rect => rect.right)) <= 1280 - 82);
  assert.ok(Math.min(...screenRects.map(rect => rect.top)) >= 80);
  assert.ok(Math.max(...screenRects.map(rect => rect.bottom)) <= 720 - 80);
});

test('fit transform never magnifies a small workflow beyond 100 percent', () => {
  const transform = getFitCanvasTransform(
    [{ x: 100, y: 100, width: 320, height: 216 }],
    1280,
    720,
    82,
    82,
  );
  assert.equal(transform?.zoom, 1);
});

test('connection targets keep a screen-space drop margin at low canvas zoom', () => {
  const tinyHandle = { left: 100, right: 105, top: 200, bottom: 205 };
  assert.equal(isPointNearRect({ x: 82, y: 202 }, tinyHandle), true);
  assert.equal(isPointNearRect({ x: 127, y: 202 }, tinyHandle), true);
  assert.equal(isPointNearRect({ x: 128, y: 202 }, tinyHandle), false);
});

test('connection paths curve in the correct direction and colors match their handles', () => {
  assert.equal(buildConnectionPath({ x: 0, y: 10 }, { x: 200, y: 20 }), 'M 0 10 C 70 10, 130 20, 200 20');
  assert.equal(buildConnectionPath({ x: 200, y: 20 }, { x: 0, y: 10 }), 'M 200 20 C 130 20, 70 10, 0 10');
  assert.equal(CONNECTION_COLORS.source, '#2563eb');
  assert.equal(CONNECTION_COLORS.analysis, '#7c3aed');
});
