import React from 'react';
import {
  Database,
  FileSpreadsheet,
  Globe2,
  GripHorizontal,
  Pencil,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { CanvasNode } from '../types';

type SourceCardProps = {
  node: CanvasNode;
  selected?: boolean;
  connected?: boolean;
  onSelect: (id: string) => boolean | void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, id: string) => void;
  onOutputPointerDown?: (event: React.PointerEvent<HTMLButtonElement>, id: string) => void;
};

export function SourceCard({
  node,
  selected = false,
  connected = false,
  onSelect,
  onEdit,
  onDelete,
  onPointerDown,
  onOutputPointerDown,
}: SourceCardProps) {
  const config = node.source;
  const isConfigured = Boolean(
    config?.kind === 'file' ? config.file?.name : config?.kind === 'api' ? config.apiUrl : false,
  );
  const isEnabled = config?.enabled ?? true;
  const SourceIcon = config?.kind === 'file' ? FileSpreadsheet : config?.kind === 'api' ? Globe2 : Database;
  const sourceType = config?.kind === 'file' ? '上傳檔案' : config?.kind === 'api' ? '公開 API' : '尚未選擇來源';
  const sourceDetail = config?.kind === 'file'
    ? config.file?.name
    : config?.kind === 'api'
      ? config.apiUrl
      : '請先完成來源設定';

  return (
    <article
      className={`pointer-events-auto absolute w-80 overflow-visible rounded-xl border bg-white shadow-lg transition-shadow ${
        selected ? 'z-20 border-blue-400 ring-4 ring-blue-100' : 'z-10 border-slate-200 hover:border-slate-300'
      }`}
      style={{ left: node.x, top: node.y }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
      aria-label={`來源卡片：${config?.name || '尚未命名'}`}
    >
      <div
        className="flex cursor-grab touch-none items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 active:cursor-grabbing"
        onPointerDown={(event) => {
          event.stopPropagation();
          if (onSelect(node.id) === false) return;
          onPointerDown(event, node.id);
        }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <Database className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-blue-700">來源</p>
            <h3 className="truncate text-sm font-semibold text-slate-950">
              {config?.name || '未設定的資料來源'}
            </h3>
          </div>
        </div>
        <GripHorizontal className="size-4 shrink-0 text-slate-300" aria-hidden="true" />
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
          <SourceIcon className="mt-0.5 size-4 shrink-0 text-slate-500" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700">{sourceType}</p>
            <p className="mt-1 truncate text-[11px] text-slate-500" title={sourceDetail}>
              {sourceDetail}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
              !isConfigured
                ? 'bg-amber-50 text-amber-700'
                : isEnabled
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-slate-100 text-slate-500'
            }`}
          >
            <span className={`size-1.5 rounded-full ${!isConfigured ? 'bg-amber-500' : isEnabled ? 'bg-blue-500' : 'bg-slate-400'}`} />
            {!isConfigured ? '尚未設定' : isEnabled ? '等待後端處理' : '已停用'}
          </span>
          {isConfigured && config?.autoClean && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700">
              <Sparkles className="size-3" />
              自動清理
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onEdit(node.id)}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <Pencil className="size-3.5" />
            {isConfigured ? '編輯設定' : '設定來源'}
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onDelete(node.id)}
            className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            aria-label={`刪除${config?.name || '來源'}卡片`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={!onOutputPointerDown}
        onPointerDown={(event) => {
          event.stopPropagation();
          onOutputPointerDown?.(event, node.id);
        }}
        className={`absolute -right-2.5 top-1/2 size-5 -translate-y-1/2 rounded-full border-[3px] border-white shadow-sm ${
          onOutputPointerDown
            ? 'cursor-crosshair bg-blue-600 hover:bg-blue-700'
            : connected
              ? 'cursor-default bg-blue-600'
              : 'cursor-not-allowed bg-slate-300'
        }`}
        aria-label="來源輸出連接點"
        title={onOutputPointerDown ? '拖曳以連接其他卡片' : connected ? '已連接成果卡片' : '請在成果設定中選擇此來源'}
      />
    </article>
  );
}
