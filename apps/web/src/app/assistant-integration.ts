import type {
  AnalysisExecution,
  AssistantContextKind,
  AssistantContextOption,
  AssistantRequestPayload,
  AssistantResultView,
  CanvasNode,
  PresentationExecution,
} from './types';

function analysisIsAvailable(execution: AnalysisExecution | undefined) {
  return Boolean(
    execution?.state === 'ready'
    && execution.view
    && execution.view.kind !== 'error'
    && execution.view.kind !== 'blocked'
    && (execution.view.status === 'completed' || execution.view.status === 'partial'),
  );
}

export function buildAssistantContextOptions({
  nodes,
  analysisExecutions,
  presentationExecutions,
}: {
  nodes: CanvasNode[];
  analysisExecutions: Record<string, AnalysisExecution>;
  presentationExecutions: Record<string, PresentationExecution>;
}): AssistantContextOption[] {
  return nodes.flatMap((node): AssistantContextOption[] => {
    if (
      node.type === 'source'
      && node.source?.enabled
      && node.source.kind === 'registry'
      && node.source.registrySourceId
    ) {
      return [{
        canvasNodeId: node.id,
        kind: 'source',
        referenceId: node.source.registrySourceId,
        title: node.source.name.trim() || node.source.registrySourceId,
        detail: '資料來源',
        filters: structuredClone(node.source.filters ?? {}),
      }];
    }

    if (node.type !== 'result' || !node.result) return [];
    if (node.result.kind === 'chart' && analysisIsAvailable(analysisExecutions[node.id])) {
      return [{
        canvasNodeId: node.id,
        kind: 'analysis',
        referenceId: node.id,
        title: node.result.name.trim() || '未命名分析',
        detail: analysisExecutions[node.id]?.view?.status === 'partial'
          ? '部分相容分析'
          : '分析成果',
      }];
    }

    const presentation = presentationExecutions[node.id];
    if (
      node.result.kind === 'presentation'
      && presentation?.state === 'ready'
      && presentation.view?.kind === 'ready'
    ) {
      return [{
        canvasNodeId: node.id,
        kind: 'presentation',
        referenceId: presentation.view.presentationId,
        title: node.result.name.trim() || presentation.view.title,
        detail: '洞察簡報',
      }];
    }
    return [];
  });
}

export function buildAssistantRequest({
  projectId,
  assistantId,
  message,
  selectedContextNodeIds,
  contextOptions,
}: {
  projectId: string;
  assistantId: string;
  message: string;
  selectedContextNodeIds: string[];
  contextOptions: AssistantContextOption[];
}): AssistantRequestPayload {
  const normalizedMessage = message.trim();
  if (!normalizedMessage) throw new Error('小幫手訊息不可空白');

  const optionsByCanvasId = new Map(
    contextOptions.map(option => [option.canvasNodeId, option]),
  );
  const selectedIds = [...new Set(selectedContextNodeIds)];
  const missingIds = selectedIds.filter(canvasNodeId => !optionsByCanvasId.has(canvasNodeId));
  if (missingIds.length > 0) {
    throw new Error('一或多個引用尚未完成，請等待分析或簡報產生後再送出');
  }

  const contextReferences = selectedIds.map(canvasNodeId => {
    const option = optionsByCanvasId.get(canvasNodeId);
    if (!option) throw new Error('小幫手引用不存在');
    return {
      kind: option.kind,
      reference_id: option.referenceId,
      ...(option.kind === 'source'
        ? { filters: structuredClone(option.filters ?? {}) }
        : {}),
    };
  });
  const referenceKeys = contextReferences.map(
    reference => `${reference.kind}:${reference.reference_id}`,
  );
  if (new Set(referenceKeys).size !== referenceKeys.length) {
    throw new Error('同一個後端引用不能重複加入小幫手脈絡');
  }

  return {
    contract_version: '0.1.0',
    project_id: projectId,
    assistant_id: assistantId,
    message: normalizedMessage,
    context_references: contextReferences,
  };
}

export function buildAssistantResultView(
  payload: Record<string, unknown>,
  { httpStatus = 200 }: { httpStatus?: number } = {},
): AssistantResultView {
  assertObject(payload, 'YouthLM Assistant response');
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
  if (payload.status !== 'completed') {
    throw new Error('YouthLM Assistant response is not completed');
  }
  if (!Number.isInteger(payload.model_steps) || Number(payload.model_steps) < 1) {
    throw new TypeError('YouthLM Assistant response has invalid model_steps');
  }
  if (!Array.isArray(payload.resolved_references) || !Array.isArray(payload.tool_executions)) {
    throw new TypeError('YouthLM Assistant response has invalid trace arrays');
  }

  return {
    kind: 'completed',
    projectId: requireString(payload.project_id, 'project_id'),
    assistantId: requireString(payload.assistant_id, 'assistant_id'),
    answer: requireString(payload.answer, 'answer'),
    modelSteps: Number(payload.model_steps),
    resolvedReferences: payload.resolved_references.map(reference => {
      assertObject(reference, 'resolved reference');
      return {
        kind: requireContextKind(reference.kind),
        referenceId: requireString(reference.reference_id, 'reference_id'),
        title: requireString(reference.title, 'reference title'),
      };
    }),
    toolExecutions: payload.tool_executions.map(execution => {
      assertObject(execution, 'tool execution');
      assertObject(execution.arguments, 'tool arguments');
      if (execution.status !== 'completed' && execution.status !== 'failed') {
        throw new TypeError('YouthLM Assistant response has invalid tool status');
      }
      return {
        callId: requireString(execution.call_id, 'tool call_id'),
        name: requireString(execution.name, 'tool name'),
        arguments: execution.arguments,
        status: execution.status,
      };
    }),
  };
}

function requireContextKind(value: unknown): AssistantContextKind {
  if (value !== 'source' && value !== 'analysis' && value !== 'presentation') {
    throw new TypeError('YouthLM Assistant response has invalid reference kind');
  }
  return value;
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value) {
    throw new TypeError(`YouthLM Assistant response has invalid ${label}`);
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
