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

`POST /v1/analysis` accepts the complete `AnalysisRequest` from
`contracts/analysis-request.json` and returns an `AnalysisResult` directly.
Validation, provider, and Agent failures use the shared `ErrorResponse` shape.

Requests with non-empty `upstream_module_ids` currently return
`module_not_found`; resolving and persisting `ModuleContext` is the next separate
checkpoint. Moving the remaining backend modules under `apps/api/app/` is also
deferred so it does not obscure the HTTP contract migration.
