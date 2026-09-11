import type { SourceFilters } from '../types';
import { estimateSourceRows, filterValues, hasGeographyFilter, safeSourceUrl, validateSourceFilters } from '../source-catalog';
import type { CatalogSource } from '../source-catalog';

const inputClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
const sexLabels: Record<string, string> = { male: '男', female: '女', all: '合計（官方值）' };

export function CatalogFilters({ source, filters, onChange }: {
  source: CatalogSource;
  filters: SourceFilters;
  onChange: (filters: SourceFilters) => void;
}) {
  const years = Array.from({ length: source.time_range.end - source.time_range.start + 1 }, (_, index) => source.time_range.end - index);
  const issue = validateSourceFilters(source, filters);
  const sourceUrl = safeSourceUrl(source.source_url);
  const choices = (key: string, title: string, options: string[], label: (value: string) => string = value => value) => (
    <fieldset className="min-w-0 space-y-2">
      <legend className="text-xs font-semibold text-slate-700">{title}（可複選）</legend>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-slate-500">已選 {filterValues(filters, key).length} 項</span>
        <span className="flex gap-3">
          <button type="button" className="text-blue-700 hover:underline" onClick={() => onChange({ ...filters, [key]: [...options] })}>全選{title}</button>
          <button type="button" className="text-slate-500 hover:underline" onClick={() => onChange({ ...filters, [key]: [] })}>清除{title}</button>
        </span>
      </div>
      <div className={`grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2 ${options.length > 8 ? 'max-h-44 overflow-y-auto' : ''}`}>
        {options.map(value => (
          <label key={value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs text-slate-700 hover:bg-blue-50">
            <input type="checkbox" className="size-4 accent-blue-600" checked={filterValues(filters, key).includes(value)} onChange={event => {
              const selected = new Set(filterValues(filters, key));
              if (event.target.checked) selected.add(value); else selected.delete(value);
              onChange({ ...filters, [key]: options.filter(option => selected.has(option)) });
            }} />
            {label(value)}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-blue-50 px-3 py-2.5 text-[11px] leading-5 text-blue-900">
        <p>{source.agency} · 單位：{source.unit} · {source.time_range.start}–{source.time_range.end} 年</p>
        <p>快照取得日：{source.dataset_version.retrieved_at}</p>
        {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">查看官方資料來源（另開分頁）</a>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {(['start_year', 'end_year'] as const).map((key, index) => (
          <label key={key} className="space-y-1.5 text-xs font-semibold text-slate-700">
            <span className="block">{index === 0 ? '起始年度' : '結束年度'}</span>
            <select className={inputClass} value={typeof filters[key] === 'number' ? filters[key] : ''} onChange={event => onChange({ ...filters, [key]: Number(event.target.value) })}>
              <option value="" disabled>請選擇年度</option>
              {years.map(year => <option key={year} value={year}>{year} 年</option>)}
            </select>
          </label>
        ))}
      </div>
      {choices('age_groups', '年齡', source.available_age_groups, value => `${value} 歲`)}
      {choices('sexes', '性別', source.available_sexes, value => sexLabels[value] ?? value)}
      {hasGeographyFilter(source) ? (
        <div className="space-y-2">
          {choices('geographies', '地區', source.available_geographies)}
          <p className="text-[11px] leading-5 text-slate-500">全市與各區請分開比較，勿重複加總。人口查詢最多 500 筆。</p>
        </div>
      ) : <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">地理範圍：{source.geography}全市（未提供行政區明細）</p>}
      <p className={`text-xs ${issue ? 'text-red-600' : 'text-slate-600'}`} role="status">
        {issue ?? `預計 ${estimateSourceRows(source, filters).toLocaleString()} 筆資料；目前僅設定篩選，尚未執行查詢。`}
      </p>
      {source.known_limitations.length > 0 && (
        <details className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-900">
          <summary className="cursor-pointer font-semibold">資料限制（{source.known_limitations.length} 項，分析前請確認）</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">{source.known_limitations.map(item => <li key={item}>{item}</li>)}</ul>
        </details>
      )}
    </div>
  );
}
