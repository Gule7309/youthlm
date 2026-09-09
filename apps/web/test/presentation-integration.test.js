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
  buildPresentationArtifactView,
  buildPresentationRequest,
} = await loadTypeScriptModule('../src/app/presentation-integration.ts');
const { createPresentation, resolveApiUrl } =
  await loadTypeScriptModule('../src/app/api-client.ts');

function fixture(name) {
  const url = new URL(`../../../contracts/examples/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

test('Presentation Result config maps to the standalone Contract v0 request', () => {
  const request = buildPresentationRequest({
    projectId: 'project_1',
    result: {
      kind: 'presentation',
      name: '板橋區青年人口趨勢',
      sourceNodeIds: [],
      sourceModuleIds: ['analysis_1'],
      prompt: '使用清楚的政策簡報語氣，保留所有資料限制與來源。',
    },
  });

  assert.deepEqual(request, {
    contract_version: '0.1.0',
    project_id: 'project_1',
    source_module_ids: ['analysis_1'],
    title: '板橋區青年人口趨勢',
    language: 'zh-TW',
    template_id: 'youthlm_default',
    output_format: 'pptx',
    instructions: '使用清楚的政策簡報語氣，保留所有資料限制與來源。',
  });
  assert.equal(Object.hasOwn(request, 'result_data'), false);
  assert.equal(Object.hasOwn(request, 'source_selections'), false);
});

test('ready PresentationResult preserves file, warning, and download metadata', () => {
  const view = buildPresentationArtifactView(fixture('presentation-result.json'));

  assert.equal(view.kind, 'ready');
  assert.equal(view.fileName, 'banqiao-youth-population.pptx');
  assert.equal(view.sourceModuleIds[0], 'analysis_1');
  assert.equal(view.warnings[0].type, 'age_mismatch');
  assert.equal(
    view.downloadUrl,
    '/v1/projects/project_1/presentations/presentation_1/download',
  );
});

test('presentation errors remain explicit and retriable', () => {
  const view = buildPresentationArtifactView({
    contract_version: '0.1.0',
    error: {
      code: 'presentation_generation_failed',
      message: 'Presentation generation failed',
      retriable: true,
    },
  }, { httpStatus: 500 });

  assert.deepEqual(view, {
    kind: 'error',
    httpStatus: 500,
    code: 'presentation_generation_failed',
    message: 'Presentation generation failed',
    retriable: true,
    details: {},
  });
});

test('HTTP client posts the exact presentation request and resolves download URL', async () => {
  const request = fixture('presentation-request.json');
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(fixture('presentation-result.json')), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const response = await createPresentation(request, fakeFetch, 'http://api.test');

  assert.equal(calls[0].url, 'http://api.test/v1/presentations');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), request);
  assert.equal(response.httpStatus, 201);
  assert.equal(
    resolveApiUrl('/v1/projects/project_1/presentations/presentation_1/download', 'http://api.test'),
    'http://api.test/v1/projects/project_1/presentations/presentation_1/download',
  );
  assert.throws(() => resolveApiUrl('https://evil.test/file.pptx', ''), /must be relative/);
});
