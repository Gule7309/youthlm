# Frontend Integration Contract Freeze

## Audit mapping

This mapping preserves backend domain terms. Frontend node names do not rename
or replace the Research Agent, Source Registry, compatibility tools, module
results, or provider boundary.

| Frontend concept | Existing backend capability | Missing adapter/contract | Required change | Breaking? | Priority |
| --- | --- | --- | --- | --- | --- |
| Source Node | Source Registry discovers and inspects shared sources; deterministic tools accept source-specific filters. | `AnalysisRequest` previously described only a question and prior module results. Project-uploaded source registration is still TBD. | Add optional `source_selections` containing `source_id` and source-specific `filters`; validate shared IDs and enforce the selection at the Agent/tool boundary. | No. Existing requests remain valid. | P0 |
| Chart Artifact | `POST /v1/analysis` returns Contract-valid `AnalysisResult` with records, visualization, summary, warnings, sources, versions, and provenance. | Executable frontend fixtures were missing. | Publish exact success, blocked, and error fixtures and prove the Source-to-Chart route with an HTTP integration test. | No. | P0 |
| Presentation Artifact | Stored Analysis data and provenance produce a deterministic editable PPTX. | None for synchronous v0 generation. | Send project-scoped module IDs to `POST /v1/presentations`; display warnings and download metadata. | No. Additive boundary. | P1 complete |
| Report Artifact | Stored Analysis data, limitations, sources, versions, and provenance produce a deterministic editable DOCX. | None for synchronous v0 generation. | Send project-scoped module IDs to `POST /v1/reports`; display warnings and download metadata. | No. Additive boundary. | P1 complete |
| Assistant Node | The Research Agent resolves explicit Source, Analysis, and Presentation references and returns a compact tool trace. | Conversation persistence and Canvas mutation tools remain deferred. | Send only user-selected backend identities to `POST /v1/assistant`; never infer context from coordinates or labels. | No. Additive boundary. | P1 complete |
| Connected upstream module | `ModuleContext` and `upstream_module_ids` are defined; local SQLite now persists validated results. | Remote/multi-machine persistence is not implemented. | Resolve by `(project_id, module_id)` and inject structured context into the existing Agent. | No public contract change. | P0 complete |
| Project-uploaded source | Source IDs and project IDs already exist as opaque identifiers. | Source Registry currently supports only shared installed sources. Upload storage, registration, and ownership are TBD. | Reject unknown source IDs for now; design project-owned source registration separately. | TBD. | P1 |
| Policy Radar | No dedicated backend contract is required by the first chart flow. | Product inputs, scoring semantics, and output contract are TBD. | Defer until Source-to-Chart and module persistence are stable. | TBD. | P2 |
| Canvas position and UI state | Intentionally absent from backend contracts. | None. | Keep `x`, `y`, zoom, pan, width, drawer state, and React Flow internals entirely in `apps/web/`. | No. | Frontend-only |

## Minimal change

`source_selections` and `upstream_module_ids` have different meanings and must
never be combined:

- `source_selections`: raw data inputs chosen for this request;
- `upstream_module_ids`: prior structured `AnalysisResult` modules used as
  semantic context.

Each source selection has this public shape:

```json
{
  "source_id": "ntpc_population_by_age_sex_district",
  "filters": {
    "geographies": ["板橋區"],
    "age_groups": ["20-24"],
    "sexes": ["all"],
    "start_year": 2022,
    "end_year": 2024
  }
}
```

The field is optional and defaults to `[]`, so every valid pre-freeze request
remains valid. A selected shared source must exist in the Source Registry. The
current runtime limits the list to one item because Contract v0 produces one
deterministic dataset result and has no join specification. More than one item
returns `422 dataset_error` before invoking the model; the frontend therefore
uses a single-source radio choice for charts and combines separate completed
analyses at the presentation layer. This is an explicit temporary limitation,
not a multi-source implementation.
runtime gives the selection to the existing Research Agent, requires a successful
compatibility check, and verifies that the deterministic query kept both the
source ID and every selected filter. It does not ask the model to manufacture
rows, chart points, warnings, versions, or provenance.

## Shared source catalog

Before building an `AnalysisRequest`, the frontend loads shared installed sources:

```text
GET /v1/data-sources
→ DataSourceCatalog
→ Source Node registry selector and filter controls
```

The exact response is frozen as
`contracts/fixtures/frontend-integration/data-sources.example.json`. This mock
contains the two sources currently installed for every notebook:

- `ntpc_unemployment_by_age_sex`;
- `ntpc_population_by_age_sex_district`.

The frontend may use `available_geographies`, `available_age_groups`,
`available_sexes`, `available_years`, and `capabilities` to constrain its filter
controls. It must preserve the selected registry `source_id`; a Canvas Source
Node ID is only UI identity and never substitutes for it.

Only sources whose `status` is `available` and `default_for_notebooks` is `true`
should appear in the first P0 selector. File uploads and arbitrary API sources
remain separate P1 registration workflows and cannot be sent as invented source
IDs.

## First integration golden path

The implemented P0 path is:

```text
Source selection
→ POST /v1/analysis
→ Research Agent
→ compatibility tool
→ deterministic query tool
→ Contract v0 adapter
→ AnalysisResult
→ frontend Chart Artifact
```

Report, Presentation, and Assistant are separate additive paths built on the
stored modules created by this golden path. Policy Radar, automatic Canvas
construction, and advanced PDF workflows remain outside it.

## Frontend fixtures and HTTP behavior

| Case | Request | Response | HTTP status |
| --- | --- | --- | --- |
| Load shared Source Nodes | none | `contracts/fixtures/frontend-integration/data-sources.example.json` | `200` |
| Source-to-Chart success | `contracts/fixtures/frontend-integration/analysis-request.example.json` | `contracts/fixtures/frontend-integration/analysis-result.example.json` | `200` |
| Safely blocked exact 18–35 claim | Request below | `contracts/fixtures/frontend-integration/blocked-result.example.json` | `200` |
| Missing upstream module | Request below | `contracts/fixtures/frontend-integration/error-response.example.json` | `404` |

A blocked analytical outcome is a valid `AnalysisResult`, not a transport error.
The frontend should display the blocking warning and must not render a chart when
`visualization` is absent. A missing module is a request/runtime failure and uses
the non-2xx `ErrorResponse` contract.

Exact blocked request:

```json
{
  "contract_version": "0.1.0",
  "project_id": "project_frontend_demo",
  "module_id": "analysis_blocked_age",
  "query": "精確分析板橋區2024年18至35歲人口",
  "upstream_module_ids": [],
  "source_selections": [
    {
      "source_id": "ntpc_population_by_age_sex_district",
      "filters": {
        "geographies": ["板橋區"],
        "age_groups": ["15-19", "20-24", "25-29", "30-34", "35-39"],
        "sexes": ["all"],
        "start_year": 2024,
        "end_year": 2024
      }
    }
  ]
}
```

Exact missing-module request:

```json
{
  "contract_version": "0.1.0",
  "project_id": "project_frontend_demo",
  "module_id": "analysis_downstream",
  "query": "比較板橋區2022至2024年20至24歲人口趨勢",
  "upstream_module_ids": ["analysis_missing"],
  "source_selections": [
    {
      "source_id": "ntpc_population_by_age_sex_district",
      "filters": {
        "geographies": ["板橋區"],
        "age_groups": ["20-24"],
        "sexes": ["all"],
        "start_year": 2022,
        "end_year": 2024
      }
    }
  ]
}
```

`apps/api/tests/test_frontend_integration_fixture.py` sends these payloads
through the actual ASGI route, Research Agent, compatibility tool, deterministic
population query, and Contract adapter. It uses a deterministic fake model
provider so CI does not require credentials or make paid network calls.

## Module persistence decision

The Hackathon MVP uses local SQLite persistence.
SQLite survives API restarts and requires no external service, while remaining
simple enough for a one-machine demo. In-memory storage is rejected because a
reload loses the analysis graph; a managed database is deferred because it adds
deployment and credential work without improving the first demo.

The persistence boundary will enforce:

- primary identity `(project_id, module_id)`;
- upstream lookup always constrained by the request's `project_id`;
- a module with the same ID in another project is treated as not found;
- only structured, Contract-valid `AnalysisResult` is stored;
- SQLite files are runtime state and never committed.

Shared registry sources may be selected by every project. Project-uploaded
sources will require an explicit owner `project_id`; their registration and file
lifecycle remain TBD and are not inferred in this checkpoint.
