# YouthLM Agent

YouthLM Agent v0 is a small, testable agent core for youth-policy data analysis.

The project keeps the core independent from FastAPI, Amazon Bedrock, and Amazon
Bedrock AgentCore. Local tests, the HTTP adapter, and the AgentCore entrypoint will
all call the same application service.

## Agent MVP

The current level contains a provider-neutral agent loop that can:

- ask the selected model whether a tool is needed;
- execute allow-listed application tools;
- send tool results back to Gemini or Bedrock;
- return the model's final answer with an auditable tool trace;
- return deterministic dataset rows and a UI-ready line-chart contract;
- stop explicitly when the configured maximum number of model turns is reached.

The deterministic tools now include:

- `search_sources` for finding installed sources by topic, agency, or capability;
- `inspect_source` for reading statistical dimensions, version, provenance, and
  limitations before a query;
- `check_compatibility` for deciding whether a requested age, year, geography,
  sex, and unit scope is exact, partial, estimated, or incompatible;
- `calculate_change` for comparing two indicator values;
- `query_youth_dataset` for filtering a versioned New Taipei City government
  unemployment-rate snapshot by year, age group, and sex;
- `query_population_dataset` for filtering official resident-population counts by
  year, New Taipei City or district, published 5-year age group, and sex.

Every dataset result includes provenance, unit, version, and limitations. RAG,
runtime dataset downloads, and cross-source joins remain separate later checkpoints.
The structured frontend contract is documented in
[`docs/analysis-result.md`](docs/analysis-result.md).

The first HTTP boundary is now available:

- `GET /health`
- `GET /ready`
- `GET /v1/data-sources`
- `POST /v1/analysis`
- `POST /v1/presentations`
- `GET /v1/projects/{project_id}/presentations/{presentation_id}/download`

See [`docs/http-api.md`](docs/http-api.md) for the request and response workflow.

## Model providers

YouthLM selects one provider explicitly through `MODEL_PROVIDER`:

- `gemini` for development while workshop AWS credentials are unavailable.
- `bedrock` for the workshop account after fresh credentials are issued.
- `FakeModelProvider` directly in deterministic unit tests.

There is no automatic provider fallback. See
[`docs/provider-switching.md`](docs/provider-switching.md) for the current workflow
and the event-day preflight command.

For one-command backend demo acceptance, see
[`docs/demo-readiness.md`](docs/demo-readiness.md). On Windows, copy the Gemini key
and run:

```powershell
.\scripts\run-demo-preflight.ps1
```

It starts a temporary API, proves Source-to-Chart and stored upstream context,
generates and validates an editable PPTX, then always stops the temporary server.
For the interactive browser demo, copy a fresh Gemini key and run:

```powershell
.\scripts\run-local-demo.ps1
```

This validates the key and selected model before starting the API and Vite UI,
opens `http://127.0.0.1:5173`, and stops both servers when you press Enter in the
runner's PowerShell window.
For the organizer-issued final-round AWS environment and the mandatory Bedrock
switch, follow [`docs/final-environment-runbook.md`](docs/final-environment-runbook.md).

## Local setup

```bash
uv sync --frozen --dev
uv run --frozen pytest
uv run --frozen ruff check .
```

Run the Contract v0 API from the repository root with the Python module form.
This keeps both the root `app/` package and `apps/api/` importable on Windows:

```powershell
uv run --frozen python -m uvicorn main:app `
    --app-dir apps/api `
    --host 127.0.0.1 `
    --port 8000
```

`GET /health` is process liveness only. `GET /ready` reports status-only checks
for provider configuration, installed datasets, and writable storage; it does
not expose configuration values and does not prove live Bedrock permission.

When dependencies are already available but package downloads are blocked, the
provider tests also run with Python's standard library:

```bash
python -m unittest discover -s tests -v
```

## Single-container deployment

The repository-level `Dockerfile` builds the Vite application and serves it from
the Contract v0 FastAPI application. The browser and `/v1/*` API therefore use
the same origin; do not set a public API base URL for this layout. Build from the
repository root:

At the time of this documentation update, the workstation Docker daemon and AWS
CLI v2 were not available for validation. The image build/run and real Bedrock
path therefore remain unverified gates until they pass in the target environment.

```powershell
docker build -t youthlm:competition .
```

Run the image on an AWS compute resource that has an EC2 instance role or ECS
task role with permission to invoke the selected Bedrock model. Do not copy an
AWS profile or static access keys into the image. The following example uses a
Docker volume on one fixed host; replace only the non-secret placeholders with
the values issued inside the competition environment:

```powershell
docker volume create youthlm-data
docker run -d --name youthlm --restart unless-stopped `
    -p 8000:8000 `
    --mount type=volume,source=youthlm-data,target=/data `
    -e MODEL_PROVIDER=bedrock `
    -e AWS_REGION="<event-region>" `
    -e BEDROCK_MODEL_ID="<event-model-or-inference-profile-id>" `
    youthlm:competition
```

The image already runs Uvicorn with one worker and stores SQLite plus generated
PPTX files under `/data`. Mount `/data` on persistent storage and keep exactly
one application worker and one replica. A writable container filesystem or
ephemeral task disk is not persistence. After recreating the container with the
same volume, verify that a stored analysis and its presentation can still be
retrieved.

Terminate TLS at the AWS ingress or reverse proxy. The bundled frontend is
same-origin, so no production CORS entry is needed for this layout. If the
frontend is hosted separately, configure an exact HTTPS allowlist through
`YOUTHLM_CORS_ORIGINS`; never use `*`.

The Workshop Access Code is only for joining the organizer portal. It is not an
application password, API token, HTTP header, container variable, or AWS SDK
credential.

## Run the real agent with Gemini

Copy the Gemini API key to the Windows clipboard. Then run this from PowerShell:

```powershell
.\scripts\run-gemini-agent.ps1
```

The script reads the key into the current process only, clears the clipboard,
selects the low-latency `gemini-3.1-flash-lite`, and runs a real dataset-query
tool round trip. It never writes the key to a file. Override the model or timeout
explicitly when needed:

```powershell
.\scripts\run-gemini-agent.ps1 `
    -ModelId "gemini-3.1-flash-lite" `
    -RequestTimeoutSeconds 45
```

The bundled datasets and their limitations are documented in
[`docs/youth-data.md`](docs/youth-data.md) and
[`docs/population-data.md`](docs/population-data.md).
The source discovery and compatibility rules are documented in
[`docs/source-registry.md`](docs/source-registry.md).

## Run the local API with Gemini

Copy the Gemini API key to the Windows clipboard, then run:

```powershell
.\scripts\run-gemini-api.ps1
```

Open `http://127.0.0.1:8000/docs` to exercise the API without writing frontend
code first. This script starts the Contract v0 entrypoint in `apps/api`, not the
legacy root API.

In a second PowerShell window, run the live Source-to-Chart and Module Context
smoke:

```powershell
uv run python -m spikes.analysis_api_smoke
```

The smoke sends the canonical frontend request, validates a real
`AnalysisResult`, and then submits a downstream module using the first result's
ID. A passing second request proves that SQLite persistence and project-scoped
Module Context lookup work through HTTP.

The React/Vite frontend lives in `apps/web/`, alongside the framework-neutral
Chart Artifact adapter. The Python domain core remains in `app/`.

```bash
cd apps/web
npm ci
npm run dev
```

Use `npm run check` to run strict TypeScript checking, build the UI, and execute
all frontend tests, including the fixture-based Chart and Presentation Artifact
tests, stopping on the first failure. Each gate
can also run separately with `npm run typecheck`, `npm run build`, or `npm test`.
Source-to-Chart analysis and Chart-to-Presentation generation use the live
Contract v0 endpoints. Canvas links remain frontend state: each chart sends
exactly one raw `source_selection`, while a presentation may aggregate multiple
completed analyses. Login, whole-notebook cloud persistence, uploads, Assistant
analysis, and Policy Radar remain frontend prototypes.

After an Analysis module is stored, `POST /v1/presentations` can generate an
editable `.pptx` without another model call. The deterministic generator uses
the stored result's summary, structured data, visualization mapping, sources,
versions, and warnings. Generated files are stored under
`YOUTHLM_ARTIFACT_DIR` (default `var/artifacts`) and remain project-scoped.
After the Analysis smoke has stored its canonical module, verify the full
generation and download boundary with:

```powershell
uv run python -m spikes.presentation_api_smoke
```

The framework-neutral Chart Artifact adapter and frontend interaction handoff are
documented in [`apps/web/README.md`](apps/web/README.md) and
[`docs/frontend-chart-artifact.md`](docs/frontend-chart-artifact.md). They map
Contract v0 results to explicit chart, table, blocked, and error view states
without putting ECharts options or Canvas UI state into the backend contract.

To run the real population Agent path instead of the unemployment Golden Path:

```powershell
.\scripts\run-gemini-agent.ps1 -Scenario population
```
