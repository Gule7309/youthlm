import React, { useEffect, useRef, useState } from 'react';
import {
  Braces,
  Check,
  Database,
  FileSpreadsheet,
  Globe2,
  Info,
  Sparkles,
  UploadCloud,
  X,
} from 'lucide-react';
import type { CanvasNode, SourceConfig, SourceFileMetadata, SourceFilters } from '../types';
import { defaultSourceFilters, loadSourceCatalog, supportsSourceFilters, validateSourceFilters } from '../source-catalog';
import type { CatalogSource } from '../source-catalog';
import { CatalogFilters } from './CatalogFilters';

type EditableSourceKind = Exclude<SourceConfig['kind'], null>;

type SourceInspectorProps = {
  node: CanvasNode;
  onSave: (config: SourceConfig) => void;
  onClose?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};

const ACCEPTED_FILE_EXTENSIONS = ['csv', 'xlsx', 'xls', 'json', 'pdf'];
const FILE_ACCEPT = '.csv,.xlsx,.xls,.json,.pdf,text/csv,application/json,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? '';
}

function getNameWithoutExtension(fileName: string) {
  return fileName.replace(/\.[^/.]+$/, '');
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function toFileMetadata(file: File): SourceFileMetadata {
  return {
    name: file.name,
    size: file.size,
    type: file.type,
    lastModified: file.lastModified,
  };
}

export function SourceInspector({ node, onSave, onClose, onDirtyChange }: SourceInspectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<EditableSourceKind>(node.source?.kind ?? 'registry');
  const [name, setName] = useState(node.source?.name ?? '');
  const [file, setFile] = useState<SourceFileMetadata | undefined>(node.source?.file);
  const [apiUrl, setApiUrl] = useState(node.source?.apiUrl ?? '');
  const [enabled, setEnabled] = useState(node.source?.enabled ?? true);
  const [autoClean, setAutoClean] = useState(node.source?.autoClean ?? true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [registrySourceId, setRegistrySourceId] = useState(node.source?.kind === 'registry' ? node.source.registrySourceId ?? '' : '');
  const [filters, setFilters] = useState<SourceFilters>(() => structuredClone(node.source?.kind === 'registry' ? node.source.filters ?? {} : {}));
  const [catalog, setCatalog] = useState<
    { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; sources: CatalogSource[] }
  >({ status: 'loading' });
  const [reload, setReload] = useState(0);
  const selectedDataset = catalog.status === 'ready' ? catalog.sources.find(source => source.source_id === registrySourceId) : undefined;
  const registryIssue = catalog.status !== 'ready' ? '請先載入資料目錄。'
    : !selectedDataset ? '請選擇目前可用的資料集。' : validateSourceFilters(selectedDataset, filters);

  useEffect(() => {
    if (kind !== 'registry') return;
    const controller = new AbortController();
    setCatalog({ status: 'loading' });
    loadSourceCatalog(import.meta.env.VITE_YOUTHLM_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '', controller.signal)
      .then(sources => { if (!controller.signal.aborted) setCatalog({ status: 'ready', sources }); })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setCatalog({ status: 'error', message: reason instanceof Error ? reason.message : '資料目錄載入失敗，請重試。' });
      });
    return () => controller.abort();
  }, [kind, reload]);

  useEffect(() => {
    setKind(node.source?.kind ?? 'registry');
    setName(node.source?.name ?? '');
    setFile(node.source?.file);
    setApiUrl(node.source?.apiUrl ?? '');
    setEnabled(node.source?.enabled ?? true);
    setAutoClean(node.source?.autoClean ?? true);
    setRegistrySourceId(node.source?.kind === 'registry' ? node.source.registrySourceId ?? '' : '');
    setFilters(structuredClone(node.source?.kind === 'registry' ? node.source.filters ?? {} : {}));
    setError('');
    setSaved(false);
    setDirty(false);
    onDirtyChange?.(false);
  }, [node.id]);

  const markDirty = () => {
    setDirty(true);
    setSaved(false);
    onDirtyChange?.(true);
  };

  const chooseKind = (nextKind: EditableSourceKind) => {
    if (nextKind === kind) return;
    setKind(nextKind);
    setError('');
    markDirty();
  };

  const chooseDataset = (sourceId: string) => {
    if (catalog.status !== 'ready' || sourceId === registrySourceId) return;
    const source = catalog.sources.find(entry => entry.source_id === sourceId);
    setRegistrySourceId(sourceId);
    setFilters(source ? defaultSourceFilters(source) : {});
    if (source && (!name.trim() || /^未命名來源(?: \d+)?$/.test(name) || name === selectedDataset?.title)) setName(source.title);
    setError('');
    markDirty();
  };

  const selectFile = (selectedFile: File | undefined) => {
    if (!selectedFile) return;

    if (!ACCEPTED_FILE_EXTENSIONS.includes(getFileExtension(selectedFile.name))) {
      setError('目前僅支援 CSV、XLSX、XLS、JSON 或 PDF 檔案。');
      return;
    }

    const metadata = toFileMetadata(selectedFile);
    setFile(metadata);
    setName(currentName => currentName.trim() || getNameWithoutExtension(selectedFile.name));
    setError('');
    markDirty();
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('請輸入來源名稱。');
      return;
    }

    if (kind === 'file' && !file) {
      setError('請先選擇要使用的檔案。');
      return;
    }

    if (kind === 'api') {
      try {
        const parsedUrl = new URL(apiUrl.trim());
        if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('unsupported protocol');
      } catch {
        setError('請輸入以 http:// 或 https:// 開頭的有效 API 網址。');
        return;
      }
    }

    if (kind === 'registry' && registryIssue) {
      setError(registryIssue);
      return;
    }

    const nextConfig: SourceConfig = {
      kind,
      name: trimmedName,
      enabled,
      autoClean: kind === 'registry' ? false : autoClean,
      ...(kind === 'registry' ? { registrySourceId, filters: structuredClone(filters) }
        : kind === 'file' ? { file } : { apiUrl: apiUrl.trim() }),
    };

    onSave(nextConfig);
    setError('');
    setSaved(true);
    setDirty(false);
    onDirtyChange?.(false);
  };

  const handleClose = () => {
    if (dirty && !window.confirm('來源設定尚未儲存，確定要放棄這次修改嗎？')) return;
    setDirty(false);
    onDirtyChange?.(false);
    onClose?.();
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-white" aria-label="來源設定">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Database className="size-4" />
            </div>
            <div>
              <p className="text-[11px] font-medium text-blue-700">來源卡片</p>
              <h2 className="text-base font-semibold text-slate-950">設定資料來源</h2>
            </div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={handleClose}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="關閉來源設定"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          選擇既有官方資料並設定篩選，或先記錄自訂來源。此步尚不執行分析。
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div>
          <span className="mb-2 block text-xs font-semibold text-slate-700">來源方式</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => chooseKind('file')}
              className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border px-2 text-center text-xs font-medium transition ${
                kind === 'file'
                  ? 'border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-100'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
              aria-pressed={kind === 'file'}
            >
              <FileSpreadsheet className="size-5" />
              上傳檔案
            </button>
            <button
              type="button"
              onClick={() => chooseKind('api')}
              className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border px-2 text-center text-xs font-medium transition ${
                kind === 'api'
                  ? 'border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-100'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
              aria-pressed={kind === 'api'}
            >
              <Globe2 className="size-5" />
              公開 API
            </button>
            <button
              type="button"
              onClick={() => chooseKind('registry')}
              aria-pressed={kind === 'registry'}
              className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border px-2 text-center text-xs font-medium transition ${kind === 'registry'
                ? 'border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-100'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
            >
              <Braces className="size-5" />
              官方資料集
            </button>
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-700">來源名稱</span>
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError('');
              markDirty();
            }}
            className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            placeholder={kind === 'registry' ? '選擇資料集後可自行命名' : kind === 'file' ? '例如：青年就業調查' : '例如：政府開放資料 API'}
            maxLength={80}
          />
        </label>

        {kind === 'registry' ? (
          <div className="space-y-4" aria-busy={catalog.status === 'loading'}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">後端資料目錄</span>
              <button type="button" disabled={catalog.status === 'loading'} onClick={() => { setError(''); setReload(value => value + 1); }} className="text-xs text-blue-700 hover:underline disabled:text-slate-400">重新載入目錄</button>
            </div>
            {catalog.status === 'loading' && <p className="text-xs text-slate-500" role="status">正在載入官方資料目錄…</p>}
            {catalog.status === 'error' && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-800">
                <p role="alert">{catalog.message}</p>
                <button type="button" className="mt-2 font-semibold underline" onClick={() => setReload(value => value + 1)}>重試載入</button>
              </div>
            )}
            {catalog.status === 'ready' && (
              <>
                {catalog.sources.length === 0 ? <p role="status" className="text-xs text-slate-500">後端目前沒有可選資料集，請稍後重新載入。</p> : (
                  <label className="block space-y-1.5 text-xs font-semibold text-slate-700">
                    <span>選擇官方資料集</span>
                    <select value={registrySourceId} onChange={event => chooseDataset(event.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100">
                      <option value="">請選擇資料集</option>
                      {registrySourceId && !selectedDataset && <option value={registrySourceId} disabled>原資料集已不在目錄中</option>}
                      {catalog.sources.map(source => <option key={source.source_id} value={source.source_id} disabled={!supportsSourceFilters(source)}>{source.title}{supportsSourceFilters(source) ? '' : '（目前無法使用）'}</option>)}
                    </select>
                  </label>
                )}
                {registrySourceId && !selectedDataset && <p role="alert" className="text-xs text-red-600">原資料集已移除，設定暫時保留；請選擇可用資料集後再儲存。</p>}
                {selectedDataset && (supportsSourceFilters(selectedDataset) ? (
                  <CatalogFilters source={selectedDataset} filters={filters} onChange={next => { setFilters(next); setError(''); markDirty(); }} />
                ) : <p role="alert" className="text-xs text-red-600">此資料集目前無法使用，請選擇其他資料集。</p>)}
              </>
            )}
          </div>
        ) : kind === 'file' ? (
          <div>
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">資料檔案</span>
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              className="sr-only"
              onChange={(event) => selectFile(event.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDraggingFile(false);
                selectFile(event.dataTransfer.files?.[0]);
              }}
              className={`flex w-full flex-col items-center justify-center rounded-xl border border-dashed px-4 py-7 text-center transition ${
                isDraggingFile
                  ? 'border-blue-500 bg-blue-50'
                  : file
                    ? 'border-emerald-300 bg-emerald-50/60'
                    : 'border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100/70'
              }`}
            >
              {file ? (
                <>
                  <div className="flex size-10 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                    <FileSpreadsheet className="size-5" />
                  </div>
                  <span className="mt-3 max-w-full truncate text-sm font-medium text-slate-800">{file.name}</span>
                  <span className="mt-1 text-[11px] text-slate-500">{formatFileSize(file.size)} · 點擊以更換檔案</span>
                </>
              ) : (
                <>
                  <UploadCloud className="size-7 text-slate-400" />
                  <span className="mt-2 text-sm font-medium text-slate-700">拖入檔案或點擊選擇</span>
                  <span className="mt-1 text-[11px] text-slate-500">支援 CSV、XLSX、XLS、JSON、PDF</span>
                </>
              )}
            </button>
            <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-slate-500">
              <Info className="mt-0.5 size-3 shrink-0" />
              此版只記住檔名、大小與格式，不會讀取或上傳檔案內容。
            </p>
          </div>
        ) : (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-700">API 網址</span>
            <div className="relative">
              <Globe2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={apiUrl}
                onChange={(event) => {
                  setApiUrl(event.target.value);
                  setError('');
                  markDirty();
                }}
                className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder="https://data.example.gov.tw/api"
                inputMode="url"
              />
            </div>
            <span className="mt-2 flex items-start gap-1.5 text-[11px] leading-4 text-slate-500">
              <Info className="mt-0.5 size-3 shrink-0" />
              此版只保存網址，不會立即發送網路請求或抓取資料。
            </span>
          </label>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => {
              setEnabled(current => !current);
              markDirty();
            }}
            className="flex w-full items-center justify-between gap-4 rounded-lg border border-slate-200 px-3 py-3 text-left hover:bg-slate-50"
            role="checkbox"
            aria-checked={enabled}
          >
            <span>
              <span className="block text-xs font-semibold text-slate-700">啟用此來源</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">{kind === 'registry' ? '供後續成果卡選用，目前不會自動查詢' : '後端串接完成後才會執行同步'}</span>
            </span>
            <span className={`flex size-5 shrink-0 items-center justify-center rounded border ${enabled ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'}`}>
              {enabled && <Check className="size-3.5" />}
            </span>
          </button>

          {kind !== 'registry' && <button
            type="button"
            onClick={() => {
              setAutoClean(current => !current);
              markDirty();
            }}
            className="flex w-full items-center justify-between gap-4 rounded-lg border border-slate-200 px-3 py-3 text-left hover:bg-slate-50"
            role="checkbox"
            aria-checked={autoClean}
          >
            <span className="flex min-w-0 items-start gap-2.5">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-600" />
              <span>
                <span className="block text-xs font-semibold text-slate-700">自動清理資料</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">預留給格式標準化、缺漏值與重複資料處理</span>
              </span>
            </span>
            <span className={`flex size-5 shrink-0 items-center justify-center rounded border ${autoClean ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300 bg-white'}`}>
              {autoClean && <Check className="size-3.5" />}
            </span>
          </button>}
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-800">
          {kind === 'registry'
            ? '目錄來自真實後端；此處只保存資料集與篩選設定。請到已連結的圖表成果卡執行分析；不會重新清洗官方原始資料。'
            : '目前只會保存前端設定；檔案上傳、API 抓取、資料解析與清理仍需串接後端服務。'}
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white px-5 py-4">
        {error && <p className="mb-2 text-xs text-red-600" role="alert">{error}</p>}
        {saved && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-emerald-600" role="status">
            <Check className="size-3.5" />
            前端設定已更新
          </p>
        )}
        {dirty && !error && (
          <p className="mb-2 text-xs text-amber-700" role="status">有尚未儲存的變更</p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={kind === 'registry' && Boolean(registryIssue)}
          className="h-10 w-full rounded-lg bg-slate-950 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          儲存來源設定
        </button>
      </div>
    </section>
  );
}
