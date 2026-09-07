export type AuthUser = {
  displayName: string;
  email: string;
};

export type Notebook = {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  cardCount: number;
};

export type SourceKind = 'registry' | 'file' | 'api' | null;

export type SourceFileMetadata = {
  name: string;
  size: number;
  type: string;
  lastModified: number;
};

// Mirrors the JSON values allowed by Contract v0 SourceSelection.filters.
export type SourceFilterValue =
  | string
  | number
  | boolean
  | null
  | SourceFilterValue[]
  | { [key: string]: SourceFilterValue };

export type SourceFilters = Record<string, SourceFilterValue>;

export type SourceConfig = {
  kind: SourceKind;
  name: string;
  file?: SourceFileMetadata;
  apiUrl?: string;
  enabled: boolean;
  autoClean: boolean;
  // Backend registry identity, not CanvasNode.id. Unbound local sources omit it.
  registrySourceId?: string;
  filters?: SourceFilters;
};

export type RegistryDataSource = {
  source_id: string;
  title: string;
  agency: string;
  policy_domain: string;
  status: string;
  geography: string;
  available_geographies: string[];
  available_age_groups: string[];
  available_sexes: string[];
  available_dimensions: string[];
  available_years: {
    start: number;
    end: number;
  };
  unit: string;
  youth_compatibility: {
    target: string;
    status: string;
    explanation: string;
  };
};

export type AnalysisRequestPayload = {
  contract_version: '0.1.0';
  project_id: string;
  module_id: string;
  query: string;
  upstream_module_ids: string[];
  source_selections: Array<{
    source_id: string;
    filters: SourceFilters;
  }>;
};

export type AnalysisWarningView = {
  type: string;
  severity: string;
  message: string;
};

export type ChartArtifactView = {
  kind: 'chart' | 'table' | 'blocked' | 'error';
  status?: 'completed' | 'partial' | 'blocked';
  title?: string;
  summary?: string;
  warnings?: AnalysisWarningView[];
  chartOption?: Record<string, unknown> | null;
  table?: {
    columns: Array<{ name: string; label: string; unit?: string }>;
    records: Array<Record<string, unknown>>;
  };
  sources?: Array<{
    source_id: string;
    title: string;
    agency: string;
  }>;
  httpStatus?: number;
  code?: string;
  message?: string;
  retriable?: boolean;
};

export type AnalysisExecution = {
  state: 'running' | 'ready' | 'failed';
  view?: ChartArtifactView;
};

export type ResultKind = 'chart' | 'presentation' | null;

export type ResultConfig = {
  kind: ResultKind;
  name: string;
  sourceNodeIds: string[]; // Canvas links only; never send as registry source IDs.
  prompt: string;
};

export type AssistantMessageRole = 'user' | 'assistant';

export type AssistantMessage = {
  id: string;
  role: AssistantMessageRole;
  content: string;
  createdAt: string;
};

export type AssistantDraftAction = {
  id: string;
  kind: Exclude<ResultKind, null>;
  name: string;
  sourceNodeIds: string[]; // References to source cards in this notebook.
  prompt: string;
};

export type AssistantConfig = {
  name: string;
  messages: AssistantMessage[];
  draftActions: AssistantDraftAction[];
  lastPrompt?: string;
};

export type PolicyRadarCounts = {
  sourceCount: number;
  readySourceCount: number;
  resultCount: number;
  configuredResultCount: number;
};

export type PolicyRadarLatestRecord = {
  counts: PolicyRadarCounts;
  createdAt: string;
  workspaceSignature: string;
};

export type PolicyRadarState = {
  collapsed: boolean;
  running: boolean;
  activeRunId?: string;
  latestRecord?: PolicyRadarLatestRecord;
};

export type PolicyRadarStateByNotebook = Record<string, PolicyRadarState>;

export type PolicyRadarDisplayStatus = 'empty' | 'ready' | 'running' | 'complete';

export type CanvasNodeType = 'source' | 'result' | 'assistant' | 'transform' | 'analysis';

export type CanvasNode = {
  id: string;
  type: CanvasNodeType;
  x: number;
  y: number;
  source?: SourceConfig;
  result?: ResultConfig;
  assistant?: AssistantConfig;
};
