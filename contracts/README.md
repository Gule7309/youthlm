# YouthLM Contract v0

These JSON Schemas are the shared public interface between `apps/web/` and
`apps/api/`. The current contract version is `0.1.0` and uses JSON Schema Draft
2020-12.

The canonical frontend mock is
[`examples/analysis-result.json`](examples/analysis-result.json). Frontend work
may depend on that example before the runtime API is contract-compliant.

## Contracts

| File | Purpose |
| --- | --- |
| `analysis-request.json` | Submit one analysis module and semantic dependencies. |
| `analysis-result.json` | Return UI-ready structured analysis. |
| `module-context.json` | Retrieve prior structured module context without another model call. |
| `error-response.json` | Return validation, provider, agent, dataset, and system failures. |
| `common.json` | Define shared identifiers, data, warnings, sources, versions, provenance, and visualization types. |

## Stable frontend fields

Frontend code may rely on these required `AnalysisResult` fields:

- `contract_version`, `project_id`, `module_id`, and `upstream_module_ids`;
- `title`, `question`, `status`, `analysis_plan`, and `summary`;
- `filters`, `dimensions`, and `result_data`;
- `warnings`, `sources`, `dataset_versions`, and `provenance`.

`visualization` is optional. Its absence means that the frontend should render
the result as structured data and narrative without a chart.

## Design decisions

### Identifiers

Identifiers are opaque strings. Producers and consumers must compare them but
must not infer ownership, type, or graph position from their text. They are 1-128
characters and may contain ASCII letters, numbers, `.`, `_`, `:`, and `-`.

### Generic result data

`result_data` uses generic flat records plus explicit column metadata. Each column
declares its name, label, data type, dimension-or-measure role, and optional unit.
This lets multiple government datasets share one contract without requiring the
frontend to understand tool-specific response shapes.

Column names must be unique. Every record key and every visualization field must
refer to a declared column. JSON Schema cannot enforce all cross-field references;
the backend runtime validator will enforce them in the API implementation
checkpoint.

### Structured warnings and status

Warnings are machine-readable objects with `type`, `severity`, `message`, and
`affected_source_ids`. Analytical limitations use these result statuses:

- `completed`: the requested analysis is supported;
- `partial`: useful output exists, but at least one limitation affects the claim;
- `blocked`: YouthLM cannot safely support the requested claim.

An unsupported analytical claim is represented by `status: blocked` and a
blocking `unsupported_claim` warning. Transport, validation, provider, agent,
dataset, and internal failures use `error-response.json` with a non-2xx HTTP
status instead of pretending to be a completed analysis.

### Visualization

Contract v0 supports only `line`, `bar`, and `table`. Line and bar charts require
`x_field` and `y_field`. `series_fields` may contain more than one dimension, so a
chart can distinguish combinations such as age group and sex. The contract never
contains React Flow coordinates, chart-library options, zoom, or drawer state.

### Sources, versions, and provenance

`sources` identifies and cites each source. `dataset_versions` records the exact
retrieved snapshot and checksum. `provenance` connects a source and version to the
deterministic query tool and parameters used for this analysis.

## Compatibility policy

The `contract_version` value follows semantic versioning while v0 evolves:

- patch: clarification or validation fix with no consumer change;
- minor: backward-compatible optional field or enum capability;
- major: required-field removal/rename, semantic change, or incompatible type.

Before changing a contract, a PR must state the reason, backward compatibility,
frontend impact, backend impact, and mock impact. Breaking changes require a new
major contract version and migration plan. The schemas, examples, and
`docs/api-contract.md` must be updated together.
