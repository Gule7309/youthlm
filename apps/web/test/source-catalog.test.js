import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../src/app/source-catalog.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const {
  parseSourceCatalog, catalogUrl, loadSourceCatalog, defaultSourceFilters,
  validateSourceFilters, estimateSourceRows, supportsSourceFilters, safeSourceUrl,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const fixture = JSON.parse(readFileSync(new URL('../../../contracts/fixtures/frontend-integration/data-sources.example.json', import.meta.url), 'utf8'));
const [unemployment, population] = parseSourceCatalog(fixture);

test('the published catalog fixture supplies both supported sources without mutation', () => {
  const before = structuredClone(fixture);
  assert.equal(parseSourceCatalog(fixture).length, 2);
  assert.equal(supportsSourceFilters(unemployment), true);
  assert.equal(supportsSourceFilters(population), true);
  assert.deepEqual(fixture, before);
  assert.equal(population.available_geographies.length, 30);
});

test('empty catalogs are valid; malformed or duplicate entries are not', () => {
  assert.deepEqual(parseSourceCatalog({ sources: [] }), []);
  for (const payload of [null, {}, { sources: {} }, { sources: [{}] }, { sources: [population, population] },
    { sources: [{ ...population, available_sexes: ['invented'] }] },
    { sources: [{ ...population, time_range: { start: 2024, end: 2000 } }] }]) {
    assert.throws(() => parseSourceCatalog(payload), /資料目錄格式不符/);
  }
});

test('unavailable and unsupported query tools cannot be configured', () => {
  assert.equal(supportsSourceFilters({ ...population, status: 'unavailable' }), false);
  assert.equal(supportsSourceFilters({ ...population, query_tool: 'future_tool' }), false);
  assert.match(validateSourceFilters({ ...population, status: 'unavailable' }, defaultSourceFilters(population)), /無法使用/);
});

test('unemployment defaults keep male/female and omit district filters and dataset_id', () => {
  const filters = defaultSourceFilters(unemployment);
  assert.deepEqual(filters, { start_year: 2024, end_year: 2024, age_groups: ['25-29', '30-34'], sexes: ['male', 'female'] });
  assert.equal(validateSourceFilters(unemployment, filters), null);
  assert.equal(estimateSourceRows(unemployment, filters), 4);
  assert.match(validateSourceFilters(unemployment, { ...filters, sexes: ['all'] }), /性別/);
  assert.match(validateSourceFilters(unemployment, { ...filters, geographies: ['板橋區'] }), /篩選條件與資料集不符/);
});

test('population defaults use the latest year, official total and municipality', () => {
  const filters = defaultSourceFilters(population);
  assert.deepEqual(filters, { start_year: 2024, end_year: 2024, age_groups: ['25-29', '30-34'], sexes: ['all'], geographies: ['新北市'] });
  assert.equal(validateSourceFilters(population, filters), null);
  assert.equal(estimateSourceRows(population, filters), 2);
});

test('defaults use catalog ranges rather than hard-coded dates, ages or geography', () => {
  const changed = { ...population, time_range: { start: 2025, end: 2026 }, geography: '其他地區', available_geographies: ['板橋區'], available_age_groups: ['20-24'], available_sexes: ['female'] };
  assert.deepEqual(defaultSourceFilters(changed), { start_year: 2026, end_year: 2026, age_groups: ['20-24'], sexes: ['female'], geographies: ['板橋區'] });
});

test('switching datasets creates independent defaults without carrying incompatible filters', () => {
  const first = defaultSourceFilters(population);
  first.geographies.push('板橋區');
  first.sexes.push('male');
  assert.deepEqual(defaultSourceFilters(unemployment).sexes, ['male', 'female']);
  assert.equal('geographies' in defaultSourceFilters(unemployment), false);
  assert.deepEqual(defaultSourceFilters(population).geographies, ['新北市']);
});

test('empty, duplicate and unsupported selections are rejected for every dimension', () => {
  for (const [key, invalid] of [['age_groups', '18-35'], ['sexes', 'unknown'], ['geographies', '臺北市']]) {
    for (const values of [[], [invalid], ['25-29', '25-29'], [123], null]) {
      assert.ok(validateSourceFilters(population, { ...defaultSourceFilters(population), [key]: values }));
    }
  }
});

test('years must be integers, within source coverage and correctly ordered', () => {
  for (const range of [{ start_year: 1999 }, { end_year: 2025 }, { start_year: 2024, end_year: 2023 }, { start_year: 2023.5 }, { start_year: '2024' }, { end_year: null }]) {
    assert.match(validateSourceFilters(population, { ...defaultSourceFilters(population), ...range }), /年度|範圍/);
  }
});

test('population row guard allows exactly 500 and rejects larger queries', () => {
  const filters = { start_year: 2000, end_year: 2024, geographies: population.available_geographies.slice(0, 5), age_groups: ['25-29', '30-34'], sexes: ['male', 'female'] };
  assert.equal(estimateSourceRows(population, filters), 500);
  assert.equal(validateSourceFilters(population, filters), null);
  assert.match(validateSourceFilters(population, { ...filters, geographies: population.available_geographies.slice(0, 6) }), /600.*500/);
});

test('API URL is same-origin by default and never includes unsafe credentials or query strings', () => {
  assert.equal(catalogUrl(''), '/v1/data-sources');
  assert.equal(catalogUrl(' https://api.example.test/base/ '), 'https://api.example.test/base/v1/data-sources');
  for (const url of ['javascript:alert(1)', '//example.test', 'https://user:password@example.test', 'https://api.example.test?key=value']) {
    assert.throws(() => catalogUrl(url), /API 位址設定無效/);
  }
  assert.equal(safeSourceUrl('javascript:alert(1)'), undefined);
});

test('catalog client makes only the real GET and parses the response', async () => {
  const calls = [];
  const sources = await loadSourceCatalog('', new AbortController().signal, async (...args) => {
    calls.push(args);
    return new Response(JSON.stringify(fixture));
  });
  assert.equal(sources.length, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/v1/data-sources');
  assert.equal(calls[0][1].method, undefined); // fetch defaults to GET
  assert.equal(calls[0][1].cache, 'no-store');
});

test('network, HTTP, HTML and invalid catalog failures remain errors without fallback', async () => {
  const cases = [
    [async () => { throw new TypeError('Failed to fetch'); }, /無法連線/],
    [async () => new Response('private internal trace', { status: 503 }), /HTTP 503/],
    [async () => new Response('<html>Vite</html>'), /JSON/],
    [async () => new Response('{}'), /資料目錄格式不符/],
  ];
  for (const [fetcher, expected] of cases) {
    await assert.rejects(loadSourceCatalog('', new AbortController().signal, fetcher), expected);
  }
});

const abortingFetch = (_url, { signal }) => new Promise((_resolve, reject) => {
  const abort = () => reject(new DOMException('Aborted', 'AbortError'));
  if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
});

test('unmount cancellation aborts the request and preserves AbortError', async () => {
  const controller = new AbortController();
  const request = loadSourceCatalog('', controller.signal, abortingFetch);
  controller.abort();
  await assert.rejects(request, { name: 'AbortError' });
});

test('a slow request times out with a recoverable Chinese message', async () => {
  await assert.rejects(loadSourceCatalog('', new AbortController().signal, abortingFetch, 5), /逾時/);
});
