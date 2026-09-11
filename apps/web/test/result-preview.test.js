import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTs } from './load-ts.js';

const { buildCompactChartOption, formatArtifactFileSize } = await loadTs('../src/app/result-preview.ts');

test('card preview compacts chart chrome without changing source data', () => {
  const original = {
    title: { text: '人口趨勢' },
    legend: { show: true },
    dataZoom: [{ type: 'slider' }],
    xAxis: { name: '年份', data: [2022, 2023, 2024] },
    yAxis: { name: '人口數' },
    series: [{ name: '板橋區', type: 'line', data: [28472, 28174, 27049] }],
  };

  const compact = buildCompactChartOption(original);
  assert.equal(Object.hasOwn(compact, 'dataZoom'), false);
  assert.equal(compact.title.show, false);
  assert.equal(compact.legend.show, false);
  assert.equal(compact.xAxis.name, '');
  assert.deepEqual(compact.series[0].data, original.series[0].data);
  assert.deepEqual(original, {
    title: { text: '人口趨勢' },
    legend: { show: true },
    dataZoom: [{ type: 'slider' }],
    xAxis: { name: '年份', data: [2022, 2023, 2024] },
    yAxis: { name: '人口數' },
    series: [{ name: '板橋區', type: 'line', data: [28472, 28174, 27049] }],
  });
  assert.equal(formatArtifactFileSize(900), '900 B');
  assert.equal(formatArtifactFileSize(1536), '1.5 KB');
});
