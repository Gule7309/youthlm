import type {
  AnalysisRequestPayload,
  PresentationRequestPayload,
  RegistryDataSource,
} from './types';

type Fetcher = typeof fetch;

export type AnalysisHttpResult = {
  httpStatus: number;
  payload: Record<string, unknown>;
};

function apiBaseUrl() {
  return (import.meta.env.VITE_YOUTHLM_API_BASE_URL ?? '').replace(/\/$/, '');
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('YouthLM API returned an invalid JSON object');
  }
  return payload as Record<string, unknown>;
}

export async function listDataSources(
  fetcher: Fetcher = fetch,
  baseUrl = apiBaseUrl(),
): Promise<RegistryDataSource[]> {
  const response = await fetcher(`${baseUrl}/v1/data-sources`);
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(`YouthLM data source request failed (${response.status})`);
  }
  if (!Array.isArray(payload.sources)) {
    throw new Error('YouthLM data source response has no sources array');
  }
  return payload.sources as RegistryDataSource[];
}

export async function runAnalysis(
  request: AnalysisRequestPayload,
  fetcher: Fetcher = fetch,
  baseUrl = apiBaseUrl(),
): Promise<AnalysisHttpResult> {
  const response = await fetcher(`${baseUrl}/v1/analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return {
    httpStatus: response.status,
    payload: await readJson(response),
  };
}

export async function createPresentation(
  request: PresentationRequestPayload,
  fetcher: Fetcher = fetch,
  baseUrl = apiBaseUrl(),
): Promise<AnalysisHttpResult> {
  const response = await fetcher(`${baseUrl}/v1/presentations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  return {
    httpStatus: response.status,
    payload: await readJson(response),
  };
}

export function resolveApiUrl(path: string, baseUrl = apiBaseUrl()) {
  if (!path.startsWith('/')) {
    throw new Error('YouthLM artifact download URL must be relative');
  }
  return `${baseUrl}${path}`;
}
