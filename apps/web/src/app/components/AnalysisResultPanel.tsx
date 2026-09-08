import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Database, LoaderCircle, RotateCw } from 'lucide-react';
import type { AnalysisExecution } from '../types';

type AnalysisResultPanelProps = {
  execution?: AnalysisExecution;
  onRetry?: () => void;
};

function EChartsCanvas({ option }: { option: Record<string, unknown> }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let disposeChart: (() => void) | undefined;
    import('../echarts-runtime').then(({ mountChart }) => {
      if (!disposed) disposeChart = mountChart(container, option);
    });
    return () => {
      disposed = true;
      disposeChart?.();
    };
  }, [option]);

  return <div ref={containerRef} className="h-64 w-full" role="img" aria-label="YouthLM 分析圖表" />;
}

export function AnalysisResultPanel({ execution, onRetry }: AnalysisResultPanelProps) {
  if (!execution) return null;
  if (execution.state === 'running') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-4 text-xs text-violet-800" role="status">
        <LoaderCircle className="size-4 animate-spin" />
        YouthLM Agent 正在檢查資料相容性並產生分析…
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
        <p className="mt-2 text-xs leading-5 text-slate-600">{view.summary}</p>
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

      {view.kind === 'chart' && view.chartOption && <EChartsCanvas option={view.chartOption} />}

      {view.table && view.table.records.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-[11px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>{view.table.columns.map(column => <th key={column.name} className="whitespace-nowrap px-2 py-2 font-semibold">{column.label}</th>)}</tr>
            </thead>
            <tbody>
              {view.table.records.map((record, rowIndex) => (
                <tr key={rowIndex} className="border-t border-slate-100">
                  {view.table?.columns.map(column => <td key={column.name} className="whitespace-nowrap px-2 py-2 text-slate-700">{String(record[column.name] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(view.sources?.length ?? 0) > 0 && (
        <div className="flex items-start gap-2 text-[11px] leading-5 text-slate-500">
          <Database className="mt-0.5 size-3.5 shrink-0" />
          <span>來源：{view.sources?.map(source => `${source.title}（${source.agency}）`).join('、')}</span>
        </div>
      )}
    </section>
  );
}
