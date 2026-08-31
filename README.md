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
- `GET /v1/data-sources`
- `POST /v1/analysis`

See [`docs/http-api.md`](docs/http-api.md) for the request and response workflow.

## Model providers

YouthLM selects one provider explicitly through `MODEL_PROVIDER`:

- `gemini` for development while workshop AWS credentials are unavailable.
- `bedrock` for the workshop account after fresh credentials are issued.
- `FakeModelProvider` directly in deterministic unit tests.

There is no automatic provider fallback. See
[`docs/provider-switching.md`](docs/provider-switching.md) for the current workflow
and the event-day preflight command.

## Local setup

```bash
uv sync --dev
uv run pytest
uv run ruff check .
```

When dependencies are already available but package downloads are blocked, the
provider tests also run with Python's standard library:

```bash
python -m unittest discover -s tests -v
```

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
code first.

To run the real population Agent path instead of the unemployment Golden Path:

```powershell
.\scripts\run-gemini-agent.ps1 -Scenario population
```
