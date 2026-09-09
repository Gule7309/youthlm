# YouthLM API workspace

This directory is the backend-owned entrypoint in the YouthLM monorepo. Frontend
code belongs in `apps/web/` and must not import backend implementation modules.

The existing root `app/` package remains the application core during the
transition. The monorepo entrypoint adapts that core to the published Contract v0
without asking the model to copy dataset rows or chart values.

The API workspace temporarily mirrors the root backend dependency constraints.
This duplication is removed when the core package moves under `apps/api/app/`.

Run the API workspace from the repository root:

```bash
uv sync --dev
uv run pytest -q apps/api/tests
uv run uvicorn main:app --app-dir apps/api
```

On Windows, `scripts/run-gemini-api.ps1` configures Gemini and runs this exact
entrypoint. With the server running, use a second PowerShell window for the live
contract smoke:

```powershell
uv run python -m spikes.analysis_api_smoke
```

`POST /v1/analysis` accepts the complete `AnalysisRequest` from
`contracts/analysis-request.json` and returns an `AnalysisResult` directly.
Validation, provider, and Agent failures use the shared `ErrorResponse` shape.
When `source_selections` is present, the API validates shared source IDs and the
adapter requires the Agent to run compatibility checking before a deterministic
query with the exact selected filters.

Contract-valid results are stored in local SQLite. Requests with non-empty
`upstream_module_ids` resolve project-scoped `ModuleContext` objects and supply
them to the Agent; missing IDs return `module_not_found`. Configure the database
path with `YOUTHLM_SQLITE_PATH` (default `var/youthlm.sqlite3`). Moving the
remaining backend modules under `apps/api/app/` remains deferred.

`POST /v1/presentations` accepts the separate `PresentationRequest`, resolves
every source module by `(project_id, module_id)`, and returns HTTP `201` with a
ready `PresentationResult`. The response's project-scoped `download_url` serves
the editable PPTX. Configure generated-file storage with
`YOUTHLM_ARTIFACT_DIR` (default `var/artifacts`). Blocked or cross-project source
modules never reach the generator.

`POST /v1/assistant` accepts explicit Source, Analysis, and Presentation
references. It resolves them by backend identity before invoking the same
Research Agent. Analysis and Presentation lookups always include `project_id`;
cross-project or missing references return `context_not_found` without calling
the model.
