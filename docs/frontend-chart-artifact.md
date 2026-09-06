# Frontend Chart Artifact handoff

This handoff explains how a frontend consumes YouthLM Contract v0 without knowing
anything about Gemini, Bedrock, the Agent loop, deterministic query tools, or
SQLite module storage.

## Request and response

The Source Node sends selected raw inputs through `source_selections`. A connected
Analysis Module sends previous semantic results through `upstream_module_ids`.
These concepts must remain separate.

```text
Source Node selection
→ POST /v1/analysis
→ AnalysisResult
→ buildChartArtifactView(payload, { httpStatus })
→ chart | table | blocked | error
```

Use the exact request and response under
`contracts/fixtures/frontend-integration/`. Do not derive chart numbers from the
model summary; render only `result_data.records` using the column names referenced
by `visualization`.

## Minimal frontend wiring

```js
import { buildChartArtifactView } from "./chart-artifact.js";

const response = await fetch("/v1/analysis", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(analysisRequest),
});

const payload = await response.json();
const view = buildChartArtifactView(payload, {
  httpStatus: response.status,
});
```

Render by `view.kind`:

| `kind` | Required UI |
| --- | --- |
| `chart` | ECharts canvas/SVG, summary, warnings, source control, and accessible table fallback. |
| `table` | Declared column labels, rows, summary, warnings, and sources. |
| `blocked` | Blocking message, recommended narrower claim when present, and no empty chart. |
| `error` | Error message; show retry only when `retriable` is true. |

`status: partial` is useful output, not an error. Render its chart or table and
keep the warning banner visible. A transport/API failure uses `kind: error` and is
not an `AnalysisResult`.

## ECharts integration

Install `echarts` inside the frontend package after its package manager is chosen.
The reference adapter returns a serializable ECharts option and preserves the
exact source record on each data point:

```js
chart.setOption(view.chartOption);

chart.on("click", ({ data }) => {
  if (data?.sourceRecord) {
    openRecordDetail(data.sourceRecord);
  }
});
```

Recommended interactions:

| Interaction | Behavior | Backend call? |
| --- | --- | --- |
| Point click | Open a record-detail popover using `sourceRecord`. | No |
| Legend toggle | Hide/show a series locally. | No |
| Zoom or pan within chart | Update only transient chart state. | No |
| Open sources | Show source title, agency, URL, dataset version, license, and provenance query. | No |
| Change source filters or question | Submit a new `POST /v1/analysis`; never mutate old result rows. | Yes |
| Connect an upstream module | Put its ID in `upstream_module_ids` and submit a new analysis. | Yes |

Chart zoom, legend visibility, popover state, Canvas coordinates, React Flow
edges, drawer state, and node dimensions are frontend UI state. Never send them
to the YouthLM Agent as module context.

## Trust and accessibility

- Display `summary` as narrative, not as the source for chart values.
- Display all warnings; use severity to control prominence, not whether they exist.
- For `blocking`, show the explanation and `warning.context.recommended_claim`
  when available.
- Keep a table view available for keyboard users and for checking exact values.
- Use `sources`, `dataset_versions`, and `provenance` in a source drawer.
- Do not use color as the only way to distinguish series.

## Presentation Artifact boundary

Presentation generation is P1 and is not part of `AnalysisResult`. Its standalone
`PresentationRequest` and `PresentationResult` Contract v0 is proposed in PR
#13. Until the API endpoint exists, hide the action or label it as unavailable;
do not generate a PPTX from the chart DOM and do not invent an endpoint.

The planned v0 interaction is synchronous:

```text
User selects one or more completed/partial Analysis Modules
→ clicks Generate presentation
→ frontend enters a local generating state
→ POST /v1/presentations with project_id + source_module_ids + options
→ backend loads stored structured AnalysisResults
→ python-pptx creates and stores an editable PPTX
→ HTTP 201 returns PresentationResult(status=ready)
   or non-2xx returns the existing ErrorResponse
→ ready state exposes a download action
```

Contract v0 has no backend queue or polling state. OpenSlide will not be
installed. Presenton remains an optional adapter experiment after the
deterministic python-pptx version works.
