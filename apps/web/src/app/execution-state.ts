import type { AnalysisExecution, CanvasNode } from './types';

/** Positions/names on unrelated cards must not invalidate an analysis. */
export function resultInputSignature(id: string, nodes: CanvasNode[], analyses: Record<string, AnalysisExecution> = {}): string {
  const result = nodes.find(node => node.id === id)?.result;
  if (!result) return '';
  if (result.kind === 'presentation' || result.kind === 'report') {
    return JSON.stringify([result, (result.sourceModuleIds ?? []).map(nodeId => {
      const execution = analyses[nodeId];
      return [nodeId, execution?.moduleId, execution?.state, execution?.inputSignature,
        resultInputSignature(nodeId, nodes)];
    })]);
  }
  return JSON.stringify([result, result.sourceNodeIds.map(sourceId => [
    sourceId, nodes.find(node => node.id === sourceId)?.source,
  ])]);
}

export class RequestGate {
  private requests = new Map<string, AbortController>();
  begin(id: string) {
    this.cancel(id);
    const controller = new AbortController();
    this.requests.set(id, controller);
    return controller;
  }
  isCurrent(id: string, controller: AbortController) {
    return this.requests.get(id) === controller && !controller.signal.aborted;
  }
  finish(id: string, controller: AbortController) {
    if (this.requests.get(id) === controller) this.requests.delete(id);
  }
  cancel(id: string) {
    this.requests.get(id)?.abort();
    this.requests.delete(id);
  }
  cancelAll() {
    this.requests.forEach(controller => controller.abort());
    this.requests.clear();
  }
}
