import { BarChart, LineChart } from 'echarts/charts';
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
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
  TitleComponent,
  TooltipComponent,
]);

export function mountChart(
  container: HTMLDivElement,
  option: Record<string, unknown>,
) {
  const chart = init(container);
  chart.setOption(option);
  const observer = new ResizeObserver(() => chart.resize());
  observer.observe(container);
  return () => {
    observer.disconnect();
    chart.dispose();
  };
}
