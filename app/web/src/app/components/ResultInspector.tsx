import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Check,
  Database,
  Info,
  Presentation,
  X,
} from 'lucide-react';
import type { CanvasNode, ResultConfig } from '../types';

type EditableResultKind = Exclude<ResultConfig['kind'], null>;

export type ResultInspectorProps = {
  node: CanvasNode;
  sourceNodes: CanvasNode[];
  onSave: (config: ResultConfig) => void;
  onClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

function sourceTypeLabel(sourceNode: CanvasNode) {
  if (sourceNode.source?.enabled === false) return '已停用';
  if (sourceNode.source?.kind === 'file') return '上傳檔案';
  if (sourceNode.source?.kind === 'api') return '公開 API';
  return '尚未設定';
}

function sourceIsReady(sourceNode: CanvasNode) {
  if (!sourceNode.source?.enabled) return false;
  if (sourceNode.source.kind === 'file') return Boolean(sourceNode.source.file?.name);
  if (sourceNode.source.kind === 'api') return Boolean(sourceNode.source.apiUrl?.trim());
  return false;
}

export function ResultInspector({
  node,
  sourceNodes,
  onSave,
  onClose,
  onDirtyChange,
}: ResultInspectorProps) {
  const sourceNodeIdsKey = sourceNodes.map(sourceNode => sourceNode.id).join('|');
  const [kind, setKind] = useState<EditableResultKind | null>(node.result?.kind ?? null);
  const [name, setName] = useState(node.result?.name ?? '');
  const [sourceIds, setSourceIds] = useState<string[]>(node.result?.sourceIds ?? []);
  const [prompt, setPrompt] = useState(node.result?.prompt ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const selectedSourcesReady = sourceIds.length > 0 && sourceIds.every(sourceId => {
    const sourceNode = sourceNodes.find(source => source.id === sourceId);
    return sourceNode ? sourceIsReady(sourceNode) : false;
  });

  useEffect(() => {
    const availableSourceIds = new Set(sourceNodes.map(sourceNode => sourceNode.id));
    setKind(node.result?.kind ?? null);
    setName(node.result?.name ?? '');
    setSourceIds((node.result?.sourceIds ?? []).filter(sourceId => availableSourceIds.has(sourceId)));
    setPrompt(node.result?.prompt ?? '');
    setError('');
    setSaved(false);
    setDirty(false);
    onDirtyChange?.(false);
  }, [node.id, sourceNodeIdsKey]);

  const markDirty = () => {
    setDirty(true);
    setSaved(false);
    onDirtyChange?.(true);
  };

  const chooseKind = (nextKind: EditableResultKind) => {
    setKind(nextKind);
    setError('');
    markDirty();
  };

  const toggleSource = (sourceId: string) => {
    setSourceIds(currentIds => currentIds.includes(sourceId)
      ? currentIds.filter(id => id !== sourceId)
      : [...currentIds, sourceId]);
    setError('');
    markDirty();
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();

    if (!kind) {
      setError('請選擇要產生圖表或簡報。');
      return;
    }
    if (sourceIds.length === 0) {
      setError('請至少選擇一張來源卡片。');
      return;
    }
    if (!trimmedName) {
      setError('請輸入成果名稱。');
      return;
    }
    if (!trimmedPrompt) {
      setError('請描述希望產生的內容與洞察方向。');
      return;
    }

    onSave({
      kind,
      name: trimmedName,
      sourceIds,
      prompt: trimmedPrompt,
    });
    setError('');
    setSaved(true);
    setDirty(false);
    onDirtyChange?.(false);
  };

  const handleClose = () => {
    if (dirty && !window.confirm('成果設定尚未儲存，確定要放棄這次修改嗎？')) return;
    setDirty(false);
    onDirtyChange?.(false);
    onClose?.();
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-white" aria-label="成果設定">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
              <BarChart3 className="size-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-violet-700">成果卡片</p>
              <h2 className="text-base font-semibold text-slate-950">設定分析成果</h2>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={handleClose}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="關閉成果設定"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          選擇資料來源並描述分析需求。此版本只保存設定，不會實際產生圖表或簡報。
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div>
          <span className="mb-2 block text-xs font-semibold text-slate-700">成果類型</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => chooseKind('chart')}
              className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border px-3 text-center text-xs font-medium transition ${
                kind === 'chart'
                  ? 'border-violet-400 bg-violet-50 text-violet-700 ring-2 ring-violet-100'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
              aria-pressed={kind === 'chart'}
            >
              <BarChart3 className="size-5" />
              洞察圖表
            </button>
            <button
              type="button"
              onClick={() => chooseKind('presentation')}
              className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border px-3 text-center text-xs font-medium transition ${
                kind === 'presentation'
                  ? 'border-violet-400 bg-violet-50 text-violet-700 ring-2 ring-violet-100'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
              aria-pressed={kind === 'presentation'}
            >
              <Presentation className="size-5" />
              洞察簡報
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">使用的來源</span>
            {sourceNodes.length > 0 && (
              <span className="text-[11px] text-slate-500">已選 {sourceIds.length} 個</span>
            )}
          </div>

          {sourceNodes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-5 text-center">
              <Database className="mx-auto size-6 text-amber-600" />
              <p className="mt-2 text-xs font-semibold text-amber-900">目前沒有可使用的來源</p>
              <p className="mt-1 text-[11px] leading-4 text-amber-700">請先在白板新增並設定一張來源卡片。</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sourceNodes.map(sourceNode => {
                const checked = sourceIds.includes(sourceNode.id);
                const sourceName = sourceNode.source?.name || '未設定的資料來源';
                return (
                  <button
                    key={sourceNode.id}
                    type="button"
                    onClick={() => toggleSource(sourceNode.id)}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition ${
                      checked
                        ? 'border-violet-300 bg-violet-50'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                    role="checkbox"
                    aria-checked={checked}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Database className={`size-4 shrink-0 ${checked ? 'text-violet-600' : 'text-slate-400'}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold text-slate-700">{sourceName}</span>
                        <span className="mt-0.5 block text-[11px] text-slate-500">{sourceTypeLabel(sourceNode)}</span>
                      </span>
                    </span>
                    <span className={`flex size-5 shrink-0 items-center justify-center rounded border ${
                      checked ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {checked && <Check className="size-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">成果名稱</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError('');
              markDirty();
            }}
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            placeholder={kind === 'presentation' ? '例如：青年就業政策簡報' : '例如：教育程度與起薪比較圖'}
            maxLength={80}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">生成需求</span>
          <textarea
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              setError('');
              markDirty();
            }}
            className="min-h-32 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            placeholder="例如：比較青年教育程度與起薪水準，標示明顯趨勢並整理三項政策建議。"
            maxLength={1200}
          />
          <span className="mt-1.5 block text-right text-[10px] text-slate-400">{prompt.length}/1200</span>
        </label>

        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-800">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          目前只會保存前端設定；圖表繪製、簡報生成、AI 洞察與檔案輸出仍需串接後端服務。
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white px-5 py-4">
        {error && <p className="mb-2 text-xs text-red-600" role="alert">{error}</p>}
        {saved && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-emerald-600" role="status">
            <Check className="size-3.5" />
            {selectedSourcesReady
              ? '前端設定已更新，等待後端生成'
              : '前端設定已更新，請先完成所選來源設定'}
          </p>
        )}
        {dirty && !error && (
          <p className="mb-2 text-xs text-amber-700" role="status">有尚未儲存的變更</p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={sourceNodes.length === 0}
          className="h-10 w-full rounded-lg bg-slate-950 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          儲存成果設定
        </button>
      </div>
    </section>
  );
}
