[CmdletBinding()]
param(
    [string]$ModelId = "gemini-3.1-flash-lite",

    [ValidateRange(10, 300)]
    [int]$RequestTimeoutSeconds = 90,

    [ValidateRange(5, 120)]
    [int]$StartupTimeoutSeconds = 45,

    [switch]$SkipQualityChecks,
    [switch]$UseExistingGeminiKey,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$apiRoot = Join-Path $repoRoot "apps\api"
$webRoot = Join-Path $repoRoot "apps\web"
$apiPort = 8000
$webPort = 5173
$apiProcess = $null
$webProcess = $null
$runRoot = $null

function Require-NativeSuccess {
    param([string]$Message)

    if ($LASTEXITCODE -ne 0) {
        throw $Message
    }
}

function Require-Command {
    param([string]$Name)

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        throw "Required command '$Name' was not found."
    }

    return $command.Source
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
            "Port $PortNumber is already in use. Stop the existing YouthLM " +
            "process before starting a new demo session."
        )
    }
    finally {
        $listener.Stop()
    }
}

function Import-FreshGeminiKey {
    if (
        $UseExistingGeminiKey -and
        -not [string]::IsNullOrWhiteSpace($env:GEMINI_API_KEY)
    ) {
        Write-Host "Using GEMINI_API_KEY already loaded in this PowerShell process."
        return
    }

    Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
    $clipboardKey = Get-Clipboard -Raw
    if ($null -ne $clipboardKey) {
        $clipboardKey = $clipboardKey.Trim()
    }
    if ([string]::IsNullOrWhiteSpace($clipboardKey)) {
        throw (
            "Copy a fresh Gemini API key to the clipboard, then run this " +
            "script again."
        )
    }

    $env:GEMINI_API_KEY = $clipboardKey
    Remove-Variable clipboardKey
    Set-Clipboard -Value " "
    Write-Host "Fresh Gemini API key loaded into this PowerShell process."
}

function Assert-GeminiModelAccess {
    param([string]$RequestedModelId)

    $modelUri = (
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        $RequestedModelId
    )
    try {
        $model = Invoke-RestMethod `
            -Method Get `
            -Uri $modelUri `
            -Headers @{ "x-goog-api-key" = $env:GEMINI_API_KEY } `
            -TimeoutSec 20
    }
    catch {
        throw (
            "Gemini API key/model preflight failed for '$RequestedModelId'. " +
            "Copy a newly issued key and run the script again."
        )
    }

    if ($model.supportedGenerationMethods -notcontains "generateContent") {
        throw "Gemini model '$RequestedModelId' does not support generateContent."
    }

    Write-Host "Gemini API key and model preflight passed: $RequestedModelId"
}

function Wait-HttpReady {
    param(
        [string]$Name,
        [string]$Uri,
        [System.Diagnostics.Process]$Process,
        [string]$ErrorLog
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        if ($Process.HasExited) {
            $stderr = Get-Content $ErrorLog -Raw -ErrorAction SilentlyContinue
            throw "$Name exited during startup. $stderr"
        }

        try {
            $response = Invoke-WebRequest `
                -Method Get `
                -Uri $Uri `
                -UseBasicParsing `
                -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                return
            }
        }
        catch {
            Start-Sleep -Milliseconds 250
        }
    }

    throw "$Name did not become ready within $StartupTimeoutSeconds seconds."
}

function Stop-DemoProcess {
    param(
        [System.Diagnostics.Process]$Process,
        [string]$Name
    )

    if ($null -eq $Process -or $Process.HasExited) {
        return
    }

    if ($env:OS -eq "Windows_NT" -and (Get-Command taskkill -ErrorAction SilentlyContinue)) {
        & taskkill /PID $Process.Id /T /F | Out-Null
    }
    else {
        Stop-Process -Id $Process.Id
    }
    Write-Host "$Name stopped."
}

$gitExecutable = Require-Command "git"
$null = Require-Command "uv"
$nodeExecutable = Require-Command "node"
$npmExecutable = Require-Command "npm.cmd"

Push-Location $repoRoot
try {
    & $gitExecutable rev-parse --is-inside-work-tree | Out-Null
    Require-NativeSuccess "Run this command from the YouthLM Git repository."

    Import-FreshGeminiKey
    Assert-GeminiModelAccess $ModelId

    if (-not (Test-Path (Join-Path $webRoot "node_modules"))) {
        Push-Location $webRoot
        try {
            & $npmExecutable ci
            Require-NativeSuccess "Frontend dependency installation failed."
        }
        finally {
            Pop-Location
        }
    }

    if (-not $SkipQualityChecks) {
        uv run pytest -q
        Require-NativeSuccess "Python tests failed. Demo startup stopped."

        uv run ruff check .
        Require-NativeSuccess "Ruff failed. Demo startup stopped."

        Push-Location $webRoot
        try {
            & $npmExecutable run check
            Require-NativeSuccess "Frontend checks failed. Demo startup stopped."
        }
        finally {
            Pop-Location
        }
    }

    $env:GEMINI_REQUEST_TIMEOUT_SECONDS = $RequestTimeoutSeconds.ToString()
    $env:GEMINI_THINKING_LEVEL = "low"
    . "$PSScriptRoot/select-provider.ps1" gemini -ModelId $ModelId

    Assert-PortAvailable $apiPort
    Assert-PortAvailable $webPort

    $runId = (
        (Get-Date -Format "yyyyMMdd-HHmmss") + "-" +
        [guid]::NewGuid().ToString("N").Substring(0, 8)
    )
    $runRoot = Join-Path $repoRoot "var\demo-session\$runId"
    $logRoot = Join-Path $runRoot "logs"
    New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

    $env:YOUTHLM_SQLITE_PATH = Join-Path $runRoot "youthlm.sqlite3"
    $env:YOUTHLM_ARTIFACT_DIR = Join-Path $runRoot "artifacts"
    $env:VITE_YOUTHLM_API_BASE_URL = ""
    $pythonPathEntries = @($repoRoot, $apiRoot)
    if (-not [string]::IsNullOrWhiteSpace($env:PYTHONPATH)) {
        $pythonPathEntries += $env:PYTHONPATH
    }
    $env:PYTHONPATH = $pythonPathEntries -join [IO.Path]::PathSeparator

    $pythonExecutable = (& uv run python -c "import sys; print(sys.executable)" |
        Out-String).Trim()
    Require-NativeSuccess "Could not resolve the YouthLM Python runtime."

    $apiStdout = Join-Path $logRoot "api.stdout.log"
    $apiStderr = Join-Path $logRoot "api.stderr.log"
    $apiProcess = Start-Process `
        -FilePath $pythonExecutable `
        -ArgumentList @(
            "-m", "uvicorn", "main:app",
            "--host", "127.0.0.1",
            "--port", $apiPort.ToString()
        ) `
        -WorkingDirectory $apiRoot `
        -RedirectStandardOutput $apiStdout `
        -RedirectStandardError $apiStderr `
        -PassThru

    $webStdout = Join-Path $logRoot "web.stdout.log"
    $webStderr = Join-Path $logRoot "web.stderr.log"
    $viteCli = Join-Path $webRoot "node_modules\vite\bin\vite.js"
    if (-not (Test-Path $viteCli)) {
        throw "Vite CLI was not found after frontend dependency installation."
    }
    $webProcess = Start-Process `
        -FilePath $nodeExecutable `
        -ArgumentList @(
            $viteCli,
            "--host", "127.0.0.1",
            "--port", $webPort.ToString(),
            "--strictPort"
        ) `
        -WorkingDirectory $webRoot `
        -RedirectStandardOutput $webStdout `
        -RedirectStandardError $webStderr `
        -PassThru

    $apiUrl = "http://127.0.0.1:$apiPort"
    $webUrl = "http://127.0.0.1:$webPort"
    Wait-HttpReady "YouthLM API" "$apiUrl/health" $apiProcess $apiStderr
    Wait-HttpReady "YouthLM web" $webUrl $webProcess $webStderr

    Write-Host "YouthLM full-stack demo is ready."
    Write-Host "Web: $webUrl"
    Write-Host "API docs: $apiUrl/docs"
    Write-Host "Session logs and artifacts: $runRoot"
    Write-Host "Press Ctrl+C once to stop both servers."

    if (-not $NoBrowser) {
        Start-Process $webUrl
    }

    while ($true) {
        if ($apiProcess.HasExited) {
            throw "YouthLM API stopped unexpectedly. See $apiStderr"
        }
        if ($webProcess.HasExited) {
            throw "YouthLM web stopped unexpectedly. See $webStderr"
        }
        Start-Sleep -Seconds 1
    }
}
finally {
    Stop-DemoProcess $webProcess "YouthLM web"
    Stop-DemoProcess $apiProcess "YouthLM API"
    if (-not [string]::IsNullOrWhiteSpace($runRoot)) {
        Write-Host "Session logs and artifacts: $runRoot"
    }
    Pop-Location
}
