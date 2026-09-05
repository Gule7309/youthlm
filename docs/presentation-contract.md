# Presentation Artifact Contract v0

## Decision

Presentation Artifact is a generated file derived from one or more stored,
structured `AnalysisResult` modules. It is not an analysis result and does not
add presentation fields to `AnalysisResult` or `ModuleContext`.

The Hackathon MVP uses a synchronous generation boundary:

```text
POST /v1/presentations
PresentationRequest
→ load modules by (project_id, source_module_id)
→ python-pptx generator
→ store artifact locally
→ 201 PresentationResult(status=ready)
```

While the request is pending, the frontend owns its local `generating` state.
A successful request returns a ready artifact and download URL. Validation,
missing modules, generator, and storage failures return a non-2xx
`ErrorResponse`; v0 does not add a queue, polling endpoint, or background job
database.

This document freezes only the public data shape. The endpoint and generator are
later checkpoints.

## Required and optional request fields

| Field | Required? | Meaning |
| --- | --- | --- |
| `contract_version` | Yes | Contract version, currently `0.1.0`. |
| `project_id` | Yes | Project ownership boundary for every source module. |
| `source_module_ids` | Yes | One or more unique stored Analysis Modules used as deck evidence. |
| `title` | Yes | User-visible deck title. |
| `output_format` | Yes | `pptx` in v0. |
| `audience` | No | Intended reader, without introducing a closed product enum. |
| `language` | No | Output language; defaults to `zh-TW`. |
| `template_id` | No | Opaque template identifier. |
| `instructions` | No | Presentation-only guidance, never a replacement for source data. |

The frontend sends module IDs, not copied `AnalysisResult` objects. The backend
must resolve every module using the same `project_id`; a module belonging to
another project is unavailable even if its identifier is known.

## Ready result

`PresentationResult` returns the generated ID, source module IDs, file metadata,
SHA-256 digest, creation time, and a relative download URL. It also carries the
structured analytical warnings inherited from its source modules so the
frontend can display limitations before download and the generator can include
them inside the deck.

The v0 download URL includes both identities:

```text
/v1/projects/{project_id}/presentations/{presentation_id}/download
```

The future download route must resolve the artifact by this composite identity.
A URL is not an authorization boundary; real authentication remains a later
deployment concern.

## Frontend lifecycle

```text
idle
→ local generating state after click
→ ready from HTTP 201
   or
→ error from non-2xx ErrorResponse
```

The frontend must not:

- create a PPTX from the ECharts DOM;
- send Canvas coordinates, zoom, pan, or React Flow state;
- omit partial-result warnings from the generated-artifact confirmation;
- invent queued or polling states that v0 does not expose.

## Compatibility impact

1. **Reason:** the product includes a Presentation Artifact, but generated files
   have a different lifecycle from analytical results.
2. **Backward compatibility:** yes. Two standalone schemas and models are added;
   no existing field, endpoint, or meaning changes.
3. **Frontend impact:** none until the endpoint exists. Later the frontend sends
   `PresentationRequest`, shows a local loading state, then consumes the ready
   result or the existing error shape.
4. **Backend impact:** later work must add project-scoped module loading,
   deterministic `python-pptx` generation, local artifact storage, and a
   project-scoped download route.
5. **Mock impact:** new canonical request/result examples are added; existing
   Analysis fixtures remain unchanged.

OpenSlide is not a dependency. Presenton remains a later adapter comparison only
after the deterministic generator passes its integration tests.
