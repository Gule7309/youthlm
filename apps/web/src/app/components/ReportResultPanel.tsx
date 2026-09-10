import React from 'react';
import {
  AlertTriangle,
  Download,
  FileCheck2,
  LoaderCircle,
  RotateCw,
} from 'lucide-react';
import { resolveApiUrl } from '../api-client';
import type { ReportExecution } from '../types';

type ReportResultPanelProps = {
  execution?: ReportExecution;
  onRetry?: () => void;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function ReportResultPanel({ execution, onRetry }: ReportResultPanelProps) {
  if (!execution) return null;
  if (execution.state === 'running') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-4 text-xs text-violet-800" role="status">
        <LoaderCircle className="size-4 animate-spin" />
        正在從已保存的分析成果產生可編輯 DOCX…
      </div>
    );
  }

  const view = execution.view;
  if (!view) return null;
  if (view.kind === 'error') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">
        <p className="font-semibold">研析報告產生失敗 · {view.code}</p>
        <p className="mt-1 leading-5">{view.message}</p>
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
    <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3" aria-label="研析報告成果">
      <div className="flex items-start gap-2">
        <FileCheck2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-emerald-900">研析報告已產生</p>
          <p className="mt-1 break-all text-[11px] leading-4 text-emerald-800">
            {view.fileName} · {formatFileSize(view.fileSizeBytes)}
          </p>
        </div>
      </div>

      {view.warnings.map((warning, index) => (
        <div key={`${warning.type}-${index}`} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{warning.message}</span>
        </div>
      ))}

      <div className="text-[10px] leading-4 text-slate-500">
        <p>建立時間：{view.createdAt.replace('T', ' ').slice(0, 19)}</p>
        <p className="mt-0.5">SHA-256：{view.artifactSha256.slice(0, 16)}…</p>
      </div>

      <a
        href={resolveApiUrl(view.downloadUrl)}
        download={view.fileName}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white transition hover:bg-emerald-800"
      >
        <Download className="size-3.5" />
        下載可編輯 DOCX
      </a>
    </section>
  );
}
