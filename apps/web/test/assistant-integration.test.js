import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function loadTypeScriptModule(relativePath) {
  const moduleUrl = new URL(relativePath, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(moduleUrl, 'utf8'), {
    fileName: moduleUrl.pathname,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const {
  buildAssistantContextOptions,
  buildAssistantRequest,
  buildAssistantResultView,
} = await loadTypeScriptModule('../src/app/assistant-integration.ts');
const { runAssistant } = await loadTypeScriptModule('../src/app/api-client.ts');

function fixture(name) {
  const url = new URL(`../../../contracts/fixtures/frontend-integration/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

const sourceNode = {
  id: 'canvas-source-1',
  type: 'source',
  x: 100,
  y: 100,
  source: {
    kind: 'registry',
    name: '新北失業率',
    enabled: true,
    autoClean: true,
    registrySourceId: 'ntpc_unemployment_by_age_sex',
    filters: {
      age_groups: ['25-29'],
      sexes: ['male'],
      start_year: 2022,
      end_year: 2024,
    },
  },
};

const analysisNode = {
  id: 'analysis_1',
  type: 'result',
  x: 500,
  y: 100,
  result: {
    kind: 'chart',
    name: '青年失業率趨勢',
    sourceNodeIds: ['canvas-source-1'],
    prompt: '分析趨勢',
  },
};

const presentationNode = {
  id: 'canvas-presentation-1',
  type: 'result',
  x: 900,
  y: 100,
  result: {
    kind: 'presentation',
    name: '青年失業率簡報',
    sourceNodeIds: [],
    sourceModuleIds: ['analysis_1'],
    prompt: '',
  },
};

function readyAnalysis() {
  return {
    state: 'ready',
    view: { kind: 'chart', status: 'partial' },
  };
}

function readyPresentation() {
  return {
    state: 'ready',
    view: {
      kind: 'ready',
      presentationId: 'presentation_1',
      title: '青年失業率簡報',
    },
  };
}

test('Canvas sources and ready artifacts map to explicit Assistant context options', () => {
  const options = buildAssistantContextOptions({
    nodes: [sourceNode, analysisNode, presentationNode],
    analysisExecutions: { analysis_1: readyAnalysis() },
    presentationExecutions: { 'canvas-presentation-1': readyPresentation() },
  });

  assert.deepEqual(options.map(option => [option.canvasNodeId, option.kind, option.referenceId]), [
    ['canvas-source-1', 'source', 'ntpc_unemployment_by_age_sex'],
    ['analysis_1', 'analysis', 'analysis_1'],
    ['canvas-presentation-1', 'presentation', 'presentation_1'],
  ]);
  assert.equal(options[0].filters.start_year, 2022);
});

test('unfinished analysis and presentation never become reference options', () => {
  const options = buildAssistantContextOptions({
    nodes: [sourceNode, analysisNode, presentationNode],
    analysisExecutions: { analysis_1: { state: 'running' } },
    presentationExecutions: {},
  });

  assert.deepEqual(options.map(option => option.kind), ['source']);
});

test('Assistant request preserves backend identities and excludes Canvas state', () => {
  const options = buildAssistantContextOptions({
    nodes: [sourceNode, analysisNode, presentationNode],
    analysisExecutions: { analysis_1: readyAnalysis() },
    presentationExecutions: { 'canvas-presentation-1': readyPresentation() },
  });
  const request = buildAssistantRequest({
    projectId: 'project_1',
    assistantId: 'assistant_1',
    message: '  比較這份分析與簡報內容，哪些限制需要提醒決策者？  ',
    selectedContextNodeIds: options.map(option => option.canvasNodeId),
    contextOptions: options,
  });

  assert.deepEqual(request, fixture('assistant-request.example.json'));
  assert.equal(JSON.stringify(request).includes('canvas-source-1'), false);
  assert.equal(JSON.stringify(request).includes('canvas-presentation-1'), false);
  assert.equal(JSON.stringify(request).includes('"x"'), false);
  assert.equal(JSON.stringify(request).includes('"y"'), false);
});

test('Assistant request refuses selected artifacts that are no longer ready', () => {
  assert.throws(() => buildAssistantRequest({
    projectId: 'project_1',
    assistantId: 'assistant_1',
    message: '分析限制',
    selectedContextNodeIds: ['analysis_1'],
    contextOptions: [],
  }), /引用尚未完成/);
});

test('Assistant result preserves grounded references and safe tool trace', () => {
  const view = buildAssistantResultView(fixture('assistant-result.example.json'));

  assert.equal(view.kind, 'completed');
  assert.equal(view.answer, '這份分析與簡報只涵蓋25至29歲男性，不能代表完整18至35歲青年；資料為年度統計，最新年度為2024年。');
  assert.equal(view.resolvedReferences[1].referenceId, 'analysis_1');
  assert.deepEqual(view.toolExecutions, []);
});

test('Assistant HTTP errors remain explicit and retriable', () => {
  const view = buildAssistantResultView({
    contract_version: '0.1.0',
    error: {
      code: 'provider_unavailable',
      message: 'Model provider request failed',
      retriable: true,
    },
  }, { httpStatus: 502 });

  assert.deepEqual(view, {
    kind: 'error',
    httpStatus: 502,
    code: 'provider_unavailable',
    message: 'Model provider request failed',
    retriable: true,
    details: {},
  });
});

test('HTTP client posts the exact Assistant request', async () => {
  const request = fixture('assistant-request.example.json');
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(fixture('assistant-result.example.json')), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const response = await runAssistant(request, fakeFetch, 'http://api.test');

  assert.equal(calls[0].url, 'http://api.test/v1/assistant');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), request);
  assert.equal(response.httpStatus, 200);
});
