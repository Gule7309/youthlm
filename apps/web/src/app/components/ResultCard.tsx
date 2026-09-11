import React from 'react';
import {
  BarChart3,
  FileOutput,
  GripHorizontal,
  LoaderCircle,
  Pencil,
  Play,
  Presentation,
  Trash2,
} from 'lucide-react';
import type { AnalysisExecution, CanvasNode, PresentationExecution } from '../types';
import { RESULT_CARD_SIZE, type CanvasConnectionKind } from '../canvas-connections';

export type ResultCardProps = {
  node: CanvasNode;
  selected?: boolean;
  sourcesReady?: boolean;
  execution?: AnalysisExecution;
  presentationExecution?: PresentationExecution;
  onRun?: (id: string) => void;
  onSelect: (id: string) => boolean | void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, id: string) => void;
  onInputPointerDown?: (event: React.PointerEvent<HTMLButtonElement>, id: string) => void;
  onOutputPointerDown?: (event: React.PointerEvent<HTMLButtonElement>, id: string) => void;
  inputConnectionState?: 'available' | 'hovered' | 'invalid';
  inputConnectionKind?: CanvasConnectionKind;
  outputConnecting?: boolean;
};

export function ResultCard({
  node,
  selected = false,
  sourcesReady = false,
  execution,
  presentationExecution,
  onRun,
  onSelect,
  onEdit,
  onDelete,
  onPointerDown,
  onInputPointerDown,
  onOutputPointerDown,
  inputConnectionState,
  inputConnectionKind,
  outputConnecting = false,
}: ResultCardProps) {
  const config = node.result;
  const isPresentation = config?.kind === 'presentation';
  const isConfigured = Boolean(
    config?.name.trim()
    && (
      config.kind === 'chart'
        ? config.sourceNodeIds.length > 0 && config.prompt.trim()
        : config.kind === 'presentation'
          ? (config.sourceModuleIds?.length ?? 0) > 0
          : false
    ),
  );
  const isReadyForGeneration = isConfigured && sourcesReady;
  const activeExecution = isPresentation ? presentationExecution : execution;
  const isRunning = activeExecution?.state === 'running';
  const ResultIcon = config?.kind === 'chart'
    ? BarChart3
    : config?.kind === 'presentation'
      ? Presentation
      : FileOutput;
  const resultType = config?.kind === 'chart'
    ? '洞察圖表'
    : config?.kind === 'presentation'
      ? '洞察簡報'
      : '尚未選擇成果類型';
  const sourceCount = isPresentation
    ? config?.sourceModuleIds?.length ?? 0
    : config?.sourceNodeIds.length ?? 0;
  const promptSummary = config?.prompt.trim()
    || (isPresentation ? '使用預設政策簡報格式' : '請先描述希望產生的內容與洞察方向');
  const usesAnalysisInputColor = inputConnectionKind
    ? inputConnectionKind === 'analysis'
    : isPresentation;
  const inputConnectionClass = inputConnectionState === 'hovered'
    ? usesAnalysisInputColor
      ? 'scale-125 cursor-copy bg-violet-600 ring-4 ring-violet-200'
      : 'scale-125 cursor-copy bg-blue-600 ring-4 ring-blue-200'
    : inputConnectionState === 'available'
      ? usesAnalysisInputColor
        ? 'cursor-copy bg-violet-500 ring-4 ring-violet-100'
        : 'cursor-copy bg-blue-500 ring-4 ring-blue-100'
      : inputConnectionState === 'invalid'
        ? 'cursor-not-allowed bg-slate-200 opacity-60'
        : sourceCount > 0
          ? isPresentation ? 'cursor-default bg-violet-600' : 'cursor-default bg-blue-600'
          : 'cursor-default bg-slate-300';

  return (
    <article
      data-canvas-node-id={node.id}
      className={`pointer-events-auto absolute overflow-visible rounded-xl border bg-white shadow-lg transition-shadow ${
        selected
          ? 'z-20 border-violet-400 ring-4 ring-violet-100'
          : 'z-10 border-slate-200 hover:border-slate-300'
      }`}
      style={{ left: node.x, top: node.y, width: RESULT_CARD_SIZE.width, height: RESULT_CARD_SIZE.height }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
      aria-label={`成果卡片：${config?.name || '尚未命名'}`}
    >
      <button
        type="button"
        data-connection-handle="input"
        data-connection-node-id={node.id}
        disabled={!onInputPointerDown && !inputConnectionState}
        onPointerDown={(event) => {
          event.stopPropagation();
          onInputPointerDown?.(event, node.id);
        }}
        className={`absolute -left-2.5 top-1/2 size-5 -translate-y-1/2 rounded-full border-[3px] border-white shadow-sm transition ${inputConnectionClass}`}
        aria-label="成果輸入連接點"
        title={inputConnectionState === 'hovered'
          ? '放開以建立連線'
          : inputConnectionState === 'available'
            ? '可連接到這張成果卡片'
            : inputConnectionState === 'invalid'
              ? '這張成果卡片不接受目前的連線'
              : onInputPointerDown
                ? isPresentation ? '拖曳以連接分析成果' : '拖曳以連接來源卡片'
          : sourceCount > 0
            ? `已連接 ${sourceCount} 個${isPresentation ? '分析成果' : '來源'}`
            : `請在成果設定中選擇${isPresentation ? '分析成果' : '來源'}`}
      />

      <div
        className="flex cursor-grab touch-none items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 active:cursor-grabbing"
        onPointerDown={(event) => {
          event.stopPropagation();
          if (onSelect(node.id) === false) return;
          onPointerDown(event, node.id);
        }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
            <FileOutput className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-violet-700">成果</p>
            <h3 className="truncate text-sm font-semibold text-slate-950">
              {config?.name || '未設定的成果'}
            </h3>
          </div>
        </div>
        <GripHorizontal className="size-4 shrink-0 text-slate-300" aria-hidden="true" />
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-3">
          <ResultIcon className="mt-0.5 size-4 shrink-0 text-slate-500" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-medium text-slate-700">{resultType}</p>
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
                {isPresentation ? sourceCount > 0 ? `${sourceCount} 個分析` : '需分析成果' : `${sourceCount} 個來源`}
              </span>
            </div>
            <p
              className="mt-1 max-h-8 overflow-hidden break-words text-[11px] leading-4 text-slate-500"
              title={promptSummary}
            >
              {promptSummary}
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${
            isReadyForGeneration
              ? 'bg-violet-50 text-violet-700'
              : 'bg-amber-50 text-amber-700'
          }`}
        >
          <span className={`size-1.5 rounded-full ${isReadyForGeneration ? 'bg-violet-500' : 'bg-amber-500'}`} />
          {isRunning
              ? isPresentation ? '正在產生簡報' : '小幫手分析中'
            : activeExecution?.view?.kind === 'error'
                ? `${isPresentation ? '簡報產生失敗' : '分析失敗'}${activeExecution.view.retriable ? '，可重試' : '，請檢查設定'}`
              : !isPresentation && execution?.view?.status === 'blocked'
                ? '資料限制阻擋分析'
                : activeExecution?.state === 'ready'
                  ? isPresentation ? '可下載 PPTX' : '分析結果已產生'
                  : isReadyForGeneration
                    ? isPresentation ? '可產生真實簡報' : '可執行真實分析'
            : isConfigured
              ? isPresentation ? '設定已儲存，分析尚未完成' : '設定已儲存，來源尚待設定'
              : '尚未設定'}
        </span>

        <div className="flex items-center gap-2 pt-1">
          {isReadyForGeneration && onRun && (
            <button
              type="button"
              disabled={isRunning}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onRun(node.id)}
              className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-700 text-xs font-medium text-white transition hover:bg-violet-800 disabled:cursor-wait disabled:bg-violet-400"
            >
              {isRunning ? <LoaderCircle className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              {isRunning
                ? isPresentation ? '產生中…' : '分析中…'
                : activeExecution
                  ? isPresentation ? '重新產生' : '重新分析'
                  : isPresentation ? '產生簡報' : '執行分析'}
            </button>
          )}
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onEdit(node.id)}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 ${isReadyForGeneration ? 'size-8' : 'flex-1'}`}
            aria-label="編輯成果設定"
          >
            <Pencil className="size-3.5" />
            {!isReadyForGeneration && (isConfigured ? '編輯設定' : '設定成果')}
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => onDelete(node.id)}
            className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            aria-label={`刪除${config?.name || '成果'}卡片`}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <button
        type="button"
        data-connection-handle="output"
        data-connection-node-id={node.id}
        disabled={!onOutputPointerDown}
        onPointerDown={(event) => {
          event.stopPropagation();
          onOutputPointerDown?.(event, node.id);
        }}
        className={`absolute -right-2.5 top-1/2 size-5 -translate-y-1/2 rounded-full border-[3px] border-white shadow-sm transition ${
          onOutputPointerDown
            ? `cursor-crosshair bg-violet-600 hover:bg-violet-700 ${outputConnecting ? 'scale-125 ring-4 ring-violet-200' : ''}`
            : 'cursor-not-allowed bg-slate-300'
        }`}
        aria-label="成果輸出連接點"
        title={onOutputPointerDown ? '拖曳以連接其他卡片' : '卡片連線將在後續功能開放'}
      />
    </article>
  );
}
