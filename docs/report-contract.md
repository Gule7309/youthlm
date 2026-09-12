# Report Artifact Contract v0

## Decision

Report Artifact is a generated, editable DOCX derived from one or more stored
`AnalysisResult` modules. It is separate from analytical results and from the
Presentation Artifact lifecycle.

The synchronous Hackathon MVP is:

```text
POST /v1/reports
ReportRequest
→ load modules by (project_id, source_module_id)
→ deterministic python-docx generator
→ store artifact and metadata locally
→ 201 ReportResult(status=ready)
```

The frontend owns its local `running` state. A successful request returns a
ready artifact and a project-scoped download URL. Validation, missing module,
blocked module, generation, and storage failures use the shared non-2xx
`ErrorResponse`. Contract v0 has no queue or polling resource.

## Request

| Field | Required? | Meaning |
| --- | --- | --- |
| `contract_version` | Yes | Contract version, currently `0.1.0`. |
| `project_id` | Yes | Ownership boundary for every source module. |
| `source_module_ids` | Yes | One or more unique stored Analysis modules. |
| `title` | Yes | User-visible report title. |
| `output_format` | Yes | `docx` in v0. |
| `audience` | No | Intended reader. |
| `language` | No | Output language; defaults to `zh-TW`. |
| `template_id` | No | Opaque template identifier. |
| `instructions` | No | Report-format guidance; never a data replacement. |

The frontend sends backend module IDs, not copied results or Canvas state. Every
module is resolved under the same `project_id`; blocked, cross-project, or
missing modules never reach the generator.

## Ready result and document contents

`ReportResult` contains the report ID, source module IDs, DOCX metadata, byte
size, SHA-256 digest, creation time, inherited warnings, and relative download
URL:

```text
/v1/projects/{project_id}/reports/{report_id}/download
```

The deterministic document includes a cover, executive summary, each module's
question and filters, structured result table, analytical warnings, sources,
dataset versions, and provenance. Values are copied from stored structured
results; no second model call recalculates or rewrites the evidence.

## Frontend requirements

- Use completed or partial Analysis modules as inputs, never raw Source Nodes.
- Show inherited warnings before download.
- Keep the generated DOCX editable and do not render a screenshot into a file.
- Do not send coordinates, pan, zoom, edges, or display-only Canvas IDs.
- Treat non-2xx responses as explicit error states and expose retry only when
  the error is retriable.

## Compatibility impact

The change is additive: two schemas, examples, API routes, generated-artifact
stores, and a frontend adapter are added. Existing Analysis, Presentation, and
Assistant contracts retain their current fields and meanings.
