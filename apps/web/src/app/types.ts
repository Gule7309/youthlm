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
  affected_source_ids?: string[];
};

export type AnalysisPlanStepView = {
  step_id: string;
  description: string;
  status: 'completed' | 'skipped';
};

export type AnalysisDatasetVersionView = {
  dataset_version_id: string;
  source_id: string;
  retrieved_at: string;
  source_updated_at?: string;
  source_sha256: string;
  license?: string;
};

export type AnalysisProvenanceView = {
  source_id: string;
  dataset_version_id: string;
  query_tool: string;
  query_parameters: SourceFilters;
};

export type AnalysisSourceView = {
  source_id: string;
  title: string;
  agency?: string;
  source_url?: string;
  dataset_version_id: string;
  datasetVersion: AnalysisDatasetVersionView | null;
  provenance: AnalysisProvenanceView[];
};

export type ChartArtifactView = {
  kind: 'chart' | 'table' | 'blocked' | 'error';
  status?: 'completed' | 'partial' | 'blocked';
  title?: string;
  question?: string;
  analysisPlan?: AnalysisPlanStepView[];
  filters?: SourceFilters;
  summary?: string;
  warnings?: AnalysisWarningView[];
  chartOption?: Record<string, unknown> | null;
  table?: {
    columns: Array<{ name: string; label: string; unit?: string }>;
    records: Array<Record<string, unknown>>;
  };
  sources?: AnalysisSourceView[];
  httpStatus?: number;
  code?: string;
  message?: string;
  retriable?: boolean;
};

export type AnalysisExecution = {
  state: 'running' | 'ready' | 'failed';
  view?: ChartArtifactView;
};

export type PresentationRequestPayload = {
  contract_version: '0.1.0';
  project_id: string;
  source_module_ids: string[];
  title: string;
  language: 'zh-TW';
  template_id: 'youthlm_default';
  output_format: 'pptx';
  instructions?: string;
};

export type PresentationArtifactView =
  | {
    kind: 'ready';
    projectId: string;
    presentationId: string;
    sourceModuleIds: string[];
    title: string;
    fileName: string;
    fileSizeBytes: number;
    artifactSha256: string;
    downloadUrl: string;
    createdAt: string;
    warnings: AnalysisWarningView[];
  }
  | {
    kind: 'error';
    httpStatus: number;
    code: string;
    message: string;
    retriable: boolean;
    details: Record<string, unknown>;
  };

export type PresentationExecution = {
  state: 'running' | 'ready' | 'failed';
  view?: PresentationArtifactView;
};

export type ReportRequestPayload = {
  contract_version: '0.1.0';
  project_id: string;
  source_module_ids: string[];
  title: string;
  language: 'zh-TW';
  template_id: 'youthlm_default';
  output_format: 'docx';
  instructions?: string;
};

export type ReportArtifactView =
  | {
    kind: 'ready';
    projectId: string;
    reportId: string;
    sourceModuleIds: string[];
    title: string;
    fileName: string;
    fileSizeBytes: number;
    artifactSha256: string;
    downloadUrl: string;
    createdAt: string;
    warnings: AnalysisWarningView[];
  }
  | {
    kind: 'error';
    httpStatus: number;
    code: string;
    message: string;
    retriable: boolean;
    details: Record<string, unknown>;
  };

export type ReportExecution = {
  state: 'running' | 'ready' | 'failed';
  view?: ReportArtifactView;
};

export type ResultKind = 'chart' | 'report' | 'presentation' | null;

export type ResultConfig = {
  kind: ResultKind;
  name: string;
  sourceNodeIds: string[]; // Canvas links only; never send as registry source IDs.
  // Generated-artifact Canvas links. Chart result node IDs equal stored module IDs.
  sourceModuleIds?: string[];
  prompt: string;
};

export type AssistantMessageRole = 'user' | 'assistant';

export type AssistantMessage = {
  id: string;
  role: AssistantMessageRole;
  content: string;
  createdAt: string;
  resolvedReferences?: AssistantResolvedReferenceView[];
  toolExecutions?: AssistantToolExecutionView[];
};

export type AssistantContextKind = 'source' | 'analysis' | 'presentation';

export type AssistantContextOption = {
  canvasNodeId: string;
  kind: AssistantContextKind;
  referenceId: string;
  title: string;
  detail: string;
  filters?: SourceFilters;
};

export type AssistantContextReferencePayload = {
  kind: AssistantContextKind;
  reference_id: string;
  filters?: SourceFilters;
};

export type AssistantRequestPayload = {
  contract_version: '0.1.0';
  project_id: string;
  assistant_id: string;
  message: string;
  context_references: AssistantContextReferencePayload[];
};

export type AssistantResolvedReferenceView = {
  kind: AssistantContextKind;
  referenceId: string;
  title: string;
};

export type AssistantToolExecutionView = {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  status: 'completed' | 'failed';
};

export type AssistantResultView =
  | {
    kind: 'completed';
    projectId: string;
    assistantId: string;
    answer: string;
    modelSteps: number;
    resolvedReferences: AssistantResolvedReferenceView[];
    toolExecutions: AssistantToolExecutionView[];
  }
  | {
    kind: 'error';
    httpStatus: number;
    code: string;
    message: string;
    retriable: boolean;
    details: Record<string, unknown>;
  };

export type AssistantExecution = {
  state: 'running' | 'ready' | 'failed';
  view?: AssistantResultView;
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
  contextNodeIds?: string[];
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
