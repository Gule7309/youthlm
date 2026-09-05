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

export type SourceKind = 'file' | 'api' | null;

export type SourceFileMetadata = {
  name: string;
  size: number;
  type: string;
  lastModified: number;
};

export type SourceConfig = {
  kind: SourceKind;
  name: string;
  file?: SourceFileMetadata;
  apiUrl?: string;
  enabled: boolean;
  autoClean: boolean;
};

export type ResultKind = 'chart' | 'presentation' | null;

export type ResultConfig = {
  kind: ResultKind;
  name: string;
  sourceIds: string[];
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
  sourceIds: string[];
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
