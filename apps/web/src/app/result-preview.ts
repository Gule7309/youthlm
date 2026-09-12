function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function buildCompactChartOption(option: Record<string, unknown>) {
  const compact = { ...option };
  delete compact.dataZoom;
  compact.animation = false;
  compact.title = { ...asObject(option.title), show: false };
  compact.legend = { ...asObject(option.legend), show: false };
  compact.tooltip = { show: false };
  compact.grid = { left: 42, right: 10, top: 12, bottom: 28, containLabel: false };
  compact.xAxis = {
    ...asObject(option.xAxis),
    name: '',
    axisLabel: { ...asObject(asObject(option.xAxis).axisLabel), fontSize: 9, color: '#64748b' },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: '#cbd5e1' } },
  };
  compact.yAxis = {
    ...asObject(option.yAxis),
    name: '',
    axisLabel: { ...asObject(asObject(option.yAxis).axisLabel), fontSize: 9, color: '#64748b' },
    splitLine: { lineStyle: { color: '#e2e8f0' } },
  };
  if (Array.isArray(option.series)) {
    compact.series = option.series.map(series => ({
      ...asObject(series),
      symbolSize: 5,
      lineStyle: { ...asObject(asObject(series).lineStyle), width: 2 },
    }));
  }
  return compact;
}

export function formatArtifactFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
