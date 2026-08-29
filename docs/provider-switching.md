# YouthLM provider switching runbook

The workshop AWS credentials expired on 2026-08-18. Do not block development on
Bedrock access and do not try to repair expired credentials. Develop with Gemini,
keep deterministic tests on `FakeModelProvider`, and switch to Bedrock only after
the organizer issues fresh credentials.

The switch is explicit. If `MODEL_PROVIDER=bedrock` is selected and AWS fails,
YouthLM fails visibly instead of silently falling back to Gemini.

## Development now: Gemini

Open PowerShell in the repository root. Put the API key only in the current shell
or an untracked `.env`; never paste it into GitHub or chat.

```powershell
# Copy the key, then let the runner read and clear the clipboard.
.\scripts\run-gemini-agent.ps1
```

The runner explicitly selects the stable, low-latency
`gemini-3.1-flash-lite`, a 45-second request timeout, and low thinking. Override
them only when needed:

```powershell
.\scripts\run-gemini-agent.ps1 `
    -ModelId "gemini-3.1-flash-lite" `
    -RequestTimeoutSeconds 60
```

A timeout fails explicitly. YouthLM does not automatically retry or switch to a
different provider.

Expected output starts with:

```text
provider=gemini
```

Then continue building the agent loop, data tools, HTTP API, and frontend against
the provider-neutral `ModelProvider`. Unit tests should continue using
`FakeModelProvider` or fake transports.

## What is postponed while AWS is expired

Do not treat these as current blockers:

1. Real Bedrock provider smoke test.
2. Local AgentCore smoke backed by Bedrock.
3. AgentCore deployment and cloud invocation.
4. IAM and Bedrock model-access verification.

The Bedrock adapter and its offline tests remain in the repository, so application
development does not have to be rewritten later.

## Prepare once before the event

Keep workshop credentials isolated from personal AWS credentials in the named
profile `youthlm-workshop`.

Use a new PowerShell window on event day. The selection script deliberately stops
if `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, or `AWS_SESSION_TOKEN` already
exists in the shell, because those values can override the named profile. This
prevents an expired environment credential from defeating the fresh profile.

```powershell
aws configure --profile youthlm-workshop
```

If the organizer provides a temporary session token, also set the new token:

```powershell
aws configure set aws_session_token "<new-session-token>" --profile youthlm-workshop
```

Do not run these commands until fresh credentials are issued. If fresh credentials
include a session token, all three credential values must be replaced together.
Do not paste their values into chat, source code, `.env.example`, or GitHub.

## Event day: one preflight command

Replace the three placeholders with organizer-issued values. Supplying the
expected account ID prevents accidentally using a personal AWS account.

```powershell
.\scripts\event-day-preflight.ps1 `
    -AwsProfile "youthlm-workshop" `
    -AwsRegion "<event-region>" `
    -ModelId "<event-model-id>" `
    -ExpectedAccountId "<event-account-id>"
```

The preflight stops at the first failure and verifies, in order:

1. Offline tests.
2. Ruff.
3. AWS CLI identity and optional expected account ID.
4. A real request through `BedrockConverseProvider`.

Only after it prints `YouthLM Bedrock event-day preflight passed` should you start
the isolated AgentCore smoke app:

```powershell
uv run python spikes/agentcore_smoke/main.py
```

In a second PowerShell window:

```powershell
$body = @{
    prompt = "Reply with exactly: YouthLM AgentCore smoke test passed"
} | ConvertTo-Json

Invoke-RestMethod `
    -Method Post `
    -Uri "http://localhost:8080/invocations" `
    -ContentType "application/json" `
    -Body $body
```

AgentCore deployment comes after both the provider preflight and local
`/invocations` smoke succeed.

## Fast rollback to Gemini

If Bedrock is unavailable and the competition rules permit the substitute, switch
the current PowerShell session back explicitly:

```powershell
.\scripts\run-gemini-agent.ps1 `
    -ModelId "gemini-3.1-flash-lite"
```

This rollback is a conscious operator action; the application never performs it
automatically.
