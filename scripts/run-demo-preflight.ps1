[CmdletBinding()]
param(
    [ValidateSet("gemini", "bedrock")]
    [string]$Provider = "gemini",

    [string]$ModelId,
    [string]$AwsRegion,
    [string]$AwsProfile = "youthlm-workshop",
    [string]$ExpectedAccountId,

    [ValidateRange(10, 300)]
    [int]$RequestTimeoutSeconds = 90,

    [ValidateRange(5, 120)]
    [int]$StartupTimeoutSeconds = 30,

    [ValidateRange(1, 65535)]
    [int]$Port = 8000,

    [switch]$SkipQualityChecks
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $repoRoot "apps\api"
$webRoot = Join-Path $repoRoot "apps\web"
$serverProcess = $null
$runRoot = $null

function Require-NativeSuccess {
    param([string]$Message)

    if ($LASTEXITCODE -ne 0) {
        throw $Message
    }
}

function Assert-PortAvailable {
    param([int]$PortNumber)

    $listener = [Net.Sockets.TcpListener]::new(
        [Net.IPAddress]::Loopback,
        $PortNumber
    )
    try {
        $listener.Start()
    }
    catch {
        throw (
            "Port $PortNumber is already in use. Stop the existing API or " +
            "choose another port with -Port."
        )
    }
    finally {
        $listener.Stop()
    }
}

function Import-GeminiKeyFromClipboard {
    if (-not [string]::IsNullOrWhiteSpace($env:GEMINI_API_KEY)) {
        return
    }

    $clipboardKey = Get-Clipboard -Raw
    if ($null -ne $clipboardKey) {
        $clipboardKey = $clipboardKey.Trim()
    }
    if ([string]::IsNullOrWhiteSpace($clipboardKey)) {
        throw (
            "GEMINI_API_KEY is not set. Copy the Gemini API key to the " +
            "clipboard, then run this script again."
        )
    }

    $env:GEMINI_API_KEY = $clipboardKey
    Remove-Variable clipboardKey
    Set-Clipboard -Value " "
    Write-Host "Gemini API key loaded into this PowerShell process."
}

if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
    throw "uv was not found. Install uv before running the demo preflight."
}

Push-Location $repoRoot
try {
    if (-not $SkipQualityChecks) {
        uv run --frozen python -m app.data_quality
        Require-NativeSuccess "Installed data audit failed. Demo preflight stopped."

        uv run --frozen pytest -q tests apps/api/tests
        Require-NativeSuccess "Unit tests failed. Demo preflight stopped."

        uv run --frozen ruff check .
        Require-NativeSuccess "Ruff failed. Demo preflight stopped."

        $npmExecutable = Get-Command npm.cmd -ErrorAction SilentlyContinue
        if ($null -eq $npmExecutable) {
            throw "npm was not found. Install Node.js before running the demo preflight."
        }
        Push-Location $webRoot
        try {
            & $npmExecutable.Source run check
            Require-NativeSuccess "Frontend checks failed. Demo preflight stopped."
        }
        finally {
            Pop-Location
        }
    }

    $selectionArgs = @{ Provider = $Provider }
    if ($Provider -eq "gemini") {
        Import-GeminiKeyFromClipboard
        if ([string]::IsNullOrWhiteSpace($ModelId)) {
            $ModelId = "gemini-3.1-flash-lite"
        }
        $env:GEMINI_REQUEST_TIMEOUT_SECONDS = $RequestTimeoutSeconds.ToString()
        $env:GEMINI_THINKING_LEVEL = "low"
        $selectionArgs["ModelId"] = $ModelId
    }
    else {
        $selectionArgs["ModelId"] = $ModelId
        $selectionArgs["AwsRegion"] = $AwsRegion
        $selectionArgs["AwsProfile"] = $AwsProfile
        if (-not [string]::IsNullOrWhiteSpace($ExpectedAccountId)) {
            $selectionArgs["ExpectedAccountId"] = $ExpectedAccountId
        }
    }
    . "$PSScriptRoot/select-provider.ps1" @selectionArgs

    Assert-PortAvailable $Port

    $runId = (
        (Get-Date -Format "yyyyMMdd-HHmmss") + "-" +
        [guid]::NewGuid().ToString("N").Substring(0, 8)
    )
    $runRoot = Join-Path $repoRoot "var\demo-preflight\$runId"
    $logRoot = Join-Path $runRoot "logs"
    $outputRoot = Join-Path $runRoot "output"
    New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

    $env:YOUTHLM_SQLITE_PATH = Join-Path $runRoot "youthlm.sqlite3"
    $env:YOUTHLM_ARTIFACT_DIR = Join-Path $runRoot "artifacts"
    $pythonPathEntries = @($repoRoot, $apiRoot)
    if (-not [string]::IsNullOrWhiteSpace($env:PYTHONPATH)) {
        $pythonPathEntries += $env:PYTHONPATH
    }
    $env:PYTHONPATH = $pythonPathEntries -join [IO.Path]::PathSeparator

    $pythonExecutable = (& uv run --frozen python -c "import sys; print(sys.executable)" |
        Out-String).Trim()
    Require-NativeSuccess "Could not resolve the YouthLM Python runtime."

    $stdoutLog = Join-Path $logRoot "api.stdout.log"
    $stderrLog = Join-Path $logRoot "api.stderr.log"
    $serverProcess = Start-Process `
        -FilePath $pythonExecutable `
        -ArgumentList @(
            "-m", "uvicorn", "main:app",
            "--host", "127.0.0.1",
            "--port", $Port.ToString()
        ) `
        -WorkingDirectory $apiRoot `
        -RedirectStandardOutput $stdoutLog `
        -RedirectStandardError $stderrLog `
        -PassThru

    $baseUrl = "http://127.0.0.1:$Port"
    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    $healthy = $false
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($serverProcess.HasExited) {
            throw "YouthLM API exited during startup. Review the saved API error log."
        }
        try {
            $health = Invoke-RestMethod `
                -Method Get `
                -Uri "$baseUrl/health" `
                -TimeoutSec 2
            if ($health.status -eq "ok") {
                $healthy = $true
                break
            }
        }
        catch {
            Start-Sleep -Milliseconds 250
        }
    }
    if (-not $healthy) {
        throw "YouthLM API did not become healthy within $StartupTimeoutSeconds seconds."
    }

    $readiness = Invoke-RestMethod `
        -Method Get `
        -Uri "$baseUrl/ready" `
        -TimeoutSec 10
    if ($readiness.status -ne "ready") {
        throw "YouthLM API readiness checks did not pass."
    }

    $catalog = Invoke-RestMethod `
        -Method Get `
        -Uri "$baseUrl/v1/data-sources" `
        -TimeoutSec 10
    $sourceIds = @($catalog.sources | ForEach-Object { $_.source_id })
    $requiredSourceIds = @(
        "ntpc_population_by_age_sex_district",
        "ntpc_unemployment_by_age_sex"
    )
    $missingSourceIds = @(
        $requiredSourceIds | Where-Object { $_ -notin $sourceIds }
    )
    if ($missingSourceIds.Count -gt 0) {
        throw "YouthLM shared source catalog is incomplete."
    }

    Write-Host "YouthLM API ready: $baseUrl"
    & $pythonExecutable -m spikes.demo_preflight `
        --base-url $baseUrl `
        --output-directory $outputRoot `
        --timeout-seconds $RequestTimeoutSeconds `
        --status-only
    Require-NativeSuccess "YouthLM end-to-end demo preflight failed."

    Write-Host "YouthLM $Provider demo is ready."
}
finally {
    if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
        Stop-Process -Id $serverProcess.Id
        Wait-Process -Id $serverProcess.Id -ErrorAction SilentlyContinue
        Write-Host "Temporary YouthLM API stopped."
    }
    if (-not [string]::IsNullOrWhiteSpace($runRoot)) {
        Write-Host "Demo artifacts and logs: $runRoot"
    }
    Pop-Location
}
