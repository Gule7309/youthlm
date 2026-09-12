# YouthLM Demo Readiness v0

YouthLM has one executable acceptance path for the complete backend demo. It proves
that the selected model provider, HTTP boundary, deterministic data tools, stored
module context, editable Presentation Artifact, and editable Report Artifact work
together.

The preflight does not modify Contract v0 and does not inspect or store frontend
canvas state.

## Interactive full-stack demo

For the browser demo, copy a fresh Gemini API key to the Windows clipboard and
run this command from the repository root:

```powershell
.\scripts\run-local-demo.ps1
```

The runner deliberately replaces any stale `GEMINI_API_KEY` in the current
PowerShell process with the clipboard value, clears the clipboard, and checks
that `gemini-3.1-flash-lite` exists and supports `generateContent`. It then runs
the backend and frontend quality gates, starts the API on port `8000`, starts
Vite on port `5173`, waits for both services, and opens the browser. Press Enter
in the runner's PowerShell window to stop both processes cleanly.

Each session receives isolated SQLite, artifact, and log paths under
`var/demo-session/`. To restart after closing PowerShell, copy the key again and
run the same command. For a quick restart after the full checks have already
passed:

```powershell
.\scripts\run-local-demo.ps1 -SkipQualityChecks
```

Use `-UseExistingGeminiKey` only when the key in the same PowerShell process was
already verified and has not been revoked. The safe default is always a freshly
copied key. Use `-NoBrowser` when the browser should not open automatically.

Before presenting, use meaningful artifact inputs rather than single-letter test
values:

- Chart name: `新北市25–29歲男性失業率趨勢`
- Analysis request: `比較2022至2024年的變化，指出趨勢，且不要超出資料範圍。`
- Presentation name: `青年失業率政策簡報`
- Presentation instructions: `整理成政策會議用簡報，保留資料限制、來源與警告。`
- Report name: `青年失業率議題研析報告`
- Report instructions: `以政策研析格式整理，保留資料限制、來源與版本。`

Downloading the PPTX and DOCX proves both HTTP artifact paths. Open each file and
confirm that the summary, table, source, warnings, and editable elements are
present before treating the artifact gate as complete.

## Daily development with Gemini

Copy a valid Gemini API key to the Windows clipboard, open PowerShell in the
repository root, and run:

```powershell
.\scripts\run-demo-preflight.ps1
```

The key is loaded only into that PowerShell process and the clipboard is replaced
with one blank character. The script never prints the key.

The default model is `gemini-3.1-flash-lite`. To use another port or timeout:

```powershell
.\scripts\run-demo-preflight.ps1 `
    -Port 8010 `
    -RequestTimeoutSeconds 120
```

## What the command proves

The command stops at the first failure and checks:

1. installed dataset hashes, schemas, coverage, and reconciliation rules;
2. all root and API Python tests, Ruff, frontend typecheck, production build,
   and frontend tests;
3. explicit Gemini or Bedrock provider selection;
4. a temporary live FastAPI process, `/health`, status-only `/ready`, and the
   required two-source catalog;
5. Source selection to deterministic query and chart-ready `AnalysisResult`;
6. project-scoped retrieval of the stored result by an upstream module;
7. Presentation generation from that exact stored module;
8. PPTX download, file size, SHA-256, and package signature;
9. Report generation from the same stored module;
10. DOCX download, file size, SHA-256, and package signature;
11. a live Assistant answer that resolves the exact selected Source, Analysis,
    and Presentation references.

The temporary API always stops in a `finally` block. Every run uses a unique
directory under `var/demo-preflight/` for SQLite, generated artifacts, logs, and
the downloaded deck. These paths are gitignored and are kept for debugging and
demo review.

## Activity-day switch to Bedrock

The organizer environment opens on 2026-09-12 at 08:00 and closes on 2026-09-13
at 13:00 (Asia/Taipei). After fresh organizer credentials have been saved to
`youthlm-workshop`, run one command:

```powershell
.\scripts\event-day-preflight.ps1 `
    -AwsProfile "youthlm-workshop" `
    -AwsRegion "<event-region>" `
    -ModelId "<event-model-id>" `
    -ExpectedAccountId "<event-account-id>"
```

This uses the same full demo acceptance path with `MODEL_PROVIDER=bedrock`. It
checks AWS identity before starting the API and fails visibly if credentials,
region, account, model access, Agent tool calling, or artifact generation is not
ready. There is no automatic fallback.

The published competition rules require deployment in `us-east-1` or
`us-west-2` and Bedrock traffic below one request per second. The event-day
wrapper enforces the region allowlist and the runtime serializes Bedrock calls
with a 1.05-second minimum interval. Use the region override only after an
explicit event-staff announcement, and keep one worker／replica so the
process-local request limiter remains effective.

The final-round rules do not allow Gemini as a substitute. If Bedrock is
unavailable, keep the failure visible and repair the issued credentials, region,
model access, or request path. The complete non-secret event sequence is in
[`final-environment-runbook.md`](final-environment-runbook.md).

## Reading the result

Success ends with:

```text
YouthLM end-to-end demo preflight passed.
YouthLM <provider> demo is ready.
Temporary YouthLM API stopped.
```

The reported run directory contains the editable `.pptx`, editable `.docx`, and
server logs. A failure leaves the same run directory in place so the exact API
error can be reviewed without rerunning the demo blindly. Artifact keys are
opaque 128-bit hash prefixes so both final and temporary paths remain below the
common Windows 260-character limit even when the repository is inside OneDrive.
