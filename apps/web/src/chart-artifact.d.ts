import type { ChartArtifactView } from './app/types';

export function buildChartArtifactView(
  payload: Record<string, unknown>,
  options?: { httpStatus?: number },
): ChartArtifactView;

export function buildEChartsOption(
  result: Record<string, unknown>,
): Record<string, unknown>;
