# YouthLM Agent

YouthLM Agent v0 is a small, testable agent core for youth-policy data analysis.

The project keeps the core independent from FastAPI, Amazon Bedrock, and Amazon
Bedrock AgentCore. Local tests, the HTTP adapter, and the AgentCore entrypoint will
all call the same application service.

## Level 0

The current level contains only the provider boundary and a deterministic fake.
It intentionally does not contain module contracts, an agent loop, RAG, or data tools.

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
