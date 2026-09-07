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
