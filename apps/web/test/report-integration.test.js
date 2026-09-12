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
  buildReportArtifactView,
  buildReportRequest,
} = await loadTypeScriptModule('../src/app/report-integration.ts');
const { createReport, resolveApiUrl } = await loadTypeScriptModule('../src/app/api-client.ts');

function fixture(name) {
  const url = new URL(`../../../contracts/fixtures/frontend-integration/${name}`, import.meta.url);
  return JSON.parse(readFileSync(url, 'utf8'));
}

test('Report Result config maps to the standalone Contract v0 request', () => {
  const request = buildReportRequest({
    projectId: 'project_1',
    result: {
      kind: 'report',
      name: '板橋區青年人口議題研析報告',
      sourceNodeIds: [],
      sourceModuleIds: ['analysis_1'],
      prompt: '以政策研析格式整理，保留資料限制、來源與版本。',
    },
  });

  assert.deepEqual(request, fixture('report-request.example.json'));
  assert.equal(Object.hasOwn(request, 'result_data'), false);
  assert.equal(Object.hasOwn(request, 'source_selections'), false);
});

test('ready ReportResult preserves file, warning, and download metadata', () => {
  const view = buildReportArtifactView(fixture('report-result.example.json'));

  assert.equal(view.kind, 'ready');
  assert.equal(view.fileName, 'report_1.docx');
  assert.equal(view.sourceModuleIds[0], 'analysis_1');
  assert.equal(view.warnings[0].type, 'age_mismatch');
  assert.equal(view.downloadUrl, '/v1/projects/project_1/reports/report_1/download');
});

test('report errors remain explicit and retriable', () => {
  const view = buildReportArtifactView({
    contract_version: '0.1.0',
    error: {
      code: 'internal_error',
      message: 'Report generation failed',
      retriable: true,
    },
  }, { httpStatus: 500 });

  assert.deepEqual(view, {
    kind: 'error',
    httpStatus: 500,
    code: 'internal_error',
    message: 'Report generation failed',
    retriable: true,
    details: {},
  });
});

test('HTTP client posts the exact report request and resolves download URL', async () => {
  const request = fixture('report-request.example.json');
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(fixture('report-result.example.json')), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const response = await createReport(request, fakeFetch, 'http://api.test');

  assert.equal(calls[0].url, 'http://api.test/v1/reports');
  assert.equal(calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].init.body), request);
  assert.equal(response.httpStatus, 201);
  assert.equal(
    resolveApiUrl('/v1/projects/project_1/reports/report_1/download', 'http://api.test'),
    'http://api.test/v1/projects/project_1/reports/report_1/download',
  );
});
