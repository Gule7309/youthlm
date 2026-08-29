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
- stop explicitly when the configured maximum number of model turns is reached.

The first deterministic tool, `calculate_change`, compares two youth-policy
indicator values. RAG, live dataset connectors, and the HTTP API remain separate
later checkpoints.

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
selects the low-latency `gemini-3.1-flash-lite`, and runs the real two-turn
tool-call smoke. It never writes the key to a file. Override the model or timeout
explicitly when needed:

```powershell
.\scripts\run-gemini-agent.ps1 `
    -ModelId "gemini-3.1-flash-lite" `
    -RequestTimeoutSeconds 45
```
