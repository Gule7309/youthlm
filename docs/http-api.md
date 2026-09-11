# YouthLM HTTP API

The frontend integration endpoint is the Contract v0 app at `apps/api/main.py`.
The HTTP layer is a thin adapter around the provider-neutral `YouthLMAgent`; it
does not contain model or dataset business logic.

## Endpoints

- `GET /health` checks the process without loading provider credentials.
- `GET /ready` returns status-only provider-configuration, packaged-data, and
  writable-storage checks. It does not prove live Bedrock permission or durable
  storage.
- `GET /v1/data-sources` lists shared sources installed and available to every
  notebook.
- `POST /v1/analysis` accepts Contract v0 `AnalysisRequest` and returns a
  Contract v0 `AnalysisResult` directly.
- `POST /v1/presentations` loads stored Analysis modules and returns HTTP `201`
  with a ready `PresentationResult`.
- `GET /v1/projects/{project_id}/presentations/{presentation_id}/download`
  downloads the generated editable PPTX within the same project boundary.

Local browser clients on ports `3000` and `5173` are allowed by the default CORS
policy. The repository Docker image serves the Vite build from this same app, so
the browser and `/v1/*` need no production CORS entry. For split hosting, set an
exact comma-separated HTTPS allowlist with `YOUTHLM_CORS_ORIGINS`; wildcard and
credential-bearing origins are rejected at startup.

Two New Taipei City sources are currently available to every notebook: annual
age-by-sex unemployment rates and annual resident-population counts by district,
5-year age group, and sex. Planned education, other employment, entrepreneurship,
uploaded CSV, and PDF sources are not reported as available.

Start the Gemini API on Windows after copying the API key to the clipboard:

```powershell
.\scripts\run-gemini-api.ps1
```

Then open `http://127.0.0.1:8000/docs`. The direct repository-root equivalent is:

```powershell
uv run --frozen python -m uvicorn main:app `
    --app-dir apps/api `
    --host 127.0.0.1 `
    --port 8000
```

In a second PowerShell window, execute the canonical Source-to-Chart request and
a downstream Module Context request:

```powershell
uv run --frozen python -m spikes.analysis_api_smoke
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

## Generate a presentation

First create or reuse one or more stored Analysis modules. Then send only their
IDs and project identity:

```powershell
$body = Get-Content contracts/examples/presentation-request.json -Raw
$result = Invoke-RestMethod `
    -Method Post `
    -Uri "http://127.0.0.1:8000/v1/presentations" `
    -ContentType "application/json" `
    -Body $body

Invoke-WebRequest `
    -Uri ("http://127.0.0.1:8000" + $result.download_url) `
    -OutFile $result.file_name
```

The example's `project_id` and `source_module_ids` must match modules already
stored by `POST /v1/analysis`. Generated files default to `var/artifacts`; both
the SQLite database and artifact directory are local runtime state.

For the canonical demo module, first run the Analysis smoke and then the
Presentation smoke in the same API process:

```powershell
uv run --frozen python -m spikes.analysis_api_smoke
uv run --frozen python -m spikes.presentation_api_smoke
```

The second command verifies the returned contract, downloaded byte size and
SHA-256 digest, then saves the editable file under `var/smoke`.
