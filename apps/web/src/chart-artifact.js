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
      table: buildTableModel(payload.result_data),
    };
  }

  return {
    ...base,
    kind: "table",
    chartOption: null,
    table: buildTableModel(payload.result_data),
  };
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
    status: result.status,
    summary: result.summary,
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
