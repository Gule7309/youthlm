import type { SourceFilters } from './types';

// Consumed fields of GET /v1/data-sources (Contract v0). No runtime fixtures.
export type CatalogSource = {
  source_id: string;
  title: string;
  agency: string;
  source_url: string;
  status: string;
  query_tool: string;
  geography: string;
  available_geographies: string[];
  available_age_groups: string[];
  available_sexes: string[];
  time_range: { start: number; end: number };
  unit: string;
  known_limitations: string[];
  dataset_version: { version_id: string; retrieved_at: string };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isText) && new Set(value).size === value.length;
}

export function safeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (['https:', 'http:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* Invalid catalog links are never rendered as clickable URLs. */ }
  return undefined;
}

export function parseSourceCatalog(payload: unknown): CatalogSource[] {
  const invalid = () => new Error('資料目錄格式不符，請確認前後端版本一致後重試。');
  if (!isRecord(payload) || !Array.isArray(payload.sources)) throw invalid();
  const ids = new Set<string>();
  return payload.sources.map((source: unknown) => {
    if (!isRecord(source)
      || !['source_id', 'title', 'agency', 'source_url', 'status', 'query_tool', 'geography', 'unit'].every(key => isText(source[key]))
      || !['available_geographies', 'available_age_groups', 'available_sexes', 'known_limitations'].every(key => isTextList(source[key]))
      || !isRecord(source.time_range)
      || !Number.isInteger(source.time_range.start) || !Number.isInteger(source.time_range.end)
      || (source.time_range.start as number) < 1 || (source.time_range.end as number) > 9999
      || (source.time_range.start as number) > (source.time_range.end as number)
      || !isRecord(source.dataset_version) || !isText(source.dataset_version.version_id)
      || !isText(source.dataset_version.retrieved_at)) throw invalid();
    const entry = source as CatalogSource;
    if (ids.has(entry.source_id) || !entry.available_age_groups.length || !entry.available_sexes.length
      || !entry.available_geographies.length
      || entry.available_sexes.some(sex => !['all', 'male', 'female'].includes(sex))) throw invalid();
    ids.add(entry.source_id);
    return entry;
  });
}

export function catalogUrl(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, '');
  if (!base) return '/v1/data-sources';
  if (!safeSourceUrl(base) || /[?#]/.test(base)) {
    throw new Error('API 位址設定無效，請檢查 VITE_API_BASE_URL（需為 HTTP 或 HTTPS 網址）。');
  }
  return `${base}/v1/data-sources`;
}

export async function loadSourceCatalog(
  baseUrl: string,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
  timeoutMs = 15000,
): Promise<CatalogSource[]> {
  const url = catalogUrl(baseUrl);
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  if (signal.aborted) cancel();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetcher(url, { signal: controller.signal, cache: 'no-store', headers: { Accept: 'application/json' } });
    } catch (error) {
      if (signal.aborted) throw error;
      if (timedOut) throw new Error('資料目錄載入逾時，請稍後重試。');
      throw new Error('無法連線至後端，請確認 API 已啟動及網路／跨來源設定後重試。');
    }
    if (!response.ok) throw new Error(`資料目錄載入失敗（HTTP ${response.status}），請確認後端服務後重試。`);
    let payload: unknown;
    try { payload = await response.json(); } catch {
      if (timedOut) throw new Error('資料目錄載入逾時，請稍後重試。');
      throw new Error('後端未回傳有效的 JSON 資料目錄，請確認 API 位址。');
    }
    return parseSourceCatalog(payload);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}

export function supportsSourceFilters(source: CatalogSource): boolean {
  return source.status === 'available'
    && ['query_youth_dataset', 'query_population_dataset'].includes(source.query_tool);
}

export function hasGeographyFilter(source: CatalogSource): boolean {
  return source.query_tool === 'query_population_dataset';
}

export function filterValues(filters: SourceFilters, key: string): string[] {
  const value = filters[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function defaultSourceFilters(source: CatalogSource): SourceFilters {
  const preferredAges = source.available_age_groups.filter(age => ['25-29', '30-34'].includes(age));
  return {
    start_year: source.time_range.end,
    end_year: source.time_range.end,
    age_groups: preferredAges.length ? preferredAges : source.available_age_groups.slice(0, 1),
    sexes: source.available_sexes.includes('all') ? ['all'] : [...source.available_sexes],
    ...(hasGeographyFilter(source) ? { geographies: [source.available_geographies.includes(source.geography)
      ? source.geography : source.available_geographies[0]] } : {}),
  };
}

export function estimateSourceRows(source: CatalogSource, filters: SourceFilters): number {
  const years = Number(filters.end_year) - Number(filters.start_year) + 1;
  return Math.max(0, years) * filterValues(filters, 'age_groups').length * filterValues(filters, 'sexes').length
    * (hasGeographyFilter(source) ? filterValues(filters, 'geographies').length : 1);
}

export function validateSourceFilters(source: CatalogSource, filters: SourceFilters): string | null {
  if (!supportsSourceFilters(source)) return '此資料集目前無法使用，請選擇其他資料集。';
  const { start_year: start, end_year: end } = filters;
  if (typeof start !== 'number' || typeof end !== 'number' || !Number.isInteger(start) || !Number.isInteger(end)
    || start < source.time_range.start || end > source.time_range.end || start > end) {
    return `請選擇 ${source.time_range.start}–${source.time_range.end} 年內的有效範圍，起始年度不可晚於結束年度。`;
  }
  const choices: [string, string, string[]][] = [
    ['age_groups', '年齡', source.available_age_groups], ['sexes', '性別', source.available_sexes],
    ...(hasGeographyFilter(source) ? [['geographies', '地區', source.available_geographies] as [string, string, string[]]] : []),
  ];
  for (const [key, label, allowed] of choices) {
    const values = filters[key];
    if (!isTextList(values) || !values.length || values.some(value => !allowed.includes(value))) {
      return `請至少選擇一個有效的${label}選項，不可重複或使用資料未提供的條件。`;
    }
  }
  const keys = new Set(['start_year', 'end_year', ...choices.map(([key]) => key)]);
  if (Object.keys(filters).some(key => !keys.has(key))) return '篩選條件與資料集不符，請重新選取資料集以重設條件。';
  // Current population query contract has a 500-row guard; catalog has no limit field yet.
  if (hasGeographyFilter(source) && estimateSourceRows(source, filters) > 500) {
    return `目前條件預計 ${estimateSourceRows(source, filters).toLocaleString()} 筆，超過人口查詢上限 500 筆，請縮小範圍。`;
  }
  return null;
}
