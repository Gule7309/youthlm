import React, { useEffect, useRef, useState } from 'react';
import { safeSourceUrl } from '../source-catalog';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Database,
  ListChecks,
  LoaderCircle,
  RotateCw,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  AnalysisExecution,
  AnalysisSourceView,
  ChartArtifactView,
  SourceFilterValue,
} from '../types';

type AnalysisResultPanelProps = {
  execution?: AnalysisExecution;
  onRetry?: () => void;
};

function EChartsCanvas({ option }: { option: Record<string, unknown> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartError, setChartError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let loading = false;
    let disposeChart: (() => void) | undefined;
    setChartError(false);

    const mountWhenVisible = () => {
      if (disposed || loading || disposeChart || container.clientWidth === 0 || container.clientHeight === 0) return;
      loading = true;
      import('../echarts-runtime').then(({ mountChart }) => {
        loading = false;
        if (disposed || container.clientWidth === 0 || container.clientHeight === 0) return;
        disposeChart = mountChart(container, option);
      }).catch(() => {
        loading = false;
        if (!disposed) setChartError(true);
      });
    };

    const visibilityObserver = new ResizeObserver(mountWhenVisible);
    visibilityObserver.observe(container);
    mountWhenVisible();

    return () => {
      disposed = true;
      visibilityObserver.disconnect();
      disposeChart?.();
    };
  }, [option]);

  return <>
    {chartError && <p role="alert" className="rounded bg-amber-50 p-3 text-xs text-amber-800">圖表暫時無法顯示，仍可使用下方資料表核對結果。</p>}
    <div ref={containerRef} className={chartError ? 'hidden' : 'h-80 w-full'} role="img" aria-label="YouthLM 分析圖表" />
  </>;
}

const FILTER_LABELS: Record<string, string> = {
  age_groups: '年齡組',
  end_year: '結束年度',
  geographies: '地區',
  sexes: '性別',
  start_year: '起始年度',
};

const FILTER_VALUE_LABELS: Record<string, string> = {
  all: '合計（官方值）',
  female: '女性',
  male: '男性',
};

function filterLabel(key: string) {
  return FILTER_LABELS[key] ?? key;
}

function formatFilterValue(value: SourceFilterValue): string {
  if (Array.isArray(value)) return value.map(formatFilterValue).join('、');
  if (value === null) return '未指定';
  if (typeof value === 'object') {
    return Object.entries(value)
      .map(([key, nestedValue]) => `${filterLabel(key)}：${formatFilterValue(nestedValue)}`)
      .join('；');
  }
  return FILTER_VALUE_LABELS[String(value)] ?? String(value);
}

function SourceTrace({ source }: { source: AnalysisSourceView }) {
  const version = source.datasetVersion;
  const sourceUrl = source.source_url ? safeSourceUrl(source.source_url) : undefined;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-start gap-2">
        <Database className="mt-0.5 size-3.5 shrink-0 text-violet-600" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-slate-800">{source.title}</p>
          {sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-violet-700 underline">查看官方原始來源 ↗</a>}
          <p className="mt-0.5 text-[10px] text-slate-500">
            {source.agency ?? '未提供機關'}
            {version?.retrieved_at ? ` · 擷取 ${version.retrieved_at.slice(0, 10)}` : ''}
          </p>
        </div>
      </div>

      {source.provenance.map((record, index) => (
        <div key={`${record.query_tool}-${index}`} className="mt-2 border-t border-slate-100 pt-2 text-[10px] leading-4 text-slate-600">
          查詢工具：<code className="rounded bg-slate-100 px-1 py-0.5 text-violet-700">{record.query_tool}</code>
        </div>
      ))}

      {version && (
        <div className="mt-1 text-[10px] leading-4 text-slate-500">
          資料版本：<span className="font-medium text-slate-700">{version.dataset_version_id}</span>
          <span className="mx-1">·</span>
          SHA-256 {version.source_sha256.slice(0, 12)}…
        </div>
      )}
    </div>
  );
}

function AgentTrace({ view }: { view: ChartArtifactView }) {
  const steps = view.analysisPlan ?? [];
  const filters = Object.entries(view.filters ?? {});
  const sources = view.sources ?? [];

  if (!view.question && steps.length === 0 && filters.length === 0) return null;

  return (
    <details className="group rounded-xl border border-violet-200 bg-violet-50/50">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-semibold text-violet-900 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <ListChecks className="size-4 text-violet-600" />
          小幫手執行紀錄{steps.length > 0 ? ` · ${steps.length} 個步驟` : ''}
        </span>
        <ChevronDown className="size-4 shrink-0 text-violet-500 transition group-open:rotate-180" />
      </summary>

      <div className="space-y-3 border-t border-violet-100 px-3 py-3">
        {view.question && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">實際分析問題</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-700">{view.question}</p>
          </div>
        )}

        {steps.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">執行步驟</p>
            <ol className="mt-2 space-y-2">
              {steps.map((step, index) => (
                <li key={step.step_id} className="flex items-start gap-2 text-[11px] leading-4 text-slate-700">
                  <CheckCircle2 className={`mt-0.5 size-3.5 shrink-0 ${step.status === 'completed' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span><span className="font-medium">{index + 1}.</span> {step.description}{step.status === 'skipped' ? '（已略過）' : ''}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {filters.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <SlidersHorizontal className="size-3" />
              實際資料篩選
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {filters.map(([key, value]) => (
                <span key={key} className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-700">
                  <span className="font-medium">{filterLabel(key)}</span>：{formatFilterValue(value)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">資料查詢與版本</p>
          {sources.length > 0 ? (
            <div className="mt-2 space-y-2">
              {sources.map(source => <SourceTrace key={source.source_id} source={source} />)}
            </div>
          ) : (
            <p className="mt-1 text-[11px] leading-5 text-slate-500">相容性檢查已中止分析，因此未執行資料查詢。</p>
          )}
        </div>
      </div>
    </details>
  );
}

export function AnalysisResultPanel({ execution, onRetry }: AnalysisResultPanelProps) {
  if (!execution) return null;
  if (execution.state === 'running') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-4 text-xs text-violet-800" role="status">
        <LoaderCircle className="size-4 animate-spin" />
        小幫手正在檢查資料相容性並產生分析，最多等待約兩分鐘…
      </div>
    );
  }

  const view = execution.view;
  if (!view) return null;
  if (view.kind === 'error') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">
        <p className="font-semibold">分析失敗 · {view.code ?? 'unknown_error'}</p>
        <p className="mt-1 leading-5">{view.message ?? 'YouthLM API 無法完成分析。'}</p>
        {execution.moduleId && (
          <p className="mt-2 font-mono text-[10px] text-red-600">
            後端追蹤編號：{execution.moduleId}
          </p>
        )}
        {view.retriable && onRetry && (
          <button type="button" onClick={onRetry} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-red-700 px-3 py-2 font-medium text-white">
            <RotateCw className="size-3.5" />
            重試
          </button>
        )}
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-3" aria-label="分析結果">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            view.status === 'blocked'
              ? 'bg-red-100 text-red-700'
              : view.status === 'partial'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-700'
          }`}>
            {view.status === 'blocked' ? '無法分析' : view.status === 'partial' ? '部分相容' : '完成'}
          </span>
          <h3 className="text-sm font-semibold text-slate-900">{view.title}</h3>
        </div>
        <p className="mt-2 whitespace-pre-line text-xs leading-5 text-slate-600">{view.summary}</p>
      </div>

      {(view.warnings?.length ?? 0) > 0 && (
        <div className="space-y-2">
          {view.warnings?.map((warning, index) => (
            <div key={`${warning.type}-${index}`} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-5 ${
              warning.severity === 'blocking'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'
            }`}>
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{warning.message}</span>
            </div>
          ))}
        </div>
      )}

      <AgentTrace view={view} />

      {view.kind === 'chart' && view.chartOption && <EChartsCanvas option={view.chartOption} />}

      {view.table && view.table.records.length > 0 && (
        <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr>{view.table.columns.map(column => <th key={column.name} className="whitespace-nowrap px-2 py-2 font-semibold">{column.label}{column.unit ? `（${column.unit}）` : ''}</th>)}</tr>
            </thead>
            <tbody>
              {view.table.records.map((record, rowIndex) => (
                <tr key={rowIndex} className="border-t border-slate-100">
                  {view.table?.columns.map(column => <td key={column.name} className="whitespace-nowrap px-2 py-2 text-slate-700">{column.name === 'sex' ? FILTER_VALUE_LABELS[String(record[column.name])] ?? String(record[column.name] ?? '—') : String(record[column.name] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(view.sources?.length ?? 0) > 0 && (
        <div className="flex items-start gap-2 text-[11px] leading-5 text-slate-500">
          <Database className="mt-0.5 size-3.5 shrink-0" />
          <span>來源：{view.sources?.map(source => source.agency ? `${source.title}（${source.agency}）` : source.title).join('、')}</span>
        </div>
      )}
    </section>
  );
}
