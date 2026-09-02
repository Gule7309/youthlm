# YouthLM API Contract v0

## Status

Contract version `0.1.0` is the next frontend/backend integration boundary. The
current root-level Python endpoint still accepts the legacy `{ "question": "..." }`
request and returns `AgentResult`; it is not yet compliant with these schemas.

Frontend development should use
`contracts/examples/analysis-result.json` as its mock. Backend development will
implement these schemas in a separate PR after the monorepo foundation is merged.

## Target analysis flow

```text
POST /v1/analysis
AnalysisRequest
→ YouthLM Research Agent
→ deterministic tools
→ AnalysisResult
```

The request sends only `upstream_module_ids`. It does not send prior results.
Backend module storage resolves every identifier to a validated `ModuleContext`.
Canvas coordinates and other presentation state never cross this boundary.

## Required and optional fields

| Contract | Required | Optional |
| --- | --- | --- |
| `AnalysisRequest` | version, project/module IDs, query, upstream IDs | none in v0 |
| `AnalysisResult` | identity, dependency IDs, status, plan, filters, dimensions, data, summary, warnings, sources, versions, provenance | visualization |
| `ModuleContext` | prior module identity, dependencies, status, sources, filters, dimensions, data, summary, warnings, provenance, versions | none in v0 |
| `ErrorResponse` | version, error code, message, retriable flag | details |

Arrays that may have no values remain required and are returned as `[]`. Objects
that may have no values remain required and are returned as `{}`. This prevents
frontend code from needing different shapes for the same completed request.

## Runtime migration impact

Adopting Contract v0 in the runtime is an intentional breaking change from the
current CLI-oriented HTTP shape:

| Area | Current | Contract v0 impact |
| --- | --- | --- |
| Request | `{ "question": "..." }` | Frontend sends project ID, module ID, query, and upstream IDs. |
| Response | `AgentResult` with optional nested analysis | Frontend receives `AnalysisResult` directly. |
| Data | tool-specific `rows` | Frontend reads `result_data.columns` and `result_data.records`. |
| Warning | strings | Frontend renders severity and type from structured warning objects. |
| Source | one dataset reference | Frontend supports arrays of sources and versions. |

This PR only publishes schemas and examples, so it is backward compatible with
the current runtime. The later API implementation PR must update backend models,
tests, docs, and mocks together and must explicitly coordinate the frontend
switch from mock to HTTP.

## Error boundary

Successful, partial, and safely blocked analytical outcomes return
`AnalysisResult`. Invalid input, missing modules, provider failure, timeouts,
agent protocol failures, dataset failures, and internal failures return a non-2xx
HTTP response conforming to `error-response.json`.

Provider implementation details, model IDs, tool-call transcripts, credentials,
and stack traces are not part of the public frontend contract.
