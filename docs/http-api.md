# YouthLM HTTP API

The frontend integration endpoint is the Contract v0 app at `apps/api/main.py`.
The HTTP layer is a thin adapter around the provider-neutral `YouthLMAgent`; it
does not contain model or dataset business logic.

## Endpoints

- `GET /health` checks the process without loading provider credentials.
- `GET /v1/data-sources` lists shared sources installed and available to every
  notebook.
- `POST /v1/analysis` accepts Contract v0 `AnalysisRequest` and returns a
  Contract v0 `AnalysisResult` directly.

Local browser clients on ports `3000` and `5173` are allowed by the default CORS
policy. Deployed frontend origins must be passed explicitly when composing the app;
the API does not use a wildcard origin.

Two New Taipei City sources are currently available to every notebook: annual
age-by-sex unemployment rates and annual resident-population counts by district,
5-year age group, and sex. Planned education, other employment, entrepreneurship,
uploaded CSV, and PDF sources are not reported as available.

Start the Gemini API on Windows after copying the API key to the clipboard:

```powershell
.\scripts\run-gemini-api.ps1
```

Then open `http://127.0.0.1:8000/docs`. The runner starts:

```text
uvicorn main:app --app-dir apps/api
```

In a second PowerShell window, execute the canonical Source-to-Chart request and
a downstream Module Context request:

```powershell
uv run python -m spikes.analysis_api_smoke
```

The first request is loaded without modification from
`contracts/fixtures/frontend-integration/analysis-request.example.json`. The
second request references the first result using `upstream_module_ids`, so a
pass proves that the live HTTP runtime stored and resolved project-scoped module
context.

To inspect the catalog directly:

```powershell
Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:8000/v1/data-sources"
```

The legacy root `app.api` remains available only for backward compatibility. New
frontend work must not use its `{ "question": "..." }` request shape.
