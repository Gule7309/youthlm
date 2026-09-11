import type {
  AnalysisExecution,
  PresentationArtifactView,
  PresentationRequestPayload,
  ResultConfig,
} from './types';

export function buildPresentationRequest({
  projectId,
  result,
  analyses,
}: {
  projectId: string;
  result: ResultConfig;
  analyses: Record<string, AnalysisExecution>;
}): PresentationRequestPayload {
  if (result.kind !== 'presentation') {
    throw new Error('只有簡報成果可以產生 PPTX');
  }

  const title = result.name.trim();
  if (!title) throw new Error('簡報名稱不可空白');

  const sourceModuleIds = [...new Set(result.sourceModuleIds ?? [])].map(id => {
    const execution = analyses[id];
    if (execution?.state !== 'ready' || !execution.moduleId || execution.projectId !== projectId
      || !['completed', 'partial'].includes(execution.view?.status ?? '')
      || execution.view?.kind === 'blocked' || execution.view?.kind === 'error') {
      throw new Error('簡報來源分析尚未完成或已過期，請先重新執行圖表分析。');
    }
    return execution.moduleId;
  });
  if (sourceModuleIds.length === 0) {
    throw new Error('簡報至少需要一個已完成的分析成果');
  }

  const instructions = result.prompt.trim();
  return {
    contract_version: '0.1.0',
    project_id: projectId,
    source_module_ids: sourceModuleIds,
    title,
    language: 'zh-TW',
    template_id: 'youthlm_default',
    output_format: 'pptx',
    ...(instructions ? { instructions } : {}),
  };
}

export function buildPresentationArtifactView(
  payload: Record<string, unknown>,
  { httpStatus = 201 }: { httpStatus?: number } = {},
): PresentationArtifactView {
  assertObject(payload, 'YouthLM presentation response');

  if (httpStatus >= 400 || Object.hasOwn(payload, 'error')) {
    const error = payload.error;
    assertObject(error, 'YouthLM error payload');
    return {
      kind: 'error',
      httpStatus,
      code: requireString(error.code, 'error.code'),
      message: requireString(error.message, 'error.message'),
      retriable: error.retriable === true,
      details: isObject(error.details) ? error.details : {},
    };
  }

  if (payload.contract_version !== '0.1.0') {
    throw new Error(`Unsupported contract version: ${String(payload.contract_version)}`);
  }
  if (payload.status !== 'ready' || payload.output_format !== 'pptx') {
    throw new Error('YouthLM presentation response is not a ready PPTX');
  }
  if (!Array.isArray(payload.source_module_ids) || !Array.isArray(payload.warnings)) {
    throw new TypeError('YouthLM presentation response has invalid arrays');
  }
  if (typeof payload.file_size_bytes !== 'number' || payload.file_size_bytes <= 0) {
    throw new TypeError('YouthLM presentation response has invalid file size');
  }

  return {
    kind: 'ready',
    projectId: requireString(payload.project_id, 'project_id'),
    presentationId: requireString(payload.presentation_id, 'presentation_id'),
    sourceModuleIds: payload.source_module_ids.map((value) => requireString(value, 'source_module_id')),
    title: requireString(payload.title, 'title'),
    fileName: requireString(payload.file_name, 'file_name'),
    fileSizeBytes: payload.file_size_bytes,
    artifactSha256: requireString(payload.artifact_sha256, 'artifact_sha256'),
    downloadUrl: requireString(payload.download_url, 'download_url'),
    createdAt: requireString(payload.created_at, 'created_at'),
    warnings: payload.warnings.map((warning) => {
      assertObject(warning, 'presentation warning');
      return {
        type: requireString(warning.type, 'warning.type'),
        severity: requireString(warning.severity, 'warning.severity'),
        message: requireString(warning.message, 'warning.message'),
        ...(Array.isArray(warning.affected_source_ids)
          ? {
            affected_source_ids: warning.affected_source_ids.map(
              (value) => requireString(value, 'warning.affected_source_id'),
            ),
          }
          : {}),
      };
    }),
  };
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value) {
    throw new TypeError(`YouthLM presentation response has invalid ${label}`);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (!isObject(value)) throw new TypeError(`${label} must be an object`);
}
