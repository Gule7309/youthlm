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
- Deployment must use `us-east-1` or `us-west-2` unless event staff explicitly
  announces a replacement region.
- Keep Amazon Bedrock traffic below one request per second and enable only the
  model access needed by the project.
- Do not expose S3 publicly, open an EC2 security group fully to the internet,
  or make RDS/EMR publicly accessible. Never upload secrets or prohibited
  personal, regulated, financial, health, biometric, or payment data.

Do not infer the workload region from the Workshop portal hostname. Confirm that
the issued workload region is `us-east-1` or `us-west-2`; if staff announces a
different region, preserve that announcement and use the preflight's explicit
override switch. Use the account, credentials, and model access shown inside
the issued environment.
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

## Build preflight inputs

Have these ready before starting the event-day command:

| Input | Required value or proof |
| --- | --- |
| Local tools | Git, `uv`, Node/npm, AWS CLI v2, and a running Docker daemon |
| Issued identity | `youthlm-workshop` profile plus expected AWS account ID; no credential environment variables overriding the profile |
| Region | `us-east-1` or `us-west-2`, unless staff explicitly announces a replacement |
| Model | One organizer-approved Bedrock model or inference-profile ID with `bedrock:InvokeModel`; do not bulk-enable models |
| Runtime | One worker and one replica so SQLite storage and the Bedrock request limiter remain coherent |
| Storage | A persistent `/data` volume writable by the non-root container user; prove analysis, PPTX, and DOCX survive recreation |
| Network | Same-origin HTTPS ingress; no public S3, fully open EC2 security group, or public RDS／EMR |
| Secrets | No keys, tokens, Access Code, account credentials, `.env`, or AWS profile files in Git, the image, logs, or screenshots |
| Data | Only the packaged public youth datasets; do not import prohibited personal or regulated data |

The repository preflight covers code, data, live model calls, Assistant context,
and artifact integrity. It cannot create the issued credentials, grant model
access, start Docker, or prove the deployed role and network policy; those remain
manual environment gates.

## 2026-09-12 at 08:00

1. Open a clean PowerShell window.
2. Join the AWS Workshop portal with the competition-registration email, its
   one-time password, and the team Access Code from the organizer email.
3. Obtain the fresh AWS CLI credentials from the issued environment. Replace the
   access key, secret key, and session token together in the isolated
   `youthlm-workshop` profile. Never paste those values into chat or GitHub.
4. Record the issued AWS account ID, workload region, and permitted Bedrock model
   or inference-profile ID outside the repository.
   Request access only to that model and revoke unused model access after the demo.
5. Confirm the identity before running YouthLM:

   ```powershell
   aws sts get-caller-identity `
       --profile youthlm-workshop `
       --region "<event-region>"
   ```

6. Run the complete live Bedrock and container build acceptance path:

   ```powershell
   .\scripts\build-preflight.ps1 `
       -AwsProfile "youthlm-workshop" `
       -AwsRegion "<event-region>" `
       -ModelId "<event-model-or-inference-profile-id>" `
       -ExpectedAccountId "<event-account-id>"
   ```

   If and only if event staff has announced a replacement deployment region, add
   `-AllowOrganizerRegionOverride` and keep the announcement with the run record.

The command must print both `YouthLM Bedrock event-day preflight passed` and
`YouthLM competition build preflight passed`. It runs the real Bedrock golden
path outside the container, builds the deployable image, checks the container
homepage/API readiness/catalog, and recreates the container to prove an isolated
`/data` volume survives. It never injects or mounts AWS credentials into the
image. Preserve the reported output and log directory for diagnosis.

## Build and run the single container

Run the local API directly only with the module form below; it keeps the root
`app/` package importable on Windows:

```powershell
uv run --frozen python -m uvicorn main:app `
    --app-dir apps/api `
    --host 127.0.0.1 `
    --port 8000
```

The build preflight leaves the verified image available locally. To rebuild it
without rerunning the full preflight:

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
and DOCX files below `/data`. Mount `/data` on storage that survives container
recreation,
and keep exactly one worker and one replica. Do not count an ephemeral task disk
as persistence.

The 2026-07-22 supported-services workbook includes the required actions for
Bedrock Runtime, AgentCore, EC2, ECR, ECS, Elastic Load Balancing, IAM, CloudWatch
Logs, S3, CloudFormation, Secrets Manager, and Systems Manager. This list only
describes competition support; verify the issued role's effective permissions
before choosing the deployment shape. Prefer one small EC2 instance or one ECS
task, Block Public Access on every S3 bucket, and narrowly scope ingress to the
needed HTTPS port and expected source ranges／load balancer. Do not expose the
application instance directly when an ingress load balancer is used.

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
3. Bedrock request starts remain serialized with at least 1.05 seconds between
   calls; keep exactly one worker and replica so this process-level limiter is
   effective.
4. Source selection to deterministic query and chart-ready `AnalysisResult`.
5. Project-scoped upstream Module Context retrieval.
6. Editable PPTX generation and download.
7. Editable DOCX report generation and download.
8. Live Assistant response with the exact three selected Source, Analysis, and
   Presentation references.
9. Local AgentCore `/invocations` smoke, if AgentCore is part of the submitted
   deployment.
10. Container root, `/health`, `/ready`, and `/v1/data-sources` all respond through
   the deployed HTTPS origin. `/health` is liveness; `/ready` checks only
   configuration presence, installed data, and writable storage.
11. Recreate the single container with the same `/data` volume and retrieve a
   previously stored analysis, PPTX, and DOCX.

Do not infer Bedrock authorization from `/ready`: the live Chart and Assistant
model calls in the event-day preflight are the permission and integration proof.
Do not scale past one worker or one replica while SQLite and local artifact
storage remain in use.

## Deadline discipline

Treat 2026-09-13 12:00 as the internal code and demo freeze. Use the final hour
for submission, artifact verification, and recovery only. The organizer submission
deadline and AWS environment shutdown are both 13:00, so no workflow may depend on
access after that time.
