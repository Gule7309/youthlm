import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bot,
  Database,
  FilePlus2,
  LoaderCircle,
  Presentation,
  RotateCcw,
  Send,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type {
  AssistantConfig,
  AssistantContextKind,
  AssistantContextOption,
  AssistantExecution,
} from '../types';
import { getChartDraftActions } from '../result-policy';

type AssistantSidebarProps = {
  config: AssistantConfig;
  sourceCount: number;
  resultCount: number;
  contextOptions: AssistantContextOption[];
  execution?: AssistantExecution;
  hasUnavailableContext?: boolean;
  onSubmit: (prompt: string) => void;
  onToggleContext: (canvasNodeId: string) => void;
  onRetry?: () => void;
  onExecuteDraft?: () => void;
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

export function AssistantSidebar({
  config,
  sourceCount,
  resultCount,
  contextOptions,
  execution,
  hasUnavailableContext = false,
  onSubmit,
  onToggleContext,
  onRetry,
  onExecuteDraft,
}: AssistantSidebarProps) {
  const [prompt, setPrompt] = useState('');
  const conversationRef = useRef<HTMLDivElement>(null);
  const draftActions = getChartDraftActions(config.draftActions);
  const selectedContextNodeIds = config.contextNodeIds ?? [];
  const isRunning = execution?.state === 'running';
  const errorView = execution?.view?.kind === 'error' ? execution.view : undefined;

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [config.messages.length, draftActions.length]);

  const submitPrompt = () => {
    const trimmed = prompt.trim();
    if (!trimmed || isRunning || hasUnavailableContext) return;
    onSubmit(trimmed);
    setPrompt('');
  };

  return (
    <section className="flex h-full min-w-0 flex-col" aria-label="AI 小幫手聊天室">
      <header className="border-b border-border/60 px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <Bot className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-950">AI 小幫手</h2>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700">Agent 已串接</span>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">{sourceCount} 個來源 · {resultCount} 個成果</p>
          </div>
        </div>

        <section className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5" aria-label="小幫手引用脈絡">
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="font-semibold text-emerald-900">明確引用筆記本證據</span>
            <span className="text-emerald-700">已選 {selectedContextNodeIds.length}</span>
          </div>
          {contextOptions.length > 0 ? (
            <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
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
                    onClick={() => onToggleContext(option.canvasNodeId)}
                    disabled={isRunning}
                    className={`flex max-w-full items-center gap-1 rounded-full border px-2 py-1 text-[9px] transition ${
                      checked
                        ? 'border-emerald-300 bg-white text-emerald-800'
                        : 'border-slate-200 bg-white/70 text-slate-500 hover:border-emerald-200'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                    aria-pressed={checked}
                    title={`${CONTEXT_LABELS[option.kind]}｜${option.title}`}
                  >
                    <ContextIcon className="size-3 shrink-0" />
                    <span className="max-w-48 truncate">{option.title}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-1.5 text-[9px] leading-3 text-slate-500">完成來源設定或分析後，即可在這裡選取證據。</p>
          )}
          {hasUnavailableContext && (
            <p className="mt-1.5 text-[9px] leading-3 text-amber-700">已選引用正在更新；完成後才能送出。</p>
          )}
        </section>
      </header>

      <div ref={conversationRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-3 py-3" aria-live="polite">
        {config.messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center">
            <Sparkles className="mx-auto size-5 text-emerald-600" />
            <p className="mt-2 text-xs font-semibold text-slate-800">直接詢問目前筆記本內容</p>
            <p className="mt-1.5 text-[10px] leading-4 text-slate-500">先選取來源、分析或簡報；Agent 回答會保留實際引用與工具執行紀錄。</p>
          </div>
        ) : (
          <div className="space-y-3">
            {config.messages.map(message => {
              const isUser = message.role === 'user';
              const MessageIcon = isUser ? UserRound : Bot;
              const referenceCount = message.resolvedReferences?.length ?? 0;
              const toolCount = message.toolExecutions?.length ?? 0;
              return (
                <div key={message.id} className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                  <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>
                    <MessageIcon className="size-3" />
                  </span>
                  <div className={`max-w-[285px] rounded-xl px-3 py-2 text-[11px] leading-4 ${isUser ? 'rounded-tr-sm bg-slate-800 text-white' : 'rounded-tl-sm border border-slate-200 bg-white text-slate-700'}`}>
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    {!isUser && (referenceCount > 0 || toolCount > 0) && (
                      <div className="mt-2 border-t border-slate-100 pt-1.5 text-[9px] text-slate-400">
                        {referenceCount > 0 && <p>已引用 {referenceCount} 項證據</p>}
                        {toolCount > 0 && <p>工具執行 {toolCount} 次</p>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {draftActions.length > 0 && (
          <section className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3" aria-label="小幫手操作草稿">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-950"><FilePlus2 className="size-3.5" />待確認的畫布操作</span>
              <span className="text-[10px] text-emerald-700">{draftActions.length} 項</span>
            </div>
            <div className="mt-2 space-y-1.5">
              {draftActions.map(action => (
                <div key={action.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 ring-1 ring-emerald-100">
                  <BarChart3 className="size-3.5 shrink-0 text-emerald-700" />
                  <p className="min-w-0 flex-1 truncate text-[10px] font-medium text-slate-700">{action.name}</p>
                </div>
              ))}
            </div>
            <button type="button" disabled={!onExecuteDraft} onClick={onExecuteDraft} className="mt-2.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-700 text-[11px] font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300">
              <FilePlus2 className="size-3.5" />確認並建立到白板
            </button>
          </section>
        )}
      </div>

      <footer className="border-t border-slate-100 bg-white p-3">
        {isRunning && (
          <p className="mb-2 flex items-center gap-1.5 text-[10px] text-emerald-700" role="status"><LoaderCircle className="size-3 animate-spin" />YouthLM Agent 正在查詢與整理證據…</p>
        )}
        {errorView && (
          <div className="mb-2 flex items-start justify-between gap-2 rounded-md bg-red-50 px-2 py-1.5 text-[10px] text-red-700" role="alert">
            <span className="flex min-w-0 items-start gap-1"><AlertCircle className="mt-0.5 size-3 shrink-0" /><span>{errorView.message}</span></span>
            {errorView.retriable && onRetry && (
              <button type="button" onClick={onRetry} className="flex shrink-0 items-center gap-1 font-medium hover:text-red-900"><RotateCcw className="size-3" />重試</button>
            )}
          </div>
        )}
        {config.messages.length === 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="建議提問">
            {SUGGESTED_PROMPTS.map(suggestion => (
              <button key={suggestion} type="button" onClick={() => setPrompt(suggestion)} className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50">{suggestion}</button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submitPrompt();
              }
            }}
            rows={2}
            maxLength={1000}
            disabled={isRunning}
            placeholder="詢問目前畫布或政策資料…"
            className="min-h-[58px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-xs leading-4 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50"
            aria-label="輸入給 AI 小幫手的工作"
          />
          <button type="button" disabled={!prompt.trim() || isRunning || hasUnavailableContext} onClick={submitPrompt} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300" aria-label="送出給 AI 小幫手">
            <Send className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[9px] text-slate-400">Enter 送出 · Shift + Enter 換行 · 僅傳送明確選取的引用</p>
      </footer>
    </section>
  );
}
