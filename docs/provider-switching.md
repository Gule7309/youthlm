# YouthLM provider switching runbook

The workshop AWS credentials expired on 2026-08-18. The organizer's final-round
environment is available only from 2026-09-12 08:00 through 2026-09-13 13:00
(Asia/Taipei). Do not try to repair the expired workshop credentials. Develop with
Gemini before the event, keep deterministic tests on `FakeModelProvider`, and
switch to Bedrock after the final-round environment opens.

Having the team Access Code does not provide AWS SDK credentials or application
authentication. Use it only in the Workshop join portal; never put it in a shell,
`.env`, HTTP request, container, source file, log, screenshot, or chat.

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

## What remains unverified before the issued environment is exercised

The adapters and offline tests exist, but none of the following is proven until
it passes in the fresh organizer environment:

1. Real Bedrock provider smoke test.
2. Local AgentCore smoke backed by Bedrock.
3. AgentCore deployment and cloud invocation.
4. IAM and Bedrock model-access verification.

The Bedrock adapter and its offline tests remain in the repository, so application
development does not have to be rewritten. At the time of this update, AWS CLI
v2, the workstation Docker daemon, a complete container build/run, and real
Bedrock access had not yet been verified.

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

This named profile is for local PowerShell and AWS CLI preflight only. It must not
be copied into a production image.

## Deployed Bedrock credentials use an IAM role

The deployable container uses boto3's default credential chain. On EC2, attach an
instance role; on ECS, attach a task role. Do not set `AWS_PROFILE`, mount
`~/.aws`, or inject long-lived access keys into the container. Set only the
non-secret provider configuration:

```text
MODEL_PROVIDER=bedrock
AWS_REGION=<event-region>
BEDROCK_MODEL_ID=<event-model-or-inference-profile-id>
```

The runtime role must permit `bedrock:InvokeModel` for the selected model or
inference profile. Keep an ECS execution role used for image pull and logging
separate from the application task role. `GET /ready` intentionally checks only
that the Bedrock provider, region, and model are configured; it neither exposes
their values nor proves IAM/model access. The live event-day analysis is the
authorization proof.

## Event day: one preflight command

Use the competition-registration email and the team Access Code directly in the
AWS Workshop portal. Keep the Access Code in the organizer email; never copy it
into this repository, chat, a shell-history command, or a shared screenshot. See
[`docs/final-environment-runbook.md`](final-environment-runbook.md) for the exact
sequence.

Replace the three placeholders with organizer-issued values. Supplying the
expected account ID prevents accidentally using a personal AWS account.
The competition deployment region must be `us-east-1` or `us-west-2` unless
event staff explicitly announces a replacement.

```powershell
.\scripts\event-day-preflight.ps1 `
    -AwsProfile "youthlm-workshop" `
    -AwsRegion "<event-region>" `
    -ModelId "<event-model-id>" `
    -ExpectedAccountId "<event-account-id>"
```

The preflight now runs the complete backend demo acceptance path and stops at the
first failure. It verifies, in order:

1. Offline tests.
2. Ruff.
3. AWS CLI identity and optional expected account ID.
4. A temporary live Contract v0 API using `BedrockConverseProvider`.
5. Source-to-Chart analysis and project-scoped upstream module retrieval.
6. Editable PPTX generation, download, file size, and SHA-256.
7. Editable DOCX report generation, download, file size, and SHA-256.
8. Live Assistant execution with the exact selected Source, Analysis, and
   Presentation references.

The runner invokes the full Python and frontend quality gates with locked
dependencies, checks `/ready` and `/v1/data-sources`, and keeps identifiers out of
normal output. It still runs locally against the named AWS profile; it does not
replace a deployed IAM-role smoke test.

Production Bedrock calls share one provider instance and are serialized with at
least 1.05 seconds between request starts, satisfying the competition's
below-one-RPS rule. Keep one worker and replica; multiple processes would each
have an independent limiter.

Only after it prints `YouthLM Bedrock event-day preflight passed` should you start
the isolated AgentCore smoke app:

```powershell
uv run --frozen python spikes/agentcore_smoke/main.py
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

The AgentCore smoke is isolated and is not the complete YouthLM FastAPI, dataset,
same-origin frontend, SQLite, or PPTX container. Deploy the repository-level
`Dockerfile` for that complete application and keep its `/data` volume plus the
constraints of one worker and one replica.

## Gemini is local-development only

The final-round rules permit only Amazon Bedrock or SageMaker AI foundation models
and AWS cloud services. Do not use Gemini as a final-round fallback. Gemini remains
available only for local development before the organizer environment opens:

```powershell
.\scripts\run-gemini-agent.ps1 `
    -ModelId "gemini-3.1-flash-lite"
```

The application never switches providers automatically. A final-round Bedrock
failure must remain visible and be fixed against the organizer environment.
