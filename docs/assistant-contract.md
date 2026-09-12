# Assistant Artifact Context v0

## Decision

`POST /v1/assistant` is an additive Contract v0 boundary. It does not replace or
change `AnalysisRequest`, `AnalysisResult`, `ModuleContext`, or the Presentation
Artifact contracts. The endpoint reuses the same Research Agent and allow-listed
tools used by analysis requests.

The frontend may render `@` mentions however it chooses, but it must send an
explicit `kind` and backend `reference_id`. Display names, Canvas node IDs,
coordinates, edges, zoom, and other UI state are not context identifiers.

## Request

```json
{
  "contract_version": "0.1.0",
  "project_id": "project_1",
  "assistant_id": "assistant_1",
  "message": "這份分析有哪些限制？",
  "context_references": [
    {
      "kind": "analysis",
      "reference_id": "analysis_1"
    }
  ]
}
```

Supported reference kinds are:

| Kind | Backend identity | Resolved context |
| --- | --- | --- |
| `source` | Source Registry `source_id` | metadata, capabilities, limitations, and explicit filters |
| `analysis` | stored `AnalysisResult.module_id` | structured Module Context from the same project |
| `presentation` | stored `PresentationResult.presentation_id` | presentation metadata plus its same-project source modules |

Only source references may contain `filters`. Analysis and Presentation
references are immutable results, so adding filters to them returns HTTP `422`.

## Response and failures

`AssistantResult` returns the natural-language answer, model-step count,
references that were actually resolved, and a compact allow-listed tool trace.
It deliberately omits provider payloads, credentials, model IDs, raw tool
results, and Canvas state.

All analysis or presentation lookups use `(project_id, reference_id)`. A
reference from another project is indistinguishable from a missing reference and
returns HTTP `404` with `context_not_found`. Missing references prevent the model
call; YouthLM never silently drops an explicit `@` mention.

Presentation metadata is persisted in the same configurable SQLite database as
module context. The Assistant does not parse PPTX bytes. It reads the stored
presentation metadata and the structured analysis modules from which the deck
was generated.

## Compatibility impact

- Frontend: no existing call changes; integration may add a new Assistant client.
- Backend: one new endpoint and additive metadata table.
- Existing mocks: unchanged.
- New fixtures: `contracts/examples/assistant-request.json` and
  `contracts/examples/assistant-result.json`.
