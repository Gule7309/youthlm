# AgentCore smoke test

This spike is intentionally isolated from the YouthLM application. Its only job
is to prove:

1. AWS credentials are valid.
2. The selected region can access the selected Bedrock model.
3. Bedrock Converse succeeds.
4. The custom handler runs locally through AgentCore.
5. The handler can be deployed and invoked through AgentCore Runtime.

## Required environment

Use the region and model enabled in the hackathon workshop account.

```text
AWS_REGION
BEDROCK_MODEL_ID
```

Do not commit credentials or put them in this directory.

## Local request

After installing the AgentCore CLI and project dependencies, run the AgentCore
development server from the repository root. Send this payload to `/invocations`:

```json
{
  "prompt": "Reply with exactly: YouthLM AgentCore smoke test passed"
}
```

## Success response

The exact model wording can vary, but the response must have this shape:

```json
{
  "result": "...",
  "stop_reason": "end_turn"
}
```

## Failure evidence to keep

Record the full error type and request ID for access, region, model, IAM, or
deployment failures. Diagnose the first failing boundary before changing code.

