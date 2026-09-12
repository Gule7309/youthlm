import type { CanvasNode } from './types';

export type CanvasConnectionKind = 'source' | 'analysis';

export type CanvasPoint = {
  x: number;
  y: number;
};

export type CanvasRect = CanvasPoint & {
  width: number;
  height: number;
};

export type CanvasConnectionOutcome =
  | { status: 'connected' | 'replaced' | 'duplicate'; kind: CanvasConnectionKind; nodes: CanvasNode[] }
  | { status: 'invalid'; nodes: CanvasNode[] };

export const CONNECTION_COLORS: Record<CanvasConnectionKind, string> = {
  source: '#2563eb',
  analysis: '#7c3aed',
};

// Keep connection drops usable even when "fit all" makes the visual handle tiny.
// This margin is measured in screen pixels, so it does not shrink with canvas zoom.
export const CONNECTION_DROP_MARGIN_PX = 22;
export const SOURCE_CARD_SIZE = { width: 320, height: 216 } as const;
export const RESULT_CARD_SIZE = { width: 360, height: 360 } as const;

export function getFitCanvasTransform(
  targetRects: CanvasRect[],
  viewportWidth: number,
  viewportHeight: number,
  leftInset: number,
  rightInset: number,
) {
  if (targetRects.length === 0) return null;

  const minX = Math.min(...targetRects.map(rect => rect.x));
  const minY = Math.min(...targetRects.map(rect => rect.y));
  const maxX = Math.max(...targetRects.map(rect => rect.x + rect.width));
  const maxY = Math.max(...targetRects.map(rect => rect.y + rect.height));
  const boxWidth = Math.max(1, maxX - minX);
  const boxHeight = Math.max(1, maxY - minY);
  const topInset = 80;
  const bottomInset = 80;
  const availableWidth = viewportWidth - leftInset - rightInset;
  const availableHeight = viewportHeight - topInset - bottomInset;
  const padding = 64;
  const zoom = Math.max(0.3, Math.min(
    1,
    Math.min(
      (availableWidth - padding * 2) / boxWidth,
      (availableHeight - padding * 2) / boxHeight,
    ),
  ));
  const centerX = minX + boxWidth / 2;
  const centerY = minY + boxHeight / 2;

  return {
    zoom,
    pan: {
      x: leftInset + availableWidth / 2 - centerX * zoom,
      y: topInset + availableHeight / 2 - centerY * zoom,
    },
  };
}

export function isPointNearRect(
  point: CanvasPoint,
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>,
  margin = CONNECTION_DROP_MARGIN_PX,
) {
  return point.x >= rect.left - margin
    && point.x <= rect.right + margin
    && point.y >= rect.top - margin
    && point.y <= rect.bottom + margin;
}

export function outputConnectionKind(node: CanvasNode | undefined): CanvasConnectionKind | null {
  if (node?.type === 'source') return 'source';
  if (node?.type === 'result' && node.result?.kind === 'chart') return 'analysis';
  return null;
}

export function connectionKindBetween(
  nodes: CanvasNode[],
  fromNodeId: string,
  toNodeId: string,
): CanvasConnectionKind | null {
  if (fromNodeId === toNodeId) return null;

  const fromNode = nodes.find(node => node.id === fromNodeId);
  const toNode = nodes.find(node => node.id === toNodeId);
  if (!fromNode || toNode?.type !== 'result' || !toNode.result) return null;

  if (
    fromNode.type === 'source'
    && (toNode.result.kind === null || toNode.result.kind === 'chart')
  ) return 'source';
  if (
    fromNode.type === 'result'
    && fromNode.result?.kind === 'chart'
    && (toNode.result.kind === null
      || toNode.result.kind === 'presentation'
      || toNode.result.kind === 'report')
  ) return 'analysis';

  return null;
}

export function connectCanvasNodes(
  nodes: CanvasNode[],
  fromNodeId: string,
  toNodeId: string,
): CanvasConnectionOutcome {
  const kind = connectionKindBetween(nodes, fromNodeId, toNodeId);
  if (!kind) return { status: 'invalid', nodes };

  const targetNode = nodes.find(node => node.id === toNodeId)!;
  const result = targetNode.result!;

  if (kind === 'source') {
    if (result.kind === 'chart' && result.sourceNodeIds.length === 1 && result.sourceNodeIds[0] === fromNodeId) {
      return { status: 'duplicate', kind, nodes };
    }

    const replaced = result.sourceNodeIds.length > 0;
    return {
      status: replaced ? 'replaced' : 'connected',
      kind,
      nodes: nodes.map(node => node.id === toNodeId
        ? {
          ...node,
          result: {
            ...result,
            kind: 'chart',
            sourceNodeIds: [fromNodeId],
            sourceModuleIds: undefined,
          },
        }
        : node),
    };
  }

  const sourceModuleIds = result.sourceModuleIds ?? [];
  if ((result.kind === 'presentation' || result.kind === 'report') && sourceModuleIds.includes(fromNodeId)) {
    return { status: 'duplicate', kind, nodes };
  }

  return {
    status: 'connected',
    kind,
    nodes: nodes.map(node => node.id === toNodeId
      ? {
        ...node,
        result: {
          ...result,
          kind: result.kind === 'report' ? 'report' : 'presentation',
          sourceNodeIds: [],
          sourceModuleIds: [...sourceModuleIds, fromNodeId],
        },
      }
      : node),
  };
}

export function connectionHandleKey(nodeId: string, side: 'input' | 'output') {
  return `${nodeId}:${side}`;
}

export function connectionPortPoint(node: CanvasNode, side: 'input' | 'output'): CanvasPoint | null {
  if (node.type === 'source') {
    return side === 'output'
      ? { x: node.x + SOURCE_CARD_SIZE.width, y: node.y + SOURCE_CARD_SIZE.height / 2 }
      : null;
  }
  if (node.type === 'result') {
    return {
      x: node.x + (side === 'output' ? RESULT_CARD_SIZE.width : 0),
      y: node.y + RESULT_CARD_SIZE.height / 2,
    };
  }
  return null;
}

export function canvasPointFromClient(
  clientPoint: CanvasPoint,
  canvasOrigin: CanvasPoint,
  pan: CanvasPoint,
  zoom: number,
): CanvasPoint {
  return {
    x: (clientPoint.x - canvasOrigin.x - pan.x) / zoom,
    y: (clientPoint.y - canvasOrigin.y - pan.y) / zoom,
  };
}

export function buildConnectionPath(start: CanvasPoint, end: CanvasPoint) {
  const direction = end.x >= start.x ? 1 : -1;
  const controlDistance = Math.min(140, Math.max(60, Math.abs(end.x - start.x) * 0.35));
  return `M ${start.x} ${start.y} C ${start.x + direction * controlDistance} ${start.y}, ${end.x - direction * controlDistance} ${end.y}, ${end.x} ${end.y}`;
}
