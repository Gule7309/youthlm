# YouthLM final-round AWS runbook

This runbook records the non-secret operating details from the organizer email
received on 2026-09-08. It intentionally excludes the registration email, team
Access Code, one-time passwords, AWS credentials, account IDs, and model IDs.

## Fixed organizer constraints

- Final round: 2026-09-12 and 2026-09-13.
- AWS environment window: 2026-09-12 08:00 through 2026-09-13 13:00
  (Asia/Taipei).
- Submission deadline: 2026-09-13 13:00.
- Join portal: <https://catalog.us-east-1.prod.workshops.aws/join>.
- Sign-in method: `Email one time password` using the competition-registration
  email, followed by the team Access Code from the organizer email.
- Allowed foundation-model path: Amazon Bedrock or SageMaker AI, with AWS cloud
  services. Gemini is not a final-round fallback.

Do not infer the workload region from the Workshop portal hostname. Use the
region, account, credentials, and model access shown inside the issued environment.
The Workshop Access Code only unlocks the organizer portal. Never reuse it as an
application login, API token, HTTP header, environment variable, or AWS SDK
credential.

## Current verification status

The repository now contains a multi-stage `Dockerfile`, same-origin Vite serving,
an exact CORS allowlist for split deployments, and status-only `/health` and
`/ready` endpoints. At the time of this update, the workstation Docker daemon,
AWS CLI v2, a complete image build/run, and real Bedrock access in the issued
environment had not yet been verified. Treat each item as an open gate, not as a
completed deployment.

## Before the environment opens

1. Keep daily development on Gemini and deterministic tests on fake providers.
2. Install and verify Git, `uv`, AWS CLI v2, Node.js, frontend dependencies, and
   a running Docker daemon.
3. Keep `main` demo-ready and preserve the provider-neutral boundary.
4. Keep the organizer email accessible on a second device without copying its
   Access Code into source files, chat, screenshots, `.env`, or shell history.
5. Do not reuse or repair the credentials that expired on 2026-08-18.

## 2026-09-12 at 08:00

1. Open a clean PowerShell window.
2. Join the AWS Workshop portal with the competition-registration email, its
   one-time password, and the team Access Code from the organizer email.
3. Obtain the fresh AWS CLI credentials from the issued environment. Replace the
   access key, secret key, and session token together in the isolated
   `youthlm-workshop` profile. Never paste those values into chat or GitHub.
4. Record the issued AWS account ID, workload region, and permitted Bedrock model
   or inference-profile ID outside the repository.
5. Confirm the identity before running YouthLM:

   ```powershell
   aws sts get-caller-identity `
       --profile youthlm-workshop `
       --region "<event-region>"
   ```

6. Run the complete backend acceptance path:

   ```powershell
   .\scripts\event-day-preflight.ps1 `
       -AwsProfile "youthlm-workshop" `
       -AwsRegion "<event-region>" `
       -ModelId "<event-model-or-inference-profile-id>" `
       -ExpectedAccountId "<event-account-id>"
   ```

The preflight must finish with `YouthLM Bedrock event-day preflight passed`.
Preserve the reported output and log directory for diagnosis.

## Build and run the single container

Run the local API directly only with the module form below; it keeps the root
`app/` package importable on Windows:

```powershell
uv run --frozen python -m uvicorn main:app `
    --app-dir apps/api `
    --host 127.0.0.1 `
    --port 8000
```

After the Bedrock event-day preflight passes, build the image from the repository
root:

```powershell
docker build -t youthlm:competition .
```

Deploy the image to one EC2 instance or one ECS task with an attached instance
role or task role. The runtime role must permit `bedrock:InvokeModel` for the
organizer-approved model or inference profile. `AWS_PROFILE` remains a local
CLI/preflight setting; do not copy the profile, `~/.aws`, static credentials, or
the Workshop Access Code into the container.

The container requires these non-secret runtime settings:

```text
MODEL_PROVIDER=bedrock
AWS_REGION=<event-region>
BEDROCK_MODEL_ID=<event-model-or-inference-profile-id>
```

The image already serves the Vite build and `/v1/*` from one origin, listens on
`0.0.0.0:8000`, and runs one Uvicorn worker. It writes SQLite and generated PPTX
files below `/data`. Mount `/data` on storage that survives container recreation,
and keep exactly one worker and one replica. Do not count an ephemeral task disk
as persistence.

For a fixed Docker host, the equivalent runtime shape is:

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

Terminate HTTPS at the AWS ingress or reverse proxy. Same-origin deployment does
not need a production CORS entry. If frontend hosting is split from the API, set
`YOUTHLM_CORS_ORIGINS` to the exact HTTPS frontend origin and verify that a
foreign origin is rejected.

## Acceptance gates

Do not start deployment until all of these pass in the issued environment:

1. AWS identity and expected account match.
2. Bedrock Converse text and tool-call round trip.
3. Source selection to deterministic query and chart-ready `AnalysisResult`.
4. Project-scoped upstream Module Context retrieval.
5. Editable PPTX generation and download.
6. Local AgentCore `/invocations` smoke, if AgentCore is part of the submitted
   deployment.
7. Container root, `/health`, `/ready`, and `/v1/data-sources` all respond through
   the deployed HTTPS origin. `/health` is liveness; `/ready` checks only
   configuration presence, installed data, and writable storage.
8. Recreate the single container with the same `/data` volume and retrieve a
   previously stored analysis and PPTX.

Do not infer Bedrock authorization from `/ready`: the live analysis and PPTX path
in the event-day preflight is the permission and integration proof. Do not scale
past one worker or one replica while SQLite and local artifact storage remain in
use.

## Deadline discipline

Treat 2026-09-13 12:00 as the internal code and demo freeze. Use the final hour
for submission, artifact verification, and recovery only. The organizer submission
deadline and AWS environment shutdown are both 13:00, so no workflow may depend on
access after that time.
