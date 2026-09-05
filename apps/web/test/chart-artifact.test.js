import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildChartArtifactView,
  buildEChartsOption,
} from "../src/chart-artifact.js";

function fixture(name) {
  const url = new URL(
    `../../../contracts/fixtures/frontend-integration/${name}`,
    import.meta.url,
  );
  return JSON.parse(readFileSync(url, "utf8"));
}

test("partial analysis renders a chart and preserves trust information", () => {
  const view = buildChartArtifactView(fixture("analysis-result.example.json"));

  assert.equal(view.kind, "chart");
  assert.equal(view.status, "partial");
  assert.equal(view.showWarningBanner, true);
  assert.equal(view.highestWarningSeverity, "warning");
  assert.deepEqual(view.chartOption.xAxis.data, [2022, 2023, 2024]);
  assert.deepEqual(
    view.chartOption.series[0].data.map((point) => point.value),
    [28472, 28174, 27049],
  );
  assert.equal(view.chartOption.series[0].data[0].sourceRecord.year, 2022);
  assert.equal(
    view.sources[0].datasetVersion.dataset_version_id,
    "2026-08-31:226feaf05ffb",
  );
  assert.equal(view.sources[0].provenance.length, 1);
});

test("blocked analysis never renders a chart", () => {
  const view = buildChartArtifactView(fixture("blocked-result.example.json"));

  assert.equal(view.kind, "blocked");
  assert.equal(view.status, "blocked");
  assert.equal(view.chartOption, null);
  assert.equal(view.highestWarningSeverity, "blocking");
  assert.deepEqual(view.table.records, []);
});

test("HTTP error becomes an explicit error view", () => {
  const view = buildChartArtifactView(
    fixture("error-response.example.json"),
    { httpStatus: 404 },
  );

  assert.equal(view.kind, "error");
  assert.equal(view.httpStatus, 404);
  assert.equal(view.code, "module_not_found");
  assert.equal(view.retriable, false);
});

test("missing visualization falls back to a data table", () => {
  const result = fixture("analysis-result.example.json");
  delete result.visualization;

  const view = buildChartArtifactView(result);

  assert.equal(view.kind, "table");
  assert.equal(view.chartOption, null);
  assert.equal(view.table.records.length, 3);
});

test("multiple series align missing points and retain clicked source rows", () => {
  const result = fixture("analysis-result.example.json");
  result.status = "completed";
  result.warnings = [];
  result.visualization.series_fields = ["sex"];
  result.result_data.records = [
    { year: 2022, geography: "板橋區", age_group: "20-24", sex: "male", population_count: 10 },
    { year: 2022, geography: "板橋區", age_group: "20-24", sex: "female", population_count: 12 },
    { year: 2023, geography: "板橋區", age_group: "20-24", sex: "male", population_count: 9 },
  ];

  const option = buildEChartsOption(result);

  assert.deepEqual(option.xAxis.data, [2022, 2023]);
  assert.equal(option.series.length, 2);
  assert.match(option.series[0].name, /male/);
  assert.deepEqual(
    option.series[0].data.map((point) => point?.value ?? null),
    [10, 9],
  );
  assert.deepEqual(
    option.series[1].data.map((point) => point?.value ?? null),
    [12, null],
  );
});

test("ambiguous duplicate chart points fail instead of displaying wrong data", () => {
  const result = fixture("analysis-result.example.json");
  result.visualization.series_fields = [];
  result.result_data.records.push({ ...result.result_data.records[0] });

  assert.throws(
    () => buildEChartsOption(result),
    /more than one point for series\/x pair/,
  );
});
