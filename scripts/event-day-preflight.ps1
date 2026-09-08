[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AwsRegion,

    [Parameter(Mandatory = $true)]
    [string]$ModelId,

    [string]$AwsProfile = "youthlm-workshop",
    [string]$ExpectedAccountId,

    [ValidateRange(10, 300)]
    [int]$RequestTimeoutSeconds = 90,

    [ValidateRange(1, 65535)]
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"
Write-Host (
    "Final-round provider policy: use Amazon Bedrock or SageMaker AI; " +
    "Gemini fallback is not permitted."
)
Write-Host (
    "Organizer AWS window: 2026-09-12 08:00 through " +
    "2026-09-13 13:00 (Asia/Taipei)."
)
$preflightArgs = @{
    Provider = "bedrock"
    AwsRegion = $AwsRegion
    ModelId = $ModelId
    AwsProfile = $AwsProfile
    RequestTimeoutSeconds = $RequestTimeoutSeconds
    Port = $Port
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedAccountId)) {
    $preflightArgs["ExpectedAccountId"] = $ExpectedAccountId
}

& "$PSScriptRoot/run-demo-preflight.ps1" @preflightArgs
Write-Host "YouthLM Bedrock event-day preflight passed."
