import type { AssistantDraftAction, ResultConfig } from './types';

export const PRESENTATION_UNAVAILABLE_MESSAGE =
  '簡報功能尚未提供。簡報需使用已完成或部分完成的分析成果，不直接使用原始來源；目前的圖表設定草稿也不算分析成果。';

export function usesRawSourceInputs(result: ResultConfig | undefined) {
  return result?.kind !== 'presentation';
}

export function getChartDraftActions(actions: AssistantDraftAction[]) {
  return actions.filter(action => action.kind === 'chart');
}

export function createChartDraftActions(
  id: string,
  prompt: string,
  sourceNodeIds: string[],
): AssistantDraftAction[] {
  if (sourceNodeIds.length === 0) return [];
  return [{
    id,
    kind: 'chart',
    name: '政策洞察圖表',
    sourceNodeIds: [...sourceNodeIds],
    prompt,
  }];
}
