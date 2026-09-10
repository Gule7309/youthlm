import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bot,
  Database,
  FilePlus2,
  GripHorizontal,
  LoaderCircle,
  Presentation,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import type {
  AssistantContextKind,
  AssistantContextOption,
  AssistantExecution,
  CanvasNode,
} from '../types';
import { getChartDraftActions } from '../result-policy';

export type AssistantCardProps = {
  node: CanvasNode;
  selected?: boolean;
  onSelect: (id: string) => boolean | void;
  onDelete: (id: string) => void;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, id: string) => void;
  onSubmit: (id: string, prompt: string) => void;
  contextOptions: AssistantContextOption[];
  execution?: AssistantExecution;
  hasUnavailableContext?: boolean;
  onToggleContext: (assistantId: string, canvasNodeId: string) => void;
  onRetry?: (id: string) => void;
  onExecuteDraft?: (id: string) => void;
};

const SUGGESTED_PROMPTS = [
  '這份分析有哪些資料限制？',
  '比較我引用的成果並整理政策重點',
  '根據目前來源，還缺少哪些資料？',
];

const CONTEXT_LABELS: Record<AssistantContextKind, string> = {
  source: '來源',
  analysis: '分析',
  presentation: '簡報',
};

export function AssistantCard({
  node,
  selected = false,
  onSelect,
  onDelete,
  onPointerDown,
  onSubmit,
  contextOptions,
  execution,
  hasUnavailableContext = false,
  onToggleContext,
  onRetry,
  onExecuteDraft,
}: AssistantCardProps) {
  const [prompt, setPrompt] = useState('');
  const conversationRef = useRef<HTMLDivElement>(null);
  const config = node.assistant;
  const messages = config?.messages ?? [];
  const draftActions = getChartDraftActions(config?.draftActions ?? []);
  const selectedContextNodeIds = config?.contextNodeIds ?? [];
  const isRunning = execution?.state === 'running';
  const errorView = execution?.view?.kind === 'error' ? execution.view : undefined;

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    conversation.scrollTop = conversation.scrollHeight;
  }, [messages.length, draftActions.length]);

  const submitPrompt = () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || isRunning || hasUnavailableContext) return;

    onSubmit(node.id, trimmedPrompt);
    setPrompt('');
  };

  return (
    <article
      className={`pointer-events-auto absolute z-10 flex h-[430px] w-[340px] flex-col overflow-visible rounded-xl border bg-white shadow-lg transition-shadow ${
        selected
          ? 'z-20 border-emerald-400 ring-4 ring-emerald-100'
          : 'border-slate-200 hover:border-slate-300'
      }`}
      style={{ left: node.x, top: node.y }}
      onPointerDown={(event) => {
        event.stopPropagation();
        onSelect(node.id);
      }}
      aria-label={`小幫手卡片：${config?.name || '政策資料小幫手'}`}
    >
      <div
        className="flex cursor-grab touch-none items-center justify-between gap-3 rounded-t-xl border-b border-slate-100 px-4 py-3 active:cursor-grabbing"
        onPointerDown={(event) => {
          event.stopPropagation();
          if (onSelect(node.id) === false) return;
          onPointerDown(event, node.id);
        }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
            <Bot className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-[11px] font-medium text-emerald-700">小幫手</p>
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium text-slate-500">
                AI 已串接
              </span>
            </div>
            <h3 className="truncate text-sm font-semibold text-slate-950">
              {config?.name || '政策資料小幫手'}
            </h3>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(node.id);
            }}
            className="flex size-7 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            aria-label={`刪除${config?.name || '小幫手'}卡片`}
          >
            <Trash2 className="size-3.5" />
          </button>
          <GripHorizontal className="size-4 text-slate-300" aria-hidden="true" />
        </div>
      </div>

      <div
        ref={conversationRef}
        className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-3 py-3"
        aria-live="polite"
      >
        <section className="mb-3 rounded-lg border border-slate-200 bg-white p-2.5" aria-label="小幫手引用脈絡">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold text-slate-700">引用筆記本證據</p>
            <span className="text-[9px] text-slate-400">
              已選 {selectedContextNodeIds.length}
            </span>
          </div>
          {contextOptions.length > 0 ? (
            <div className="mt-2 flex max-h-16 flex-wrap gap-1 overflow-y-auto">
              {contextOptions.map(option => {
                const checked = selectedContextNodeIds.includes(option.canvasNodeId);
                const ContextIcon = option.kind === 'source'
                  ? Database
                  : option.kind === 'analysis'
                    ? BarChart3
                    : Presentation;
                return (
                  <button
                    key={`${option.kind}:${option.canvasNodeId}`}
                    type="button"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleContext(node.id, option.canvasNodeId);
                    }}
                    className={`flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[9px] transition ${
                      checked
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200'
                    }`}
                    aria-pressed={checked}
                    title={`${CONTEXT_LABELS[option.kind]}｜${option.title}`}
                  >
                    <ContextIcon className="size-3 shrink-0" />
                    <span className="max-w-36 truncate">{option.title}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-1.5 text-[9px] leading-3 text-slate-400">
              完成來源設定或分析後，即可在這裡明確引用。
            </p>
          )}
          {hasUnavailableContext && (
            <p className="mt-1.5 text-[9px] leading-3 text-amber-700">
              已選引用正在更新；完成後才能送出。
            </p>
          )}
        </section>

        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-center">
            <Sparkles className="mx-auto size-4 text-emerald-600" />
            <p className="mt-2 text-xs font-medium text-slate-700">可以先描述你想完成的工作</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              可直接提問，或先選取來源、分析與簡報作為可追溯脈絡。
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {messages.map((message) => {
              const isUser = message.role === 'user';
              const MessageIcon = isUser ? UserRound : Bot;

              return (
                <div
                  key={message.id}
                  className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}
                >
                  <span
                    className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${
                      isUser ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'
                    }`}
                    aria-hidden="true"
                  >
                    <MessageIcon className="size-3" />
                  </span>
                  <div
                    className={`max-w-[245px] rounded-xl px-3 py-2 text-[11px] leading-4 ${
                      isUser
                        ? 'rounded-tr-sm bg-slate-800 text-white'
                        : 'rounded-tl-sm border border-slate-200 bg-white text-slate-700'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      <span className="sr-only">{isUser ? '使用者' : '小幫手'}：</span>
                      {message.content}
                    </p>
                    {!isUser && ((message.resolvedReferences?.length ?? 0) > 0 || (message.toolExecutions?.length ?? 0) > 0) && (
                      <div className="mt-2 border-t border-slate-100 pt-1.5 text-[9px] text-slate-400">
                        {(message.resolvedReferences?.length ?? 0) > 0 && (
                          <p>已引用 {message.resolvedReferences?.length} 項證據</p>
                        )}
                        {(message.toolExecutions?.length ?? 0) > 0 && (
                          <p>工具執行 {message.toolExecutions?.length} 次</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {draftActions.length > 0 && (
          <section className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3" aria-label="成果操作草稿">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-900">
                <FilePlus2 className="size-3.5" />
                操作草稿
              </div>
              <span className="text-[10px] font-medium text-emerald-700">{draftActions.length} 項</span>
            </div>

            <div className="mt-2 space-y-1.5">
              {draftActions.map((action) => {
                const DraftIcon = BarChart3;

                return (
                  <div key={action.id} className="flex items-center gap-2 rounded-md bg-white/80 px-2 py-1.5">
                    <DraftIcon className="size-3.5 shrink-0 text-emerald-700" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-slate-700">{action.name}</p>
                      <p className="text-[9px] text-slate-500">
                        洞察圖表 · {action.sourceNodeIds.length} 個來源
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!onExecuteDraft}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onExecuteDraft?.(node.id);
              }}
              className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-700 text-[11px] font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <FilePlus2 className="size-3.5" />
              建立成果草稿
            </button>
            <p className="mt-1.5 text-center text-[9px] leading-3 text-emerald-800">
              僅建立圖表設定，不會執行分析或產生圖表內容
            </p>
          </section>
        )}
      </div>

      <div className="rounded-b-xl border-t border-slate-100 bg-white p-3">
        {isRunning && (
          <p className="mb-2 flex items-center gap-1.5 text-[10px] text-emerald-700" role="status">
            <LoaderCircle className="size-3 animate-spin" />
            YouthLM Agent 正在查詢與整理證據…
          </p>
        )}
        {errorView && (
          <div className="mb-2 flex items-start justify-between gap-2 rounded-md bg-red-50 px-2 py-1.5 text-[10px] text-red-700" role="alert">
            <span className="flex min-w-0 items-start gap-1">
              <AlertCircle className="mt-0.5 size-3 shrink-0" />
              <span>{errorView.message}</span>
            </span>
            {errorView.retriable && onRetry && (
              <button
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onRetry(node.id);
                }}
                className="flex shrink-0 items-center gap-1 font-medium hover:text-red-900"
              >
                <RotateCcw className="size-3" />
                重試
              </button>
            )}
          </div>
        )}
        {messages.length === 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="建議提問">
            {SUGGESTED_PROMPTS.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  setPrompt(suggestion);
                }}
                className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submitPrompt();
              }
            }}
            rows={2}
            maxLength={1000}
            placeholder="輸入想完成的工作…"
            className="min-h-[54px] flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs leading-4 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            aria-label="輸入給小幫手的工作"
          />
          <button
            type="button"
            disabled={!prompt.trim() || isRunning || hasUnavailableContext}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              submitPrompt();
            }}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            aria-label="送出工作"
            title="送出給 YouthLM Agent"
          >
            <Send className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[9px] text-slate-400">
          Enter 送出，Shift + Enter 換行 · 僅傳送明確選取的引用
        </p>
      </div>
    </article>
  );
}
