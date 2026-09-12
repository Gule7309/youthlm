import type {
  ReportArtifactView,
  ReportRequestPayload,
  ResultConfig,
} from './types';

export function buildReportRequest({
  projectId,
  result,
}: {
  projectId: string;
  result: ResultConfig;
}): ReportRequestPayload {
  if (result.kind !== 'report') {
    throw new Error('只有研析報告成果可以產生 DOCX');
  }
  const title = result.name.trim();
  if (!title) throw new Error('報告名稱不可空白');
  const sourceModuleIds = [...new Set(result.sourceModuleIds ?? [])];
  if (sourceModuleIds.length === 0) {
    throw new Error('研析報告至少需要一個已完成的分析成果');
  }
  const instructions = result.prompt.trim();
  return {
    contract_version: '0.1.0',
    project_id: projectId,
    source_module_ids: sourceModuleIds,
    title,
    language: 'zh-TW',
    template_id: 'youthlm_default',
    output_format: 'docx',
    ...(instructions ? { instructions } : {}),
  };
}

export function buildReportArtifactView(
  payload: Record<string, unknown>,
  { httpStatus = 201 }: { httpStatus?: number } = {},
): ReportArtifactView {
  assertObject(payload, 'YouthLM report response');
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
  if (payload.status !== 'ready' || payload.output_format !== 'docx') {
    throw new Error('YouthLM report response is not a ready DOCX');
  }
  if (!Array.isArray(payload.source_module_ids) || !Array.isArray(payload.warnings)) {
    throw new TypeError('YouthLM report response has invalid arrays');
  }
  if (typeof payload.file_size_bytes !== 'number' || payload.file_size_bytes <= 0) {
    throw new TypeError('YouthLM report response has invalid file size');
  }
  return {
    kind: 'ready',
    projectId: requireString(payload.project_id, 'project_id'),
    reportId: requireString(payload.report_id, 'report_id'),
    sourceModuleIds: payload.source_module_ids.map(value => requireString(value, 'source_module_id')),
    title: requireString(payload.title, 'title'),
    fileName: requireString(payload.file_name, 'file_name'),
    fileSizeBytes: payload.file_size_bytes,
    artifactSha256: requireString(payload.artifact_sha256, 'artifact_sha256'),
    downloadUrl: requireString(payload.download_url, 'download_url'),
    createdAt: requireString(payload.created_at, 'created_at'),
    warnings: payload.warnings.map(warning => {
      assertObject(warning, 'report warning');
      return {
        type: requireString(warning.type, 'warning.type'),
        severity: requireString(warning.severity, 'warning.severity'),
        message: requireString(warning.message, 'warning.message'),
        ...(Array.isArray(warning.affected_source_ids)
          ? {
            affected_source_ids: warning.affected_source_ids.map(
              value => requireString(value, 'warning.affected_source_id'),
            ),
          }
          : {}),
      };
    }),
  };
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value) {
    throw new TypeError(`YouthLM report response has invalid ${label}`);
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
