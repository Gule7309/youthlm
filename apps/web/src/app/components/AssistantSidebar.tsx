import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Bot,
  FilePlus2,
  Send,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { AssistantConfig } from '../types';
import { getChartDraftActions, PRESENTATION_UNAVAILABLE_MESSAGE } from '../result-policy';

type AssistantSidebarProps = {
  config: AssistantConfig;
  sourceCount: number;
  resultCount: number;
  contextLabels: string[];
  onSubmit: (prompt: string) => void;
  onExecuteDraft?: () => void;
};

const SUGGESTED_PROMPTS = [
  '依目前來源建立洞察圖表草稿',
  '比較目前資料的主要趨勢與限制',
  '規劃政策會議需要的分析成果',
];

export function AssistantSidebar({
  config,
  sourceCount,
  resultCount,
  contextLabels,
  onSubmit,
  onExecuteDraft,
}: AssistantSidebarProps) {
  const [prompt, setPrompt] = useState('');
  const conversationRef = useRef<HTMLDivElement>(null);
  const draftActions = getChartDraftActions(config.draftActions);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (conversation) conversation.scrollTop = conversation.scrollHeight;
  }, [config.messages.length, draftActions.length]);

  const submitPrompt = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
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
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-700">前端示意</span>
            </div>
            <p className="mt-0.5 text-[10px] text-slate-500">這段對話會保存在目前筆記本</p>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="font-semibold text-emerald-900">目前畫布內容</span>
            <span className="text-emerald-700">{sourceCount} 個來源 · {resultCount} 個成果</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {contextLabels.length ? contextLabels.slice(0, 4).map(label => (
              <span key={label} className="max-w-full truncate rounded-full bg-white px-2 py-1 text-[9px] text-slate-600 ring-1 ring-emerald-100">
                @{label}
              </span>
            )) : (
              <span className="text-[9px] text-slate-500">新增來源後，小幫手會將它納入操作草稿。</span>
            )}
            {contextLabels.length > 4 && <span className="px-1 py-1 text-[9px] text-slate-500">另有 {contextLabels.length - 4} 項</span>}
          </div>
        </div>
      </header>

      <div ref={conversationRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 px-3 py-3" aria-live="polite">
        {config.messages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-5 text-center">
            <Sparkles className="mx-auto size-5 text-emerald-600" />
            <p className="mt-2 text-xs font-semibold text-slate-800">直接描述想完成的政策工作</p>
            <p className="mt-1.5 text-[10px] leading-4 text-slate-500">
              小幫手會依目前來源準備圖表草稿；真正的自由對話與畫布工具仍待後端 Agent 串接。
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {config.messages.map(message => {
              const isUser = message.role === 'user';
              const MessageIcon = isUser ? UserRound : Bot;
              return (
                <div key={message.id} className={`flex items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                  <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${isUser ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>
                    <MessageIcon className="size-3" />
                  </span>
                  <p className={`max-w-[285px] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-[11px] leading-4 ${isUser ? 'rounded-tr-sm bg-slate-800 text-white' : 'rounded-tl-sm border border-slate-200 bg-white text-slate-700'}`}>
                    {message.content}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {draftActions.length > 0 && (
          <section className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3" aria-label="小幫手操作草稿">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-950">
                <FilePlus2 className="size-3.5" />
                待確認的畫布操作
              </span>
              <span className="text-[10px] text-emerald-700">{draftActions.length} 項</span>
            </div>
            <div className="mt-2 space-y-1.5">
              {draftActions.map(action => (
                <div key={action.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 ring-1 ring-emerald-100">
                  <BarChart3 className="size-3.5 shrink-0 text-emerald-700" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-medium text-slate-700">{action.name}</p>
                    <p className="mt-0.5 text-[9px] text-slate-500">圖表草稿 · {action.sourceNodeIds.length} 個來源</p>
                  </div>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={!onExecuteDraft}
              onClick={onExecuteDraft}
              className="mt-2.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-700 text-[11px] font-medium text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              <FilePlus2 className="size-3.5" />
              確認並建立到白板
            </button>
          </section>
        )}
      </div>

      <footer className="border-t border-slate-100 bg-white p-3">
        <p className="mb-2 text-[9px] leading-3 text-amber-700">{PRESENTATION_UNAVAILABLE_MESSAGE}</p>
        {config.messages.length === 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="建議提問">
            {SUGGESTED_PROMPTS.map(suggestion => (
              <button key={suggestion} type="button" onClick={() => setPrompt(suggestion)} className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-1 text-[9px] text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50">
                {suggestion}
              </button>
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
            placeholder="詢問目前畫布或描述想建立的成果…"
            className="min-h-[58px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-xs leading-4 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
            aria-label="輸入給 AI 小幫手的工作"
          />
          <button type="button" disabled={!prompt.trim()} onClick={submitPrompt} className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-700 text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300" aria-label="送出給 AI 小幫手">
            <Send className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[9px] text-slate-400">Enter 送出 · Shift + Enter 換行 · 畫布操作會先要求確認</p>
      </footer>
    </section>
  );
}
