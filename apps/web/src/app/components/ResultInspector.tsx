import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Check,
  Database,
  Info,
  Presentation,
  X,
} from 'lucide-react';
import type { AnalysisExecution, CanvasNode, ResultConfig } from '../types';
import { AnalysisResultPanel } from './AnalysisResultPanel';
import { PRESENTATION_UNAVAILABLE_MESSAGE } from '../result-policy';

type EditableResultKind = Exclude<ResultConfig['kind'], null>;

export type ResultInspectorProps = {
  node: CanvasNode;
  sourceNodes: CanvasNode[];
  execution?: AnalysisExecution;
  onSave: (config: ResultConfig) => void;
  onRun?: () => void;
  onClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

function sourceTypeLabel(sourceNode: CanvasNode) {
  if (sourceNode.source?.enabled === false) return '已停用';
  if (sourceNode.source?.kind === 'registry') return '已安裝資料集';
  if (sourceNode.source?.kind === 'file') return '上傳檔案';
  if (sourceNode.source?.kind === 'api') return '公開 API';
  return '尚未設定';
}

function sourceIsReady(sourceNode: CanvasNode) {
  if (!sourceNode.source?.enabled) return false;
  if (sourceNode.source.kind === 'registry') return Boolean(sourceNode.source.registrySourceId);
  return false;
}

export function ResultInspector({
  node,
  sourceNodes,
  execution,
  onSave,
  onRun,
  onClose,
  onDirtyChange,
}: ResultInspectorProps) {
  const sourceNodeIdsKey = sourceNodes.map(sourceNode => sourceNode.id).join('|');
  const [kind, setKind] = useState<EditableResultKind | null>(node.result?.kind ?? null);
  const [name, setName] = useState(node.result?.name ?? '');
  const [sourceNodeIds, setSourceNodeIds] = useState<string[]>(node.result?.kind === 'presentation' ? [] : node.result?.sourceNodeIds ?? []);
  const isPresentation = kind === 'presentation';
  const [prompt, setPrompt] = useState(node.result?.prompt ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const selectedSourcesReady = sourceNodeIds.length > 0 && sourceNodeIds.every(sourceNodeId => {
    const sourceNode = sourceNodes.find(source => source.id === sourceNodeId);
    return sourceNode ? sourceIsReady(sourceNode) : false;
  });

  useEffect(() => {
    const availableSourceNodeIds = new Set(sourceNodes.map(sourceNode => sourceNode.id));
    setKind(node.result?.kind ?? null);
    setName(node.result?.name ?? '');
    setSourceNodeIds(node.result?.kind === 'presentation' ? [] : (node.result?.sourceNodeIds ?? []).filter(sourceNodeId => availableSourceNodeIds.has(sourceNodeId)));
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
    if (nextKind === 'presentation') return;
    setKind(nextKind);
    setError('');
    markDirty();
  };

  const toggleSource = (sourceNodeId: string) => {
    setSourceNodeIds(currentIds => currentIds.includes(sourceNodeId)
      ? currentIds.filter(id => id !== sourceNodeId)
      : [...currentIds, sourceNodeId]);
    setError('');
    markDirty();
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    const trimmedPrompt = prompt.trim();

    if (kind !== 'chart') {
      setError(isPresentation ? PRESENTATION_UNAVAILABLE_MESSAGE : '請選擇洞察圖表。');
      return;
    }
    if (sourceNodeIds.length === 0) {
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
      sourceNodeIds,
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
          選擇已安裝資料集並設定資料範圍，再描述希望 YouthLM Agent 如何解讀資料。
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
              disabled
              aria-describedby="presentation-unavailable"
              className={`flex min-h-20 cursor-not-allowed flex-col items-center justify-center gap-2 rounded-lg border px-3 text-center text-xs font-medium opacity-60 ${
                kind === 'presentation'
                  ? 'border-violet-400 bg-violet-50 text-violet-700 ring-2 ring-violet-100'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
              aria-pressed={kind === 'presentation'}
            >
              <Presentation className="size-5" />
              洞察簡報
              <span className="text-[10px] font-normal">尚未提供</span>
            </button>
          </div>
          <p id="presentation-unavailable" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            {PRESENTATION_UNAVAILABLE_MESSAGE}
          </p>
        </div>

        {isPresentation ? (
          <p className="text-sm leading-6 text-slate-600" role="status">
            這張舊簡報草稿暫不可執行，原始來源連線不再使用。可改選「洞察圖表」並重新選擇來源，或保留卡片等待簡報功能開放。
          </p>
        ) : (<>
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">使用的來源</span>
            {sourceNodes.length > 0 && (
              <span className="text-[11px] text-slate-500">已選 {sourceNodeIds.length} 個</span>
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
                const checked = sourceNodeIds.includes(sourceNode.id);
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
            placeholder="例如：教育程度與起薪比較圖"
            maxLength={80}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">分析問題／解讀重點</span>
          <textarea
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              setError('');
              markDirty();
            }}
            className="min-h-32 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            placeholder="例如：說明 2022–2024 年的變化趨勢，並提出兩項政策觀察。"
            maxLength={1200}
          />
          <span className="mt-1.5 flex items-start justify-between gap-3 text-[10px] leading-4 text-slate-400">
            <span>此欄位不會改變資料範圍；年份、年齡、性別與地區請至來源卡設定。</span>
            <span className="shrink-0">{prompt.length}/1200</span>
          </span>
        </label>

        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-[11px] leading-5 text-blue-800">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          圖表只使用 Contract v0 的 result_data 與 visualization；展開執行紀錄可核對問題、篩選條件、工具與資料版本。
        </div>
        <AnalysisResultPanel execution={execution} onRetry={onRun} />
        </>)}
      </div>

      <div className="border-t border-slate-200 bg-white px-5 py-4">
        {error && <p className="mb-2 text-xs text-red-600" role="alert">{error}</p>}
        {saved && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-emerald-600" role="status">
            <Check className="size-3.5" />
            {selectedSourcesReady
              ? '設定已更新，可執行分析'
              : '前端設定已更新，請先完成所選來源設定'}
          </p>
        )}
        {dirty && !error && (
          <p className="mb-2 text-xs text-amber-700" role="status">有尚未儲存的變更</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPresentation || sourceNodes.length === 0}
            className="h-10 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
          >
            {isPresentation ? '簡報尚未提供' : '儲存設定'}
          </button>
          <button
            type="button"
            onClick={onRun}
            disabled={!onRun || dirty || execution?.state === 'running'}
            className="h-10 rounded-lg bg-violet-700 text-sm font-medium text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {execution?.state === 'running' ? '分析中…' : execution ? '重新分析' : '執行分析'}
          </button>
        </div>
      </div>
    </section>
  );
}
