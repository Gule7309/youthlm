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
import { buildDefaultSourceFilters } from '../analysis-integration';
import type {
  CanvasNode,
  RegistryDataSource,
  SourceConfig,
  SourceFileMetadata,
  SourceFilters,
} from '../types';

type EditableSourceKind = Exclude<SourceConfig['kind'], null>;

type SourceInspectorProps = {
  node: CanvasNode;
  registrySources: RegistryDataSource[];
  registryLoading?: boolean;
  registryError?: string;
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

function firstFilterValue(filters: SourceFilters, name: string) {
  const value = filters[name];
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
}

function numberFilterValue(filters: SourceFilters, name: string, fallback: number) {
  return typeof filters[name] === 'number' ? filters[name] : fallback;
}

export function SourceInspector({
  node,
  registrySources,
  registryLoading = false,
  registryError,
  onSave,
  onClose,
  onDirtyChange,
}: SourceInspectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<EditableSourceKind>(node.source?.kind ?? 'registry');
  const [name, setName] = useState(node.source?.name ?? '');
  const [file, setFile] = useState<SourceFileMetadata | undefined>(node.source?.file);
  const [apiUrl, setApiUrl] = useState(node.source?.apiUrl ?? '');
  const [registrySourceId, setRegistrySourceId] = useState(node.source?.registrySourceId ?? '');
  const [filters, setFilters] = useState<SourceFilters>(node.source?.filters ?? {});
  const [enabled, setEnabled] = useState(node.source?.enabled ?? true);
  const [autoClean, setAutoClean] = useState(node.source?.autoClean ?? true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  useEffect(() => {
    setKind(node.source?.kind ?? 'registry');
    setName(node.source?.name ?? '');
    setFile(node.source?.file);
    setApiUrl(node.source?.apiUrl ?? '');
    setRegistrySourceId(node.source?.registrySourceId ?? '');
    setFilters(structuredClone(node.source?.filters ?? {}));
    setEnabled(node.source?.enabled ?? true);
    setAutoClean(node.source?.autoClean ?? true);
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
    setKind(nextKind);
    if (nextKind === 'registry' && !registrySourceId && registrySources[0]) {
      setRegistrySourceId(registrySources[0].source_id);
      setName(registrySources[0].title);
      setFilters(buildDefaultSourceFilters(registrySources[0]));
    }
    setError('');
    markDirty();
  };

  const selectRegistrySource = (sourceId: string) => {
    const source = registrySources.find(item => item.source_id === sourceId);
    setRegistrySourceId(sourceId);
    if (source) {
      setName(source.title);
      setFilters(buildDefaultSourceFilters(source));
    }
    setError('');
    markDirty();
  };

  const setSingleFilter = (filterName: string, value: string) => {
    setFilters(current => ({ ...current, [filterName]: value ? [value] : [] }));
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

    if (kind === 'registry' && !registrySourceId) {
      setError('請選擇一個已安裝的資料集。');
      return;
    }

    if (kind === 'registry') {
      const source = registrySources.find(item => item.source_id === registrySourceId);
      const startYear = typeof filters.start_year === 'number' ? filters.start_year : NaN;
      const endYear = typeof filters.end_year === 'number' ? filters.end_year : NaN;
      if (!source || !Number.isInteger(startYear) || !Number.isInteger(endYear)
        || startYear < source.available_years.start || endYear > source.available_years.end
        || startYear > endYear) {
        setError('請確認年份位於資料範圍內，且起始年不晚於結束年。');
        return;
      }
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

    const nextConfig: SourceConfig = {
      kind,
      name: trimmedName,
      enabled,
      autoClean,
      ...(kind === 'registry'
        ? { registrySourceId, filters }
        : kind === 'file'
          ? { file }
          : { apiUrl: apiUrl.trim() }),
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
          選擇後端已安裝的政府資料集，即可直接建立可執行的分析來源。
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div>
          <span className="mb-2 block text-xs font-semibold text-slate-700">來源方式</span>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => chooseKind('registry')}
              className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border px-2 text-center text-[11px] font-medium transition ${
                kind === 'registry'
                  ? 'border-blue-400 bg-blue-50 text-blue-700 ring-2 ring-blue-100'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
              aria-pressed={kind === 'registry'}
            >
              <Braces className="size-5" />
              已安裝資料集
              <span className="font-normal">可直接分析</span>
            </button>
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
            placeholder={kind === 'registry' ? '資料集顯示名稱' : kind === 'file' ? '例如：青年就業調查' : '例如：政府開放資料 API'}
            maxLength={80}
          />
        </label>

        {kind === 'registry' ? (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">已安裝資料集</span>
              <select
                value={registrySourceId}
                onChange={event => selectRegistrySource(event.target.value)}
                disabled={registryLoading || registrySources.length === 0}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
              >
                <option value="">{registryLoading ? '正在載入資料來源…' : '請選擇資料集'}</option>
                {registrySources.map(source => (
                  <option key={source.source_id} value={source.source_id}>{source.title}</option>
                ))}
              </select>
            </label>

            {registryError && <p className="text-xs text-red-600" role="alert">{registryError}</p>}

            {(() => {
              const source = registrySources.find(item => item.source_id === registrySourceId);
              if (!source) return null;
              const startYear = numberFilterValue(filters, 'start_year', source.available_years.start);
              const endYear = numberFilterValue(filters, 'end_year', source.available_years.end);
              return (
                <div className="space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3">
                  <p className="text-[11px] leading-5 text-blue-900">
                    {source.agency} · {source.unit} · {source.youth_compatibility.explanation}
                  </p>
                  {source.available_geographies.length > 0 && (
                    <label className="block text-xs font-medium text-slate-700">
                      地區
                      <select
                        value={firstFilterValue(filters, 'geographies')}
                        onChange={event => setSingleFilter('geographies', event.target.value)}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
                      >
                        {source.available_geographies.map(value => <option key={value}>{value}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="block text-xs font-medium text-slate-700">
                    年齡級距
                    <select
                      value={firstFilterValue(filters, 'age_groups')}
                      onChange={event => setSingleFilter('age_groups', event.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
                    >
                      {source.available_age_groups.map(value => <option key={value}>{value}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-slate-700">
                    性別
                    <select
                      value={firstFilterValue(filters, 'sexes')}
                      onChange={event => setSingleFilter('sexes', event.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"
                    >
                      {source.available_sexes.map(value => <option key={value}>{value}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-medium text-slate-700">
                      起始年
                      <input
                        type="number"
                        min={source.available_years.start}
                        max={endYear}
                        value={startYear}
                        onChange={event => {
                          setFilters(current => ({ ...current, start_year: Number(event.target.value) }));
                          markDirty();
                        }}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs"
                      />
                    </label>
                    <label className="text-xs font-medium text-slate-700">
                      結束年
                      <input
                        type="number"
                        min={startYear}
                        max={source.available_years.end}
                        value={endYear}
                        onChange={event => {
                          setFilters(current => ({ ...current, end_year: Number(event.target.value) }));
                          markDirty();
                        }}
                        className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs"
                      />
                    </label>
                  </div>
                </div>
              );
            })()}
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
              <span className="mt-0.5 block text-[11px] text-slate-500">已安裝資料集會在執行分析時送往後端</span>
            </span>
            <span className={`flex size-5 shrink-0 items-center justify-center rounded border ${enabled ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white'}`}>
              {enabled && <Check className="size-3.5" />}
            </span>
          </button>

          <button
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
          </button>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-5 text-amber-800">
          已安裝資料集可直接送往 YouthLM Agent；檔案上傳與任意 API 目前仍只保存前端草稿。
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
          className="h-10 w-full rounded-lg bg-slate-950 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          儲存來源設定
        </button>
      </div>
    </section>
  );
}
