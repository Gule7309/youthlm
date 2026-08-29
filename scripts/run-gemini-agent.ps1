[CmdletBinding()]
param(
    [string]$ModelId = "gemini-3.1-flash-lite",

    [ValidateRange(10, 300)]
    [int]$RequestTimeoutSeconds = 45
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($env:GEMINI_API_KEY)) {
    $clipboardKey = (Get-Clipboard -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($clipboardKey)) {
        throw (
            "GEMINI_API_KEY is not set. Copy the Gemini API key to the " +
            "clipboard, then run this script again."
        )
    }

    $env:GEMINI_API_KEY = $clipboardKey
    Remove-Variable clipboardKey
    Set-Clipboard -Value ""
    Write-Host "Gemini API key loaded into this PowerShell process."
}

$env:GEMINI_REQUEST_TIMEOUT_SECONDS = $RequestTimeoutSeconds.ToString()
$env:GEMINI_THINKING_LEVEL = "low"

& "$PSScriptRoot\select-provider.ps1" gemini -ModelId $ModelId
if ($LASTEXITCODE -ne 0) {
    throw "Gemini provider selection failed."
}

uv run python -m spikes.agent_smoke
if ($LASTEXITCODE -ne 0) {
    throw "YouthLM Gemini agent smoke failed."
}
