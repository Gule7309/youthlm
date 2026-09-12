[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("gemini", "bedrock")]
    [string]$Provider,

    [string]$ModelId,
    [string]$AwsRegion,
    [string]$AwsProfile,
    [string]$ExpectedAccountId,
    [switch]$UseEnvironmentCredentials
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

    Write-Host "YouthLM provider selected: gemini (configuration validated)."
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
if (
    $presentCredentialEnvironmentNames.Count -gt 0 -and
    $presentCredentialEnvironmentNames.Count -lt $credentialEnvironmentNames.Count
) {
    throw (
        "AWS credential environment variables are incomplete: " +
        ($presentCredentialEnvironmentNames -join ", ") +
        ". Set access key, secret key, and session token together."
    )
}
if (
    $UseEnvironmentCredentials -and
    $presentCredentialEnvironmentNames.Count -ne $credentialEnvironmentNames.Count
) {
    throw (
        "-UseEnvironmentCredentials requires AWS_ACCESS_KEY_ID, " +
        "AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN in this process."
    )
}
if (-not $UseEnvironmentCredentials -and $presentCredentialEnvironmentNames.Count -gt 0) {
    throw (
        "AWS credential environment variables would override the named profile. " +
        "Use -UseEnvironmentCredentials for organizer-issued STS credentials, " +
        "or remove all three variables before using a named profile."
    )
}
if (
    $UseEnvironmentCredentials -and
    -not [string]::IsNullOrWhiteSpace($env:AWS_PROFILE)
) {
    throw (
        "AWS_PROFILE cannot be combined with -UseEnvironmentCredentials. " +
        "Remove AWS_PROFILE from this PowerShell process first."
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

$identityArgs = @(
    "sts",
    "get-caller-identity",
    "--region", $resolvedRegion,
    "--query", "Account",
    "--output", "text"
)
if (-not $UseEnvironmentCredentials) {
    $resolvedProfile = $AwsProfile
    if ([string]::IsNullOrWhiteSpace($resolvedProfile)) {
        $resolvedProfile = $env:AWS_PROFILE
    }
    if ([string]::IsNullOrWhiteSpace($resolvedProfile)) {
        $resolvedProfile = "youthlm-workshop"
    }
    $identityArgs += @("--profile", $resolvedProfile)
}
$accountId = (& aws @identityArgs | Out-String).Trim()

if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($accountId)) {
    throw "AWS credential preflight failed. Refresh the issued credentials."
}

if (
    -not [string]::IsNullOrWhiteSpace($ExpectedAccountId) -and
    $accountId -ne $ExpectedAccountId
) {
    throw (
        "AWS account mismatch. Expected '$ExpectedAccountId' but credentials " +
        "resolved to '$accountId'."
    )
}

# Set the switch only after AWS identity validation succeeds.
$env:MODEL_PROVIDER = "bedrock"
if (-not $UseEnvironmentCredentials) {
    $env:AWS_PROFILE = $resolvedProfile
}
$env:AWS_REGION = $resolvedRegion
$env:AWS_DEFAULT_REGION = $resolvedRegion
$env:BEDROCK_MODEL_ID = $resolvedModelId

Write-Host "YouthLM provider selected: bedrock (identity and configuration validated)."
