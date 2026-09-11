import type { AssistantDraftAction, ResultConfig } from './types';

export const PRESENTATION_UNAVAILABLE_MESSAGE =
  '簡報需使用已完成或部分完成的分析成果；小幫手目前只會建立圖表草稿，請在成果卡中選擇「洞察簡報」。';

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
  const uniqueSourceNodeIds = [...new Set(sourceNodeIds)];
  return uniqueSourceNodeIds.map((sourceNodeId, index) => ({
    id: uniqueSourceNodeIds.length === 1 ? id : `${id}-${index + 1}`,
    kind: 'chart',
    name: uniqueSourceNodeIds.length === 1 ? '政策洞察圖表' : `政策洞察圖表 ${index + 1}`,
    sourceNodeIds: [sourceNodeId],
    prompt,
  }));
}
