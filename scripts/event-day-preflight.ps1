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
    [int]$Port = 8000,

    [switch]$SkipQualityChecks,
    [switch]$AllowOrganizerRegionOverride
)

$ErrorActionPreference = "Stop"
$competitionRegions = @("us-east-1", "us-west-2")
if ($AwsRegion -notin $competitionRegions) {
    if (-not $AllowOrganizerRegionOverride) {
        throw (
            "Competition deployment region must be us-east-1 or us-west-2. " +
            "Use -AllowOrganizerRegionOverride only if event staff explicitly " +
            "announces a replacement region."
        )
    }
    Write-Warning (
        "Using an organizer-announced region override. Preserve the event " +
        "announcement with the acceptance record."
    )
}
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI v2 was not found. Install it before the event-day preflight."
}
Write-Host (
    "Final-round provider policy: use Amazon Bedrock or SageMaker AI; " +
    "Gemini fallback is not permitted."
)
Write-Host (
    "Organizer AWS window: 2026-09-12 08:00 through " +
    "2026-09-13 13:00 (Asia/Taipei)."
)
Write-Host "Bedrock calls are serialized at 1.05-second minimum intervals."
$preflightArgs = @{
    Provider = "bedrock"
    AwsRegion = $AwsRegion
    ModelId = $ModelId
    AwsProfile = $AwsProfile
    RequestTimeoutSeconds = $RequestTimeoutSeconds
    Port = $Port
}
if ($SkipQualityChecks) {
    $preflightArgs["SkipQualityChecks"] = $true
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedAccountId)) {
    $preflightArgs["ExpectedAccountId"] = $ExpectedAccountId
}

& "$PSScriptRoot/run-demo-preflight.ps1" @preflightArgs
Write-Host "YouthLM Bedrock event-day preflight passed."
