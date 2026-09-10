import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Check,
  Database,
  FileCheck2,
  FileText,
  Info,
  Presentation,
  X,
} from 'lucide-react';
import type {
  AnalysisExecution,
  CanvasNode,
  PresentationExecution,
  ReportExecution,
  ResultConfig,
} from '../types';
import { AnalysisResultPanel } from './AnalysisResultPanel';
import { PresentationResultPanel } from './PresentationResultPanel';
import { ReportResultPanel } from './ReportResultPanel';

type EditableResultKind = Exclude<ResultConfig['kind'], null>;

export type ResultInspectorProps = {
  node: CanvasNode;
  sourceNodes: CanvasNode[];
  analysisNodes: CanvasNode[];
  analysisExecutions: Record<string, AnalysisExecution>;
  execution?: AnalysisExecution;
  presentationExecution?: PresentationExecution;
  reportExecution?: ReportExecution;
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

function analysisIsReady(execution: AnalysisExecution | undefined) {
  return Boolean(
    execution?.state === 'ready'
    && execution.view
    && execution.view.kind !== 'error'
    && execution.view.kind !== 'blocked'
    && (execution.view.status === 'completed' || execution.view.status === 'partial'),
  );
}

function analysisStateLabel(execution: AnalysisExecution | undefined) {
  if (execution?.state === 'running') return '分析中';
  if (execution?.view?.kind === 'blocked') return '已被資料限制阻擋';
  if (execution?.state === 'failed' || execution?.view?.kind === 'error') return '分析失敗';
  if (analysisIsReady(execution)) {
    return execution?.view?.status === 'partial'
      ? '部分相容，可產生 Artifact'
      : '分析完成，可產生 Artifact';
  }
  return '請先執行這張圖表';
}

export function ResultInspector({
  node,
  sourceNodes,
  analysisNodes,
  analysisExecutions,
  execution,
  presentationExecution,
  reportExecution,
  onSave,
  onRun,
  onClose,
  onDirtyChange,
}: ResultInspectorProps) {
  const sourceNodeIdsKey = sourceNodes.map(sourceNode => sourceNode.id).join('|');
  const analysisNodeIdsKey = analysisNodes.map(analysisNode => analysisNode.id).join('|');
  const [kind, setKind] = useState<EditableResultKind | null>(node.result?.kind ?? null);
  const [name, setName] = useState(node.result?.name ?? '');
  const [sourceNodeIds, setSourceNodeIds] = useState<string[]>(node.result?.sourceNodeIds ?? []);
  const [sourceModuleIds, setSourceModuleIds] = useState<string[]>(node.result?.sourceModuleIds ?? []);
  const isPresentation = kind === 'presentation';
  const isReport = kind === 'report';
  const usesAnalysisModules = isPresentation || isReport;
  const [prompt, setPrompt] = useState(node.result?.prompt ?? '');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const selectedSourcesReady = sourceNodeIds.length > 0 && sourceNodeIds.every(sourceNodeId => {
    const sourceNode = sourceNodes.find(source => source.id === sourceNodeId);
    return sourceNode ? sourceIsReady(sourceNode) : false;
  });
  const selectedAnalysesReady = sourceModuleIds.length > 0 && sourceModuleIds.every(
    sourceModuleId => analysisIsReady(analysisExecutions[sourceModuleId]),
  );

  useEffect(() => {
    const availableSourceNodeIds = new Set(sourceNodes.map(sourceNode => sourceNode.id));
    const availableAnalysisNodeIds = new Set(analysisNodes.map(analysisNode => analysisNode.id));
    setKind(node.result?.kind ?? null);
    setName(node.result?.name ?? '');
    setSourceNodeIds((node.result?.sourceNodeIds ?? []).filter(
      sourceNodeId => availableSourceNodeIds.has(sourceNodeId),
    ));
    setSourceModuleIds((node.result?.sourceModuleIds ?? []).filter(
      sourceModuleId => availableAnalysisNodeIds.has(sourceModuleId),
    ));
    setPrompt(node.result?.prompt ?? '');
    setError('');
    setSaved(false);
    setDirty(false);
    onDirtyChange?.(false);
  }, [node.id, sourceNodeIdsKey, analysisNodeIdsKey]);

  const markDirty = () => {
    setDirty(true);
    setSaved(false);
    onDirtyChange?.(true);
  };

  const chooseKind = (nextKind: EditableResultKind) => {
    setKind(nextKind);
    if (nextKind === 'chart') setSourceModuleIds([]);
    else setSourceNodeIds([]);
    setError('');
    markDirty();
  };

  const toggleAnalysis = (analysisNodeId: string) => {
    if (!analysisIsReady(analysisExecutions[analysisNodeId])) return;
    setSourceModuleIds(currentIds => currentIds.includes(analysisNodeId)
      ? currentIds.filter(id => id !== analysisNodeId)
      : [...currentIds, analysisNodeId]);
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

    if (!kind) {
      setError('請選擇洞察圖表、研析報告或洞察簡報。');
      return;
    }
    if (kind === 'chart' && sourceNodeIds.length === 0) {
      setError('請至少選擇一張來源卡片。');
      return;
    }
    if (usesAnalysisModules && sourceModuleIds.length === 0) {
      setError('請至少選擇一張已完成的分析成果。');
      return;
    }
    if (!trimmedName) {
      setError('請輸入成果名稱。');
      return;
    }
    if (kind === 'chart' && !trimmedPrompt) {
      setError('請描述希望產生的內容與洞察方向。');
      return;
    }

    onSave({
      kind,
      name: trimmedName,
      sourceNodeIds: kind === 'chart' ? sourceNodeIds : [],
      sourceModuleIds: usesAnalysisModules ? sourceModuleIds : undefined,
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

  const activeExecution = isPresentation
    ? presentationExecution
    : isReport
      ? reportExecution
      : execution;
  const settingsReady = usesAnalysisModules ? selectedAnalysesReady : selectedSourcesReady;
  const canSave = usesAnalysisModules ? analysisNodes.length > 0 : sourceNodes.length > 0;

  return (
    <section className="flex h-full min-h-0 flex-col bg-white" aria-label="成果設定">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
              {isPresentation
                ? <Presentation className="size-4" />
                : isReport
                  ? <FileText className="size-4" />
                  : <BarChart3 className="size-4" />}
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
          圖表分析已安裝資料；研析報告與簡報則從已保存的分析成果產生可編輯檔案。
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div>
          <span className="mb-2 block text-xs font-semibold text-slate-700">成果類型</span>
          <div className="grid grid-cols-3 gap-2">
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
              onClick={() => chooseKind('report')}
              className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border px-2 text-center text-xs font-medium transition ${
                kind === 'report'
                  ? 'border-violet-400 bg-violet-50 text-violet-700 ring-2 ring-violet-100'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
              aria-pressed={kind === 'report'}
            >
              <FileText className="size-5" />
              研析報告
              <span className="text-[10px] font-normal">DOCX</span>
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
              <span className="text-[10px] font-normal">可下載 PPTX</span>
            </button>
          </div>
        </div>

        {usesAnalysisModules ? (
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">使用的分析成果</span>
              {analysisNodes.length > 0 && (
                <span className="text-[11px] text-slate-500">已選 {sourceModuleIds.length} 個</span>
              )}
            </div>
            {analysisNodes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-5 text-center">
                <FileCheck2 className="mx-auto size-6 text-amber-600" />
                <p className="mt-2 text-xs font-semibold text-amber-900">目前沒有圖表成果</p>
                <p className="mt-1 text-[11px] leading-4 text-amber-700">請先新增洞察圖表並完成一次真實分析。</p>
              </div>
            ) : (
              <div className="space-y-2">
                {analysisNodes.map(analysisNode => {
                  const analysisExecution = analysisExecutions[analysisNode.id];
                  const ready = analysisIsReady(analysisExecution);
                  const checked = sourceModuleIds.includes(analysisNode.id);
                  return (
                    <button
                      key={analysisNode.id}
                      type="button"
                      disabled={!ready}
                      onClick={() => toggleAnalysis(analysisNode.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-3 text-left transition ${
                        checked
                          ? 'border-violet-300 bg-violet-50'
                          : ready
                            ? 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                            : 'cursor-not-allowed border-slate-200 bg-slate-50 opacity-65'
                      }`}
                      role="checkbox"
                      aria-checked={checked}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <BarChart3 className={`size-4 shrink-0 ${checked ? 'text-violet-600' : 'text-slate-400'}`} />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-semibold text-slate-700">
                            {analysisNode.result?.name || '未命名圖表'}
                          </span>
                          <span className="mt-0.5 block text-[11px] text-slate-500">
                            {analysisStateLabel(analysisExecution)}
                          </span>
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
        ) : (
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
        )}

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
            placeholder={isPresentation
              ? '例如：板橋區青年人口政策簡報'
              : isReport
                ? '例如：板橋區青年人口議題研析報告'
                : '例如：教育程度與起薪比較圖'}
            maxLength={80}
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">
            {isPresentation
              ? '簡報生成指示（選填）'
              : isReport
                ? '報告編製指示（選填）'
                : '分析問題／解讀重點'}
          </span>
          <textarea
            value={prompt}
            onChange={(event) => {
              setPrompt(event.target.value);
              setError('');
              markDirty();
            }}
            className="min-h-32 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            placeholder={usesAnalysisModules
              ? isReport
                ? '例如：以政策研析格式整理，保留資料限制、來源與版本。'
                : '例如：以政策會議語氣整理，保留資料限制、來源與圖表。'
              : '例如：說明 2022–2024 年的變化趨勢，並提出兩項政策觀察。'}
            maxLength={1200}
          />
          <span className="mt-1.5 flex items-start justify-between gap-3 text-[10px] leading-4 text-slate-400">
            <span>{usesAnalysisModules
              ? `${isReport ? '報告' : '簡報'}使用已保存的結構化分析；編製指示不會改寫原始數據、來源或警告。`
              : '此欄位不會改變資料範圍；年份、年齡、性別與地區請至來源卡設定。'}</span>
            <span className="shrink-0">{prompt.length}/1200</span>
          </span>
        </label>

        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-[11px] leading-5 text-blue-800">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          {usesAnalysisModules
            ? `${isReport ? '報告' : '簡報'}直接使用 Contract v0 AnalysisResult 產生，不是擷取畫面；警告、來源與資料版本會一併保留。`
            : '圖表只使用 Contract v0 的 result_data 與 visualization；展開執行紀錄可核對問題、篩選條件、工具與資料版本。'}
        </div>
        {isPresentation
          ? <PresentationResultPanel execution={presentationExecution} onRetry={onRun} />
          : isReport
            ? <ReportResultPanel execution={reportExecution} onRetry={onRun} />
            : <AnalysisResultPanel execution={execution} onRetry={onRun} />}
      </div>

      <div className="border-t border-slate-200 bg-white px-5 py-4">
        {error && <p className="mb-2 text-xs text-red-600" role="alert">{error}</p>}
        {saved && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-emerald-600" role="status">
            <Check className="size-3.5" />
            {settingsReady
              ? isPresentation ? '設定已更新，可產生簡報' : isReport ? '設定已更新，可產生報告' : '設定已更新，可執行分析'
              : usesAnalysisModules ? '設定已更新，請先完成所選分析' : '前端設定已更新，請先完成所選來源設定'}
          </p>
        )}
        {dirty && !error && (
          <p className="mb-2 text-xs text-amber-700" role="status">有尚未儲存的變更</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className="h-10 rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
          >
            儲存設定
          </button>
          <button
            type="button"
            onClick={onRun}
            disabled={!onRun || dirty || activeExecution?.state === 'running'}
            className="h-10 rounded-lg bg-violet-700 text-sm font-medium text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {activeExecution?.state === 'running'
              ? usesAnalysisModules ? '產生中…' : '分析中…'
              : activeExecution
                ? usesAnalysisModules ? '重新產生' : '重新分析'
                : isPresentation ? '產生簡報' : isReport ? '產生報告' : '執行分析'}
          </button>
        </div>
      </div>
    </section>
  );
}
