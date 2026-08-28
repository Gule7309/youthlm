[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AwsRegion,

    [Parameter(Mandatory = $true)]
    [string]$ModelId,

    [string]$AwsProfile = "youthlm-workshop",
    [string]$ExpectedAccountId
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repoRoot
try {
    uv run pytest -q
    if ($LASTEXITCODE -ne 0) {
        throw "Unit tests failed. Bedrock was not selected."
    }

    uv run ruff check .
    if ($LASTEXITCODE -ne 0) {
        throw "Ruff failed. Bedrock was not selected."
    }

    $selectionArgs = @{
        Provider = "bedrock"
        AwsRegion = $AwsRegion
        ModelId = $ModelId
        AwsProfile = $AwsProfile
    }
    if (-not [string]::IsNullOrWhiteSpace($ExpectedAccountId)) {
        $selectionArgs["ExpectedAccountId"] = $ExpectedAccountId
    }

    . "$PSScriptRoot/select-provider.ps1" @selectionArgs

    uv run python spikes/provider_smoke.py
    if ($LASTEXITCODE -ne 0) {
        throw "The real Bedrock provider smoke test failed."
    }

    Write-Host "YouthLM Bedrock event-day preflight passed."
}
finally {
    Pop-Location
}
