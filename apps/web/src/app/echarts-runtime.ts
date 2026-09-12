import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { init, use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';

use([
  AriaComponent,
  BarChart,
  CanvasRenderer,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  LineChart,
  ScatterChart,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
]);

export function mountChart(
  container: HTMLDivElement,
  option: Record<string, unknown>,
) {
  const chart = init(container);
  try { chart.setOption({ ...option, aria: { enabled: true, label: {
    description: 'YouthLM 分析圖表。完整資料、單位及來源限制請參閱下方表格與執行紀錄。',
  } } }); }
  catch (error) { chart.dispose(); throw error; }
  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(container);
  return () => {
    observer.disconnect();
    chart.dispose();
  };
}
