import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  FileCheck2,
  LoaderCircle,
  RotateCw,
} from 'lucide-react';
import { downloadPresentation } from '../api-client';
import type { PresentationExecution } from '../types';

type PresentationResultPanelProps = {
  execution?: PresentationExecution;
  onRetry?: () => void;
};

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function PresentationResultPanel({
  execution,
  onRetry,
}: PresentationResultPanelProps) {
  const [downloadState, setDownloadState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [downloadError, setDownloadError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    setDownloadState('idle');
    setDownloadError('');
    return () => { controllerRef.current?.abort(); controllerRef.current = null; };
  }, [execution]);
  const handleDownload = async () => {
    if (execution?.view?.kind !== 'ready' || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setDownloadState('loading');
    setDownloadError('');
    try {
      const blob = await downloadPresentation(execution.view, undefined, undefined, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = execution.view.fileName.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadState('done');
    } catch (error) {
      if (!controller.signal.aborted) {
        setDownloadError(error instanceof Error ? error.message : '下載失敗，請重試。');
        setDownloadState('idle');
      }
    } finally { if (controllerRef.current === controller) controllerRef.current = null; }
  };
  if (!execution) return null;

  if (execution.state === 'running') {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-4 text-xs text-violet-800" role="status">
        <LoaderCircle className="size-4 animate-spin" />
        正在從已保存的分析成果產生可編輯 PPTX…
      </div>
    );
  }

  const view = execution.view;
  if (!view) return null;

  if (view.kind === 'error') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert">
        <p className="font-semibold">簡報產生失敗 · {view.code}</p>
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
    <section className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3" aria-label="簡報成果">
      <div className="flex items-start gap-2">
        <FileCheck2 className="mt-0.5 size-4 shrink-0 text-emerald-700" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-emerald-900">簡報已產生</p>
          <p className="mt-1 break-all text-[11px] leading-4 text-emerald-800">{view.fileName} · {formatFileSize(view.fileSizeBytes)}</p>
        </div>
      </div>

      {view.warnings.map((warning, index) => (
        <div key={`${warning.type}-${index}`} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{warning.message}</span>
        </div>
      ))}

      <div className="text-[10px] leading-4 text-slate-500">
        <p>建立時間（本機時區）：{Number.isNaN(Date.parse(view.createdAt)) ? view.createdAt : new Date(view.createdAt).toLocaleString('zh-TW', { hour12: false })}</p>
        <p className="mt-0.5">SHA-256：{view.artifactSha256.slice(0, 16)}…</p>
      </div>

      {downloadError && <p role="alert" className="text-xs leading-5 text-red-700">{downloadError}</p>}
      {downloadState === 'done' && <p role="status" className="text-xs text-emerald-800">檔案驗證通過，已送出下載。</p>}
      <button type="button" onClick={handleDownload} disabled={downloadState === 'loading'}
        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-700 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
      >
        <Download className="size-3.5" />
        {downloadState === 'loading' ? '下載與驗證中…' : downloadError ? '重試下載 PPTX' : '下載可編輯 PPTX'}
      </button>
    </section>
  );
}
