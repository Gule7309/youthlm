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

## Before the environment opens

1. Keep daily development on Gemini and deterministic tests on fake providers.
2. Install and verify Git, `uv`, AWS CLI v2, Node.js, and frontend dependencies.
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

## Acceptance gates

Do not start deployment until all of these pass in the issued environment:

1. AWS identity and expected account match.
2. Bedrock Converse text and tool-call round trip.
3. Source selection to deterministic query and chart-ready `AnalysisResult`.
4. Project-scoped upstream Module Context retrieval.
5. Editable PPTX generation and download.
6. Editable DOCX report generation and download.
7. Local AgentCore `/invocations` smoke, if AgentCore is part of the submitted
   deployment.

## Deadline discipline

Treat 2026-09-13 12:00 as the internal code and demo freeze. Use the final hour
for submission, artifact verification, and recovery only. The organizer submission
deadline and AWS environment shutdown are both 13:00, so no workflow may depend on
access after that time.
