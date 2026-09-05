import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Database,
  History,
  LoaderCircle,
  Radar,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type {
  PolicyRadarCounts,
  PolicyRadarDisplayStatus,
  PolicyRadarState,
} from '../types';

export type PolicyRadarPanelProps = {
  counts: PolicyRadarCounts;
  state: PolicyRadarState;
  isStale: boolean;
  onToggle: () => void;
  onRun: () => void;
};

type StatusPresentation = {
  label: string;
  description: string;
  dotClassName: string;
};

const STATUS_PRESENTATION: Record<PolicyRadarDisplayStatus, StatusPresentation> = {
  empty: {
    label: '尚無可盤點來源',
    description: '請先新增來源，並完成檔案或公開 API 的前端基本設定。',
    dotClassName: 'bg-slate-400',
  },
  ready: {
    label: '等待開始',
    description: '已有完成基本設定的來源，可以盤點目前的卡片狀態。',
    dotClassName: 'bg-amber-500',
  },
  running: {
    label: '盤點中',
    description: '正在整理卡片數量與設定狀態，請稍候。',
    dotClassName: 'bg-violet-500',
  },
  complete: {
    label: '前端盤點完成',
    description: '本次頁面已保留最近一次盤點；重新整理頁面後會重置。',
    dotClassName: 'bg-emerald-500',
  },
};

function getDisplayStatus(
  counts: PolicyRadarCounts,
  state: PolicyRadarState,
): PolicyRadarDisplayStatus {
  if (state.running) return 'running';
  if (counts.readySourceCount === 0) return 'empty';
  if (state.latestRecord) return 'complete';
  return 'ready';
}

function CountItem({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
          {icon}
          {label}
        </span>
        <strong className="text-base font-semibold tabular-nums text-slate-900">{value}</strong>
      </div>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">{detail}</p>
    </div>
  );
}

function formatRecordTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function PolicyRadarPanel({
  counts,
  state,
  isStale,
  onToggle,
  onRun,
}: PolicyRadarPanelProps) {
  const status = getDisplayStatus(counts, state);
  const statusPresentation = STATUS_PRESENTATION[status];
  const canRun = counts.readySourceCount > 0;
  const hasRecord = Boolean(state.latestRecord);
  const runButtonLabel = hasRecord ? '重新盤點' : '開始盤點';

  return (
    <aside
      className={`pointer-events-auto max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-violet-200 bg-white shadow-lg transition-[width] ${
        state.collapsed ? 'w-[238px]' : 'w-[328px]'
      }`}
      aria-label="政策雷達"
      aria-busy={state.running}
    >
      <header className="flex items-center justify-between gap-3 border-b border-violet-100 bg-violet-50/70 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
            <Radar className="size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-sm font-semibold text-slate-950">政策雷達</h2>
              <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[9px] font-medium text-violet-700 ring-1 ring-violet-200">
                前端盤點
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] font-medium text-slate-500">
              <span className={`size-1.5 rounded-full ${statusPresentation.dotClassName}`} aria-hidden="true" />
              {statusPresentation.label}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
          aria-expanded={!state.collapsed}
          aria-label={state.collapsed ? '展開政策雷達' : '收合政策雷達'}
          title={state.collapsed ? '展開政策雷達' : '收合政策雷達'}
        >
          {state.collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
      </header>

      {!state.collapsed && (
        <div className="max-h-[calc(100vh-11rem)] overflow-y-auto p-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5" aria-live="polite">
            <div className="flex items-start gap-2">
              {state.running ? (
                <LoaderCircle className="mt-0.5 size-3.5 shrink-0 animate-spin text-violet-600" aria-hidden="true" />
              ) : (
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-violet-600" aria-hidden="true" />
              )}
              <div>
                <p className="text-xs font-semibold text-slate-800">{statusPresentation.label}</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">{statusPresentation.description}</p>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2" aria-label="目前筆記本盤點數量">
            <CountItem
              icon={<Database className="size-3.5 text-blue-600" aria-hidden="true" />}
              label="來源"
              value={counts.sourceCount}
              detail={`其中 ${counts.readySourceCount} 張已完成基本設定`}
            />
            <CountItem
              icon={<BarChart3 className="size-3.5 text-amber-600" aria-hidden="true" />}
              label="成果"
              value={counts.resultCount}
              detail={`其中 ${counts.configuredResultCount} 張已選類型與來源`}
            />
          </div>

          {state.latestRecord && (
            <div className="mt-3 rounded-lg border border-slate-200 px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-600">
                <History className="size-3.5 text-slate-400" aria-hidden="true" />
                最近執行時間
              </div>
              <time
                className="mt-1 block text-[11px] font-medium text-slate-800"
                dateTime={state.latestRecord.createdAt}
              >
                {formatRecordTime(state.latestRecord.createdAt)}
              </time>
              <p className="mt-1 text-[10px] leading-4 text-slate-500">
                當時共 {state.latestRecord.counts.sourceCount} 張來源、{state.latestRecord.counts.resultCount} 張成果
              </p>
            </div>
          )}

          {state.latestRecord && (
            <div className="mt-3 rounded-lg border border-dashed border-violet-200 bg-violet-50/40 px-3 py-2.5">
              <p className="text-[10px] font-semibold text-violet-900">政策分析內容</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] leading-4 text-slate-600">
                <span>趨勢與資源落差</span>
                <span className="text-right text-slate-500">等待後端分析</span>
                <span>觀察議題與政策方向</span>
                <span className="text-right text-slate-500">等待後端分析</span>
              </div>
            </div>
          )}

          {isStale && hasRecord && !state.running && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-amber-900">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <p className="text-[10px] leading-4">
                白板內容已變更，最近紀錄可能不同步，建議重新盤點。
              </p>
            </div>
          )}

          <button
            type="button"
            disabled={!canRun || state.running}
            onClick={onRun}
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-violet-700 text-xs font-medium text-white transition hover:bg-violet-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {state.running ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            {state.running ? '正在盤點…' : runButtonLabel}
          </button>

          <p className="mt-2 text-center text-[10px] leading-4 text-slate-500">
            僅盤點前端卡片狀態，不會呼叫 AI，也不會產生政策結論。
          </p>
        </div>
      )}
    </aside>
  );
}
