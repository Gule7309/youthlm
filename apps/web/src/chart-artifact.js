/**
 * Framework-neutral reference adapter for YouthLM Contract v0.
 *
 * The module intentionally does not import ECharts or a UI framework. The
 * frontend owns rendering and Canvas state; this adapter only turns a validated
 * API response into an explicit view state and a serializable ECharts option.
 */

const CHART_TYPES = new Set(["line", "bar"]);
const RESULT_STATUSES = new Set(["completed", "partial", "blocked"]);
const SEVERITY_RANK = new Map([
  ["info", 0],
  ["warning", 1],
  ["blocking", 2],
]);

const NEW_TAIPEI_DISTRICT_CENTERS = {
  "板橋區": [121.4618, 25.0114],
  "三重區": [121.4881, 25.0615],
  "中和區": [121.4980, 24.9986],
  "永和區": [121.5149, 25.0078],
  "新莊區": [121.4504, 25.0358],
  "新店區": [121.5415, 24.9676],
  "樹林區": [121.4215, 24.9907],
  "鶯歌區": [121.3540, 24.9566],
  "三峽區": [121.3690, 24.9343],
  "淡水區": [121.4450, 25.1676],
  "汐止區": [121.6627, 25.0670],
  "瑞芳區": [121.8099, 25.1089],
  "土城區": [121.4433, 24.9722],
  "蘆洲區": [121.4739, 25.0849],
  "五股區": [121.4387, 25.0827],
  "泰山區": [121.4322, 25.0589],
  "林口區": [121.3916, 25.0775],
  "深坑區": [121.6157, 25.0023],
  "石碇區": [121.6586, 24.9916],
  "坪林區": [121.7112, 24.9374],
  "三芝區": [121.5019, 25.2580],
  "石門區": [121.5689, 25.2908],
  "八里區": [121.4070, 25.1467],
  "平溪區": [121.7382, 25.0261],
  "雙溪區": [121.8657, 25.0360],
  "貢寮區": [121.9182, 25.0220],
  "金山區": [121.6364, 25.2219],
  "萬里區": [121.6888, 25.1780],
  "烏來區": [121.5504, 24.8653],
};

/**
 * Convert an HTTP response payload into a frontend view state.
 *
 * @param {Record<string, unknown>} payload
 * @param {{httpStatus?: number}} [options]
 * @returns {Record<string, unknown>}
 */
export function buildChartArtifactView(payload, { httpStatus = 200 } = {}) {
  assertObject(payload, "YouthLM response payload");

  if (httpStatus >= 400 || Object.hasOwn(payload, "error")) {
    return buildErrorView(payload, httpStatus);
  }

  assertAnalysisResult(payload);
  const base = buildAnalysisBase(payload);

  if (payload.status === "blocked") {
    return {
      ...base,
      kind: "blocked",
      chartOption: null,
      table: buildTableModel(payload.result_data),
    };
  }

  const visualization = payload.visualization;
  const hasRecords = payload.result_data.records.length > 0;

  if (
    visualization &&
    CHART_TYPES.has(visualization.type) &&
    hasRecords
  ) {
    return {
      ...base,
      kind: "chart",
      chartOption: buildEChartsOption(payload),
      hotspotOption: buildDistrictHotspotOption(payload),
      table: buildTableModel(payload.result_data),
    };
  }

  return {
    ...base,
    kind: "table",
    chartOption: null,
    hotspotOption: buildDistrictHotspotOption(payload),
    table: buildTableModel(payload.result_data),
  };
}

/**
 * Build a district hotspot view from deterministic population rows.
 * The latest returned year is aggregated across disjoint selected age bands.
 * Official all-sex rows take precedence over sex-specific rows to avoid double counts.
 *
 * @param {Record<string, any>} result
 * @returns {Record<string, unknown> | null}
 */
export function buildDistrictHotspotOption(result) {
  assertAnalysisResult(result);
  const records = result.result_data.records;
  const years = records
    .map((record) => record.year)
    .filter((year) => Number.isInteger(year));
  if (years.length === 0) return null;

  const latestYear = Math.max(...years);
  const rowsByDistrict = new Map();
  for (const record of records) {
    const district = record.geography;
    if (
      record.year !== latestYear
      || typeof district !== "string"
      || !(district in NEW_TAIPEI_DISTRICT_CENTERS)
      || typeof record.population_count !== "number"
    ) {
      continue;
    }
    const rows = rowsByDistrict.get(district) ?? [];
    rows.push(record);
    rowsByDistrict.set(district, rows);
  }
  if (rowsByDistrict.size < 2) return null;

  const totals = [...rowsByDistrict.entries()].map(([district, rows]) => {
    const officialTotals = rows.filter((row) => row.sex === "all");
    const selectedRows = officialTotals.length > 0 ? officialTotals : rows;
    const total = selectedRows.reduce(
      (sum, row) => sum + row.population_count,
      0,
    );
    return { district, total };
  }).sort((left, right) => right.total - left.total);

  const values = totals.map(({ total }) => total);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 1);
  const data = totals.map(({ district, total }, rank) => ({
    name: district,
    value: [...NEW_TAIPEI_DISTRICT_CENTERS[district], total],
    symbolSize: 12 + (28 * (total - minimum)) / range,
    label: { show: rank < 6 },
  }));

  return {
    aria: { enabled: true, decal: { show: true } },
    title: {
      text: `${latestYear} 年新北市青年人口熱點`,
      subtext: "行政區區位中心示意；圓點大小與色階依官方人口數",
      left: "center",
    },
    tooltip: {
      trigger: "item",
      formatter: ({ data: point }) => (
        `${point.name}<br/>${Number(point.value[2]).toLocaleString("zh-TW")} 人`
      ),
    },
    visualMap: {
      min: minimum,
      max: maximum,
      dimension: 2,
      orient: "horizontal",
      left: "center",
      bottom: 4,
      text: ["高", "低"],
      inRange: { color: ["#c4b5fd", "#7c3aed", "#be123c"] },
    },
    grid: { left: 12, right: 12, top: 64, bottom: 46 },
    xAxis: { type: "value", min: 121.30, max: 122.00, show: false },
    yAxis: { type: "value", min: 24.78, max: 25.34, show: false },
    series: [{
      name: "青年人口",
      type: "scatter",
      data,
      itemStyle: { opacity: 0.86 },
      label: {
        position: "right",
        color: "#334155",
        fontSize: 10,
        formatter: "{b}",
      },
      emphasis: { focus: "self", scale: 1.15 },
    }],
  };
}

/**
 * Keep model-written summaries readable without allowing arbitrary HTML.
 * React will still escape the returned plain text when it is rendered.
 *
 * @param {string} summary
 * @returns {string}
 */
export function normalizeAnalysisSummary(summary) {
  return summary
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Build an ECharts option from line/bar VisualizationSpec and deterministic rows.
 * Arbitrary ECharts configuration never crosses the public backend contract.
 *
 * @param {Record<string, any>} result
 * @returns {Record<string, unknown>}
 */
export function buildEChartsOption(result) {
  assertAnalysisResult(result);
  const visualization = result.visualization;

  if (!visualization || !CHART_TYPES.has(visualization.type)) {
    throw new Error("ECharts requires a line or bar VisualizationSpec");
  }

  const xField = visualization.x_field;
  const yField = visualization.y_field;
  const seriesFields = visualization.series_fields ?? [];
  const records = result.result_data.records;
  const columns = new Map(
    result.result_data.columns.map((column) => [column.name, column]),
  );

  const xDomain = uniqueValues(records.map((record) => record[xField]));
  const grouped = groupRecords(records, seriesFields);
  const xColumn = columns.get(xField);
  const yColumn = columns.get(yField);
  const unit = visualization.unit ?? yColumn?.unit ?? "";

  const series = [...grouped.values()].map(({ values, records: group }) => {
    const recordsByX = new Map();

    for (const record of group) {
      const key = valueKey(record[xField]);
      if (recordsByX.has(key)) {
        throw new Error(
          `Visualization has more than one point for series/x pair: ${key}`,
        );
      }
      recordsByX.set(key, record);
    }

    const name = seriesName(values, seriesFields, columns, yColumn?.label);
    return {
      name,
      type: visualization.type,
      connectNulls: false,
      emphasis: { focus: "series" },
      data: xDomain.map((xValue) => {
        const record = recordsByX.get(valueKey(xValue));
        return record
          ? {
              value: record[yField],
              sourceRecord: record,
            }
          : null;
      }),
    };
  });

  const option = {
    aria: { enabled: true, decal: { show: true } },
    title: { text: visualization.title, left: "center" },
    tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
    legend: { show: series.length > 1, top: 36 },
    grid: { left: 64, right: 32, top: series.length > 1 ? 84 : 64, bottom: 56 },
    xAxis: {
      type: "category",
      name: xColumn?.label ?? xField,
      nameLocation: "middle",
      nameGap: 32,
      data: xDomain,
    },
    yAxis: {
      type: "value",
      name: unit || yColumn?.label || yField,
    },
    series,
  };

  if (xDomain.length > 12) {
    option.dataZoom = [{ type: "inside" }, { type: "slider" }];
  }

  return option;
}

function buildAnalysisBase(result) {
  const warnings = result.warnings.map((warning) => ({ ...warning }));
  return {
    contractVersion: result.contract_version,
    projectId: result.project_id,
    moduleId: result.module_id,
    title: result.title,
    question: result.question,
    analysisPlan: result.analysis_plan.map((step) => ({ ...step })),
    filters: structuredClone(result.filters),
    status: result.status,
    summary: normalizeAnalysisSummary(result.summary),
    warnings,
    showWarningBanner: result.status === "partial" || warnings.length > 0,
    highestWarningSeverity: highestWarningSeverity(warnings),
    sources: buildSourceModels(result),
  };
}

function buildErrorView(payload, httpStatus) {
  const error = payload.error;
  assertObject(error, "YouthLM error payload");
  return {
    kind: "error",
    httpStatus,
    code: error.code,
    message: error.message,
    retriable: error.retriable === true,
    details: error.details ?? {},
  };
}

function buildTableModel(resultData) {
  return {
    columns: resultData.columns.map((column) => ({ ...column })),
    records: resultData.records.map((record) => ({ ...record })),
  };
}

function buildSourceModels(result) {
  const versions = new Map(
    result.dataset_versions.map((version) => [
      version.dataset_version_id,
      version,
    ]),
  );

  return result.sources.map((source) => ({
    ...source,
    datasetVersion: versions.get(source.dataset_version_id) ?? null,
    provenance: result.provenance.filter(
      (record) => record.source_id === source.source_id,
    ),
  }));
}

function groupRecords(records, seriesFields) {
  const groups = new Map();

  for (const record of records) {
    const values = seriesFields.map((field) => record[field]);
    const key = JSON.stringify(values);
    const group = groups.get(key) ?? { values, records: [] };
    group.records.push(record);
    groups.set(key, group);
  }

  return groups;
}

function seriesName(values, fields, columns, fallback) {
  if (fields.length === 0) {
    return fallback ?? "value";
  }

  return values
    .map((value, index) => {
      const label = columns.get(fields[index])?.label ?? fields[index];
      return `${label}: ${String(value)}`;
    })
    .join(" · ");
}

function uniqueValues(values) {
  const seen = new Set();
  const unique = [];

  for (const value of values) {
    const key = valueKey(value);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(value);
    }
  }

  return unique;
}

function valueKey(value) {
  return JSON.stringify([typeof value, value]);
}

function highestWarningSeverity(warnings) {
  let highest = null;
  let highestRank = -1;

  for (const warning of warnings) {
    const rank = SEVERITY_RANK.get(warning.severity) ?? -1;
    if (rank > highestRank) {
      highest = warning.severity;
      highestRank = rank;
    }
  }

  return highest;
}

function assertAnalysisResult(result) {
  assertObject(result, "AnalysisResult");

  if (result.contract_version !== "0.1.0") {
    throw new Error(`Unsupported contract version: ${result.contract_version}`);
  }
  if (!RESULT_STATUSES.has(result.status)) {
    throw new Error(`Unsupported AnalysisResult status: ${result.status}`);
  }
  if (!Array.isArray(result.analysis_plan)) {
    throw new TypeError("AnalysisResult.analysis_plan must be an array");
  }
  assertObject(result.filters, "AnalysisResult.filters");
  assertObject(result.result_data, "AnalysisResult.result_data");
  if (!Array.isArray(result.result_data.columns)) {
    throw new TypeError("AnalysisResult.result_data.columns must be an array");
  }
  if (!Array.isArray(result.result_data.records)) {
    throw new TypeError("AnalysisResult.result_data.records must be an array");
  }
  for (const field of ["warnings", "sources", "dataset_versions", "provenance"]) {
    if (!Array.isArray(result[field])) {
      throw new TypeError(`AnalysisResult.${field} must be an array`);
    }
  }
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}
