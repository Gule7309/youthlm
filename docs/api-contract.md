# YouthLM API Contract v0

## Status

Contract version `0.1.0` is the frontend/backend integration boundary. The
monorepo entrypoint at `apps/api/main.py` accepts `AnalysisRequest` and returns
`AnalysisResult` directly. The root-level `app.api` endpoint temporarily keeps
the legacy `{ "question": "..." }` / `AgentResult` shape for backward
compatibility during migration.

Frontend development can continue using
`contracts/examples/analysis-result.json` as its canonical mock, then switch to
the `apps/api` HTTP endpoint without special parsing.

## Target analysis flow

```text
POST /v1/analysis
AnalysisRequest
→ YouthLM Research Agent
→ deterministic tools
→ AnalysisResult
```

The request sends only `upstream_module_ids`; it never sends prior results.
Optional `source_selections` supplies raw data source IDs and source-specific
filters. Raw source selection and prior module context are separate semantics.
The API resolves upstream IDs from local SQLite using the composite project and
module identity. Missing IDs receive a structured `module_not_found` response
rather than being silently ignored. Canvas coordinates and other presentation
state never cross this boundary.

## Required and optional fields

| Contract | Required | Optional |
| --- | --- | --- |
| `AnalysisRequest` | version, project/module IDs, query, upstream IDs | source selections |
| `AnalysisResult` | identity, dependency IDs, status, plan, filters, dimensions, data, summary, warnings, sources, versions, provenance | visualization |
| `ModuleContext` | prior module identity, dependencies, status, sources, filters, dimensions, data, summary, warnings, provenance, versions | none in v0 |
| `ErrorResponse` | version, error code, message, retriable flag | details |

Arrays that may have no values remain required and are returned as `[]`. Objects
that may have no values remain required and are returned as `{}`. This prevents
frontend code from needing different shapes for the same completed request.

## Runtime migration status

The new monorepo entrypoint and the legacy root entrypoint coexist temporarily:

| Area | Legacy `app.api` | Contract v0 `apps/api` |
| --- | --- | --- |
| Request | `{ "question": "..." }` | Frontend sends project ID, module ID, query, and upstream IDs. |
| Response | `AgentResult` with optional nested analysis | Frontend receives `AnalysisResult` directly. |
| Data | tool-specific `rows` | Frontend reads `result_data.columns` and `result_data.records`. |
| Warning | strings | Frontend renders severity and type from structured warning objects. |
| Source | one dataset reference | Frontend supports arrays of sources and versions. |

No existing root route is removed in this checkpoint. Frontend integration should
target `apps/api`; once consumers have migrated, removal of the legacy root
entrypoint will be proposed as a separate breaking cleanup.

## Error boundary

Successful, partial, and safely blocked analytical outcomes return
`AnalysisResult`. Invalid input, missing modules, provider failure, timeouts,
agent protocol failures, dataset failures, and internal failures return a non-2xx
HTTP response conforming to `error-response.json`.

Provider implementation details, model IDs, tool-call transcripts, credentials,
and stack traces are not part of the public frontend contract.

The first executable frontend mapping, fixtures, HTTP statuses, and MVP storage
decision are documented in
[`frontend-integration-contract.md`](frontend-integration-contract.md).
The implemented storage lifecycle and project-isolation rules are documented in
[`module-context-storage.md`](module-context-storage.md).
