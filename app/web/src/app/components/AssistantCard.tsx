import React, { useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  Bot,
  FilePlus2,
  GripHorizontal,
  Presentation,
  Send,
  Sparkles,
  Trash2,
  UserRound,
} from 'lucide-react';
import type { AssistantDraftAction, CanvasNode } from '../types';

export type AssistantCardProps = {
  node: CanvasNode;
  selected?: boolean;
  onSelect: (id: string) => boolean | void;
  onDelete: (id: string) => void;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>, id: string) => void;
  onSubmit: (id: string, prompt: string) => void;
  onExecuteDraft?: (id: string) => void;
};

const SUGGESTED_PROMPTS = [
  '依目前來源建立洞察圖表與政策簡報草稿',
  '規劃教育程度與起薪的圖表及簡報',
  '整理政策會議用的圖表與簡報操作草稿',
];

function getDraftLabel(action: AssistantDraftAction) {
  return action.kind === 'chart' ? '洞察圖表' : '洞察簡報';
}

export function AssistantCard({
  node,
  selected = false,
  onSelect,
  onDelete,
  onPointerDown,
  onSubmit,
  onExecuteDraft,
}: AssistantCardProps) {
  const [prompt, setPrompt] = useState('');
  const conversationRef = useRef<HTMLDivElement>(null);
  const config = node.assistant;
  const messages = config?.messages ?? [];
  const draftActions = config?.draftActions ?? [];

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    conversation.scrollTop = conversation.scrollHeight;
  }, [messages.length, draftActions.length]);

  const submitPrompt = () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return;

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
                前端示意
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
        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-center">
            <Sparkles className="mx-auto size-4 text-emerald-600" />
            <p className="mt-2 text-xs font-medium text-slate-700">可以先描述你想完成的工作</p>
            <p className="mt-1 text-[10px] leading-4 text-slate-500">
              目前不會分析資料；真正的 AI 回覆需等待後端串接。
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
                      <span className="sr-only">{isUser ? '使用者' : '小幫手前端示意'}：</span>
                      {message.content}
                    </p>
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
                const DraftIcon = action.kind === 'chart' ? BarChart3 : Presentation;

                return (
                  <div key={action.id} className="flex items-center gap-2 rounded-md bg-white/80 px-2 py-1.5">
                    <DraftIcon className="size-3.5 shrink-0 text-emerald-700" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-slate-700">{action.name}</p>
                      <p className="text-[9px] text-slate-500">
                        {getDraftLabel(action)} · {action.sourceIds.length} 個來源
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
              僅建立卡片設定，不會產生圖表或簡報內容
            </p>
          </section>
        )}
      </div>

      <div className="rounded-b-xl border-t border-slate-100 bg-white p-3">
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
            disabled={!prompt.trim()}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              submitPrompt();
            }}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-700 text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            aria-label="送出工作"
            title="送出前端操作示意；真正 AI 等待後端"
          >
            <Send className="size-4" />
          </button>
        </div>
        <p className="mt-1.5 text-[9px] text-slate-400">
          Enter 送出，Shift + Enter 換行 · AI 與資料分析尚未串接
        </p>
      </div>
    </article>
  );
}
