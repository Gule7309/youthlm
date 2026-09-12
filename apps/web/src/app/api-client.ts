import type {
  AnalysisRequestPayload,
  AssistantRequestPayload,
  PresentationArtifactView,
  PresentationRequestPayload,
  ReportArtifactView,
  ReportRequestPayload,
  RegistryDataSource,
} from './types';

type Fetcher = typeof fetch;
export type RequestOptions = { signal?: AbortSignal; timeoutMs?: number };
export type AnalysisHttpResult = { httpStatus: number; payload: Record<string, unknown> };

function apiBaseUrl() {
  return import.meta.env.VITE_YOUTHLM_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '';
}

function normalizeBaseUrl(base: string) {
  if (!base) return '';
  const url = new URL(base);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('API 位址必須是沒有帳密、查詢參數或錨點的 HTTP(S) 網址。');
  }
  return url.href.replace(/\/+$/, '');
}

// Includes reading the response body in the timeout; never automatically repeats POSTs.
async function withRequest<T>(
  url: string, init: RequestInit, read: (response: Response) => Promise<T>,
  fetcher: Fetcher, { signal, timeoutMs = 120_000 }: RequestOptions,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  try {
    return await read(await fetcher(url, { ...init, signal: controller.signal, redirect: 'error' }));
  } catch (error) {
    if (timedOut) throw new Error('請求逾時，請稍後重試。後端可能仍在處理這次工作。');
    if (controller.signal.aborted) throw new Error('已停止等待；後端可能仍在處理這次工作。');
    if (error instanceof TypeError) throw new Error('無法連線至後端，請確認 API 已啟動及網路／跨來源設定後重試。');
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function readJson(response: Response): Promise<AnalysisHttpResult> {
  let payload: unknown;
  try { payload = await response.json(); }
  catch { throw new Error(`後端回傳非 JSON 資料（HTTP ${response.status}），請確認 API 與代理設定。`); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`後端回應格式不正確（HTTP ${response.status}）。`);
  }
  if (!response.ok && !Object.hasOwn(payload, 'error')) {
    throw new Error(`後端無法處理這次請求（HTTP ${response.status}），請確認服務狀態與請求設定。`);
  }
  const error = (payload as Record<string, unknown>).error;
  if (error && typeof error === 'object' && !Array.isArray(error)) {
    const detail = error as Record<string, unknown>;
    const errorDetails = detail.details && typeof detail.details === 'object' && !Array.isArray(detail.details)
      ? detail.details as Record<string, unknown>
      : undefined;
    const messages: Record<string, string> = {
      'Model provider is not configured': '後端尚未設定模型服務。請由後端同學設定模型供應商與金鑰後再試；目錄讀取正常不代表 AI 已就緒。',
      'Model provider request failed': '模型服務暫時無法使用，請確認後端模型權限、配額與連線後重試。',
      'Agent could not complete the analysis in time': '小幫手未能在限制內完成分析，請縮小問題或資料範圍後重試。',
      'Agent returned an invalid analysis result': '後端分析結果不符合契約，請交由後端同學檢查執行紀錄；未顯示不可靠的結果。',
      'Contract v0 supports one raw source per analysis module': '目前每張圖表只支援一個資料來源；請分開建立分析圖表，再由簡報彙整多份成果。',
      'Module context storage failed': '後端無法保存分析成果，請確認資料庫路徑與寫入權限。',
      'Presentation generation failed': '後端簡報生成失敗，請確認分析成果與輸出目錄後重試。',
    };
    if (detail.message === 'Selected source filters cannot be queried safely') {
      detail.message = typeof errorDetails?.reason === 'string' && errorDetails.reason.includes('official 2013 5-9')
        ? '此範圍包含官方已知異常：2013 年樹林區、鶯歌區或汐止區的 5–9 歲資料無法安全使用。YouthLM 保留官方原值且不自行補值；請移除該年度、年齡或受影響行政區後重試。'
        : '所選資料範圍無法安全查詢，請檢查年份、年齡、性別與地區篩選後重試。';
    } else if (typeof detail.message === 'string' && messages[detail.message]) {
      detail.message = messages[detail.message];
    }
  }
  return { httpStatus: response.status, payload: payload as Record<string, unknown> };
}

export async function listDataSources(fetcher: Fetcher = fetch, baseUrl = apiBaseUrl()): Promise<RegistryDataSource[]> {
  const { payload, httpStatus } = await withRequest(`${normalizeBaseUrl(baseUrl)}/v1/data-sources`, {}, readJson, fetcher, { timeoutMs: 15_000 });
  if (httpStatus >= 400 || !Array.isArray(payload.sources)) throw new Error('後端來源目錄格式不正確。');
  return payload.sources as RegistryDataSource[];
}

export function runAnalysis(request: AnalysisRequestPayload, fetcher: Fetcher = fetch, baseUrl = apiBaseUrl(), options: RequestOptions = {}) {
  return withRequest(`${normalizeBaseUrl(baseUrl)}/v1/analysis`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  }, readJson, fetcher, options);
}

export function createPresentation(request: PresentationRequestPayload, fetcher: Fetcher = fetch, baseUrl = apiBaseUrl(), options: RequestOptions = {}) {
  return withRequest(`${normalizeBaseUrl(baseUrl)}/v1/presentations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  }, readJson, fetcher, options);
}

export function runAssistant(
  request: AssistantRequestPayload,
  fetcher: Fetcher = fetch,
  baseUrl = apiBaseUrl(),
  options: RequestOptions = {},
) {
  return withRequest(`${normalizeBaseUrl(baseUrl)}/v1/assistant`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  }, readJson, fetcher, options);
}

export function createReport(
  request: ReportRequestPayload,
  fetcher: Fetcher = fetch,
  baseUrl = apiBaseUrl(),
  options: RequestOptions = {},
) {
  return withRequest(`${normalizeBaseUrl(baseUrl)}/v1/reports`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
  }, readJson, fetcher, options);
}

export function resolveApiUrl(path: string, baseUrl = apiBaseUrl()) {
  // Only project-scoped Contract v0 artifact routes are allowed. Reject
  // absolute URLs, backslashes, encoded traversal, query strings, and hashes.
  if (!/^\/v1\/projects\/[A-Za-z0-9_-]+\/(?:presentations|reports)\/[A-Za-z0-9_-]+\/download$/.test(path)) {
    throw new Error('Artifact download URL must be relative and project-scoped.');
  }
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

export async function downloadPresentation(
  view: Extract<PresentationArtifactView, { kind: 'ready' }>,
  fetcher: Fetcher = fetch, baseUrl = apiBaseUrl(), options: RequestOptions = {},
): Promise<Blob> {
  const expected = `/v1/projects/${view.projectId}/presentations/${view.presentationId}/download`;
  if (view.downloadUrl !== expected) throw new Error('簡報下載位址與成果身分不符，請重新產生簡報。');
  return withRequest(resolveApiUrl(view.downloadUrl, baseUrl), {}, async response => {
    if (!response.ok) throw new Error(`簡報下載失敗（HTTP ${response.status}）。若檔案已移除，請重新產生簡報。`);
    const blob = await response.blob();
    if (blob.size !== view.fileSizeBytes) throw new Error('下載檔案大小不符，請重試下載。');
    const bytes = await blob.arrayBuffer();
    if (new Uint8Array(bytes)[0] !== 0x50 || new Uint8Array(bytes)[1] !== 0x4b) throw new Error('下載內容不是有效的 PPTX 檔案。');
    if (!globalThis.crypto?.subtle) throw new Error('此環境無法驗證檔案，請使用 localhost 或 HTTPS 網站。');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== view.artifactSha256.toLowerCase()) throw new Error('下載檔案驗證失敗（SHA-256 不符），請重試下載。');
    return blob;
  }, fetcher, { timeoutMs: 60_000, ...options });
}

export async function downloadReport(
  view: Extract<ReportArtifactView, { kind: 'ready' }>,
  fetcher: Fetcher = fetch, baseUrl = apiBaseUrl(), options: RequestOptions = {},
): Promise<Blob> {
  const expected = `/v1/projects/${view.projectId}/reports/${view.reportId}/download`;
  if (view.downloadUrl !== expected) throw new Error('報告下載位址與成果身分不符，請重新產生報告。');
  return withRequest(resolveApiUrl(view.downloadUrl, baseUrl), {}, async response => {
    if (!response.ok) throw new Error(`報告下載失敗（HTTP ${response.status}）。若檔案已移除，請重新產生報告。`);
    const blob = await response.blob();
    if (blob.size !== view.fileSizeBytes) throw new Error('下載檔案大小不符，請重試下載。');
    const bytes = await blob.arrayBuffer();
    if (new Uint8Array(bytes)[0] !== 0x50 || new Uint8Array(bytes)[1] !== 0x4b) throw new Error('下載內容不是有效的 DOCX 檔案。');
    if (!globalThis.crypto?.subtle) throw new Error('此環境無法驗證檔案，請使用 localhost 或 HTTPS 網站。');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== view.artifactSha256.toLowerCase()) throw new Error('下載檔案驗證失敗（SHA-256 不符），請重試下載。');
    return blob;
  }, fetcher, { timeoutMs: 60_000, ...options });
}
