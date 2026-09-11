import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.js';
const { runAnalysis, createPresentation, downloadPresentation, resolveApiUrl } = await loadTs('../src/app/api-client.ts');
const ok = () => new Response(JSON.stringify({ status: 'completed' }));

test('canonical API env takes precedence, legacy env remains compatible', async () => {
  for (const [env, expected] of [[{}, '/v1/analysis'], [{ VITE_API_BASE_URL: 'http://legacy.test/' }, 'http://legacy.test/v1/analysis'],
    [{ VITE_API_BASE_URL: 'http://legacy.test', VITE_YOUTHLM_API_BASE_URL: 'https://api.test' }, 'https://api.test/v1/analysis']]) {
    const client = await loadTs('../src/app/api-client.ts', env);
    await client.runAnalysis({}, async url => { assert.equal(url, expected); return ok(); });
  }
});

test('offline, HTML proxy errors and framework errors have clear messages', async () => {
  await assert.rejects(runAnalysis({}, async () => { throw new TypeError('Failed to fetch'); }, ''), /無法連線至後端/);
  await assert.rejects(runAnalysis({}, async () => new Response('<html>gateway</html>', { status: 502 }), ''), /非 JSON.*502/);
  await assert.rejects(createPresentation({}, async () => new Response(JSON.stringify({ detail: 'missing' }), { status: 404 }), ''), /HTTP 404/);
});

test('timeout and cancellation do not retry expensive requests', async () => {
  let calls = 0;
  const pending = async (url, init) => {
    calls++;
    return new Promise((resolve, reject) => {
      if (init.signal.aborted) reject(new DOMException('Aborted', 'AbortError'));
      else init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    });
  };
  await assert.rejects(runAnalysis({}, pending, '', { timeoutMs: 10 }), /逾時/);
  assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createPresentation({}, pending, '', { signal: controller.signal }), /停止等待/);
  assert.equal(calls, 2);
});

test('missing model configuration is translated without falsely enabling retry', async () => {
  const response = await runAnalysis({}, async () => new Response(JSON.stringify({ error: {
    code: 'provider_unavailable', message: 'Model provider is not configured', retriable: false,
  } }), { status: 503 }), '');
  assert.match(response.payload.error.message, /後端尚未設定模型服務/);
  assert.equal(response.payload.error.retriable, false);
  assert.equal(response.payload.error.code, 'provider_unavailable');
});

test('known unsafe population cells have a specific Chinese refusal', async () => {
  const response = await runAnalysis({}, async () => new Response(JSON.stringify({ error: {
    code: 'dataset_error',
    message: 'Selected source filters cannot be queried safely',
    retriable: false,
    details: {
      reason: "The official 2013 5-9 age-group values are internally inconsistent for ['樹林區']. YouthLM does not invent corrected values.",
    },
  } }), { status: 422 }), '');
  assert.match(response.payload.error.message, /2013 年.*5–9 歲/);
  assert.match(response.payload.error.message, /保留官方原值且不自行補值/);
  assert.equal(response.payload.error.retriable, false);
});

test('download URLs cannot escape the API or contain credentials', () => {
  for (const path of ['https://evil.test/pptx', '//evil.test/x', '/\\evil.test/x', '/v1/projects/../presentations/id/download', '/v1/projects/%2e%2e/presentations/id/download', '/v1/projects/id/presentations/id/download?redirect=x']) {
    assert.throws(() => resolveApiUrl(path, ''), /must be relative/);
  }
  assert.throws(() => resolveApiUrl('/v1/projects/p/presentations/id/download', 'http://name:password@api.test'), /API 位址/);
});

test('PPTX download validates endpoint, size, signature, hash and HTTP failures', async () => {
  const bytes = new Uint8Array([0x50, 0x4b, 3, 4, 0, 0]);
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
  const view = { kind: 'ready', projectId: 'p', presentationId: 'id', downloadUrl: '/v1/projects/p/presentations/id/download', fileSizeBytes: bytes.length, artifactSha256: hash };
  const fetcher = async () => new Response(bytes);
  assert.equal((await downloadPresentation(view, fetcher, '')).size, bytes.length);
  await assert.rejects(downloadPresentation({ ...view, projectId: 'wrong' }, fetcher, ''), /身分不符/);
  await assert.rejects(downloadPresentation({ ...view, fileSizeBytes: 99 }, fetcher, ''), /大小不符/);
  await assert.rejects(downloadPresentation({ ...view, artifactSha256: '0'.repeat(64) }, fetcher, ''), /SHA-256 不符/);
  await assert.rejects(downloadPresentation(view, async () => new Response('abcdef'), ''), /不是有效/);
  await assert.rejects(downloadPresentation(view, async () => new Response('', { status: 404 }), ''), /HTTP 404/);
});
