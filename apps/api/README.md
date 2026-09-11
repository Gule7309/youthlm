# YouthLM API workspace

This directory is the backend-owned entrypoint in the YouthLM monorepo. Frontend
code belongs in `apps/web/` and must not import backend implementation modules.

The existing root `app/` package remains the application core during the
transition. The monorepo entrypoint adapts that core to the published Contract v0
without asking the model to copy dataset rows or chart values.

The API workspace temporarily mirrors the root backend dependency constraints.
This duplication is removed when the core package moves under `apps/api/app/`.

Run the API workspace from the repository root:

```powershell
uv sync --frozen --dev
uv run --frozen pytest -q apps/api/tests
uv run --frozen python -m uvicorn main:app `
    --app-dir apps/api `
    --host 127.0.0.1 `
    --port 8000
```

On Windows, `scripts/run-gemini-api.ps1` configures Gemini and launches the same
Contract v0 entrypoint. With the server running, use a second PowerShell window
for the live contract smoke:

```powershell
uv run --frozen python -m spikes.analysis_api_smoke
```

`POST /v1/analysis` accepts the complete `AnalysisRequest` from
`contracts/analysis-request.json` and returns an `AnalysisResult` directly.
Validation, provider, and Agent failures use the shared `ErrorResponse` shape.
When `source_selections` is present, the API validates shared source IDs and the
adapter requires the Agent to run compatibility checking before a deterministic
query with the exact selected filters. Contract v0 currently accepts at most one
`source_selections` item per analysis; larger lists return HTTP 422
`dataset_error` before model execution.

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

## Health and production container behavior

`GET /health` only proves that the HTTP process is alive. `GET /ready` returns
generic booleans for provider configuration, packaged data, and writable
storage. It never returns credential, profile, region, model, account, or path
values. A ready response does not replace the event-day live Bedrock analysis
and presentation preflight.

The repository-level `Dockerfile` builds `apps/web/` and enables
`YOUTHLM_SERVE_WEB`, so the Vite output is mounted after all API routes and is
served from the same origin. The image starts this entrypoint with one Uvicorn
worker on `0.0.0.0:8000`. Build it from the repository root:

The Docker daemon, AWS CLI v2, complete image build/run, and real Bedrock path
were still unverified at the time of this documentation update.

```powershell
docker build -t youthlm:competition .
```

The image sets `YOUTHLM_SQLITE_PATH=/data/youthlm.sqlite3` and
`YOUTHLM_ARTIFACT_DIR=/data/artifacts`. `/data` must be a persistent volume;
keep one worker and one replica while these local stores are in use. Validate
persistence by recreating the container with the same volume and retrieving a
previously stored module and PPTX.

For Bedrock, set `MODEL_PROVIDER=bedrock`, `AWS_REGION`, and
`BEDROCK_MODEL_ID`. `AWS_PROFILE` is only for the local PowerShell preflight. On
EC2 or ECS, attach an instance role or task role and let boto3 use its default
credential chain. Do not copy a profile, static keys, the Workshop Access Code,
or organizer credentials into the image. The runtime role must permit
`bedrock:InvokeModel` for the selected model or inference profile.

The bundled frontend needs no CORS configuration because it is same-origin. If
the frontend is deployed separately, set `YOUTHLM_CORS_ORIGINS` to an exact
comma-separated HTTPS allowlist. Wildcards, paths, embedded credentials, query
strings, and fragments are rejected during application startup.
