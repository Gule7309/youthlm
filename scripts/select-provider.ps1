[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("gemini", "bedrock")]
    [string]$Provider,

    [string]$ModelId,
    [string]$AwsRegion,
    [string]$AwsProfile,
    [string]$ExpectedAccountId
)

$ErrorActionPreference = "Stop"

function Require-Value {
    param(
        [string]$Name,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        throw "Missing required value: $Name"
    }

    return $Value
}

if ($Provider -eq "gemini") {
    $apiKey = Require-Value "GEMINI_API_KEY" $env:GEMINI_API_KEY
    $resolvedModelId = $ModelId
    if ([string]::IsNullOrWhiteSpace($resolvedModelId)) {
        $resolvedModelId = $env:GEMINI_MODEL_ID
    }
    $resolvedModelId = Require-Value "Gemini ModelId" $resolvedModelId

    $env:MODEL_PROVIDER = "gemini"
    $env:GEMINI_API_KEY = $apiKey
    $env:GEMINI_MODEL_ID = $resolvedModelId

    Write-Host "YouthLM provider selected: gemini ($resolvedModelId)"
    return
}

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "AWS CLI was not found. Install AWS CLI v2 before selecting Bedrock."
}

$credentialEnvironmentNames = @(
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN"
)
$presentCredentialEnvironmentNames = @(
    $credentialEnvironmentNames | Where-Object {
        -not [string]::IsNullOrWhiteSpace(
            [Environment]::GetEnvironmentVariable($_, "Process")
        )
    }
)
if ($presentCredentialEnvironmentNames.Count -gt 0) {
    throw (
        "AWS credential environment variables would override the named profile: " +
        ($presentCredentialEnvironmentNames -join ", ") +
        ". Open a clean PowerShell or remove these variables first."
    )
}

$resolvedRegion = $AwsRegion
if ([string]::IsNullOrWhiteSpace($resolvedRegion)) {
    $resolvedRegion = $env:AWS_REGION
}
$resolvedRegion = Require-Value "AWS region" $resolvedRegion

$resolvedModelId = $ModelId
if ([string]::IsNullOrWhiteSpace($resolvedModelId)) {
    $resolvedModelId = $env:BEDROCK_MODEL_ID
}
$resolvedModelId = Require-Value "Bedrock ModelId" $resolvedModelId

$resolvedProfile = $AwsProfile
if ([string]::IsNullOrWhiteSpace($resolvedProfile)) {
    $resolvedProfile = $env:AWS_PROFILE
}
if ([string]::IsNullOrWhiteSpace($resolvedProfile)) {
    $resolvedProfile = "youthlm-workshop"
}

$identityArgs = @(
    "sts",
    "get-caller-identity",
    "--profile", $resolvedProfile,
    "--region", $resolvedRegion,
    "--query", "Account",
    "--output", "text"
)
$accountId = (& aws @identityArgs | Out-String).Trim()

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($accountId)) {
    throw "AWS credential preflight failed for profile '$resolvedProfile'."
}

if (
    -not [string]::IsNullOrWhiteSpace($ExpectedAccountId) -and
    $accountId -ne $ExpectedAccountId
) {
    throw (
        "AWS account mismatch. Expected '$ExpectedAccountId' but profile " +
        "'$resolvedProfile' resolved to '$accountId'."
    )
}

# Set the switch only after AWS identity validation succeeds.
$env:MODEL_PROVIDER = "bedrock"
$env:AWS_PROFILE = $resolvedProfile
$env:AWS_REGION = $resolvedRegion
$env:AWS_DEFAULT_REGION = $resolvedRegion
$env:BEDROCK_MODEL_ID = $resolvedModelId

Write-Host (
    "YouthLM provider selected: bedrock " +
    "(account=$accountId, profile=$resolvedProfile, region=$resolvedRegion, " +
    "model=$resolvedModelId)"
)
