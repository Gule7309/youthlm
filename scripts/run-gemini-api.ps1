[CmdletBinding()]
param(
    [string]$ModelId = "gemini-3.1-flash-lite",

    [ValidateRange(10, 300)]
    [int]$RequestTimeoutSeconds = 45,

    [ValidateRange(1, 65535)]
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

if ([string]::IsNullOrWhiteSpace($env:GEMINI_API_KEY)) {
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

$env:GEMINI_REQUEST_TIMEOUT_SECONDS = $RequestTimeoutSeconds.ToString()
$env:GEMINI_THINKING_LEVEL = "low"

& "$PSScriptRoot\select-provider.ps1" gemini -ModelId $ModelId

Write-Host "YouthLM API: http://127.0.0.1:$Port"
Write-Host "OpenAPI docs: http://127.0.0.1:$Port/docs"
Write-Host "Contract: AnalysisRequest -> AnalysisResult (v0.1.0)"

Push-Location $repoRoot
try {
    uv run uvicorn main:app --app-dir apps/api --host 127.0.0.1 --port $Port
    if ($LASTEXITCODE -ne 0) {
        throw "YouthLM Gemini Contract v0 API failed."
    }
}
finally {
    Pop-Location
}
