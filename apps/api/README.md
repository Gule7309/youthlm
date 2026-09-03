# YouthLM API workspace

This directory is the backend-owned entrypoint in the YouthLM monorepo. Frontend
code belongs in `apps/web/` and must not import backend implementation modules.

During this foundation checkpoint, the existing root `app/` package remains the
application core so the open population-data pull request can merge without a
large file-move conflict. `main.py` is intentionally a thin entrypoint; it does
not duplicate routes or Agent logic.

The API workspace temporarily mirrors the root backend dependency constraints.
This duplication is removed when the core package moves under `apps/api/app/`.

Run the API workspace from the repository root:

```bash
uv sync --dev
uv run pytest -q apps/api/tests
uv run uvicorn main:app --app-dir apps/api
```

The next checkpoint will implement Contract v0 at this HTTP boundary. Moving the
remaining backend modules under `apps/api/app/` is deferred until the population
source checkpoint is merged.
