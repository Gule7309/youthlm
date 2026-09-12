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

    [string]$ImageTag = "youthlm:competition",

    [switch]$SkipQualityChecks,
    [switch]$AllowOrganizerRegionOverride
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$runSuffix = [guid]::NewGuid().ToString("N").Substring(0, 8)
$containerName = "youthlm-build-preflight-$runSuffix"
$volumeName = "youthlm-build-preflight-data-$runSuffix"
$containerStarted = $false
$volumeCreated = $false

function Require-NativeSuccess {
    param([string]$Message)

    if ($LASTEXITCODE -ne 0) {
        throw $Message
    }
}

function Require-Command {
    param([string]$Name)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was not found. Install it before the build preflight."
    }
}

function Start-PreflightContainer {
    $containerId = (& docker run -d `
        --name $containerName `
        --publish "127.0.0.1:${Port}:8000" `
        --mount "type=volume,source=$volumeName,target=/data" `
        --env "MODEL_PROVIDER=bedrock" `
        --env "AWS_REGION=$AwsRegion" `
        --env "BEDROCK_MODEL_ID=$ModelId" `
        $ImageTag | Out-String).Trim()
    Require-NativeSuccess "YouthLM preflight container did not start."
    if ([string]::IsNullOrWhiteSpace($containerId)) {
        throw "Docker did not return a container ID."
    }
    $script:containerStarted = $true
}

function Stop-PreflightContainer {
    if ($script:containerStarted) {
        & docker rm --force $containerName | Out-Null
        Require-NativeSuccess "Could not remove the YouthLM preflight container."
        $script:containerStarted = $false
    }
}

function Wait-ForContainerReady {
    $baseUrl = "http://127.0.0.1:$Port"
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $health = Invoke-RestMethod `
                -Method Get `
                -Uri "$baseUrl/health" `
                -TimeoutSec 2
            if ($health.status -eq "ok") {
                return $baseUrl
            }
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    }
    throw "YouthLM container did not become healthy within 60 seconds."
}

foreach ($command in @("git", "uv", "npm", "aws", "docker")) {
    Require-Command $command
}

& docker info | Out-Null
Require-NativeSuccess (
    "The Docker daemon is not available. Start Docker Desktop with Linux " +
    "containers and run the build preflight again."
)

$eventArgs = @{
    AwsProfile = $AwsProfile
    AwsRegion = $AwsRegion
    ModelId = $ModelId
    RequestTimeoutSeconds = $RequestTimeoutSeconds
    Port = $Port
}
if (-not [string]::IsNullOrWhiteSpace($ExpectedAccountId)) {
    $eventArgs["ExpectedAccountId"] = $ExpectedAccountId
}
if ($SkipQualityChecks) {
    $eventArgs["SkipQualityChecks"] = $true
}
if ($AllowOrganizerRegionOverride) {
    $eventArgs["AllowOrganizerRegionOverride"] = $true
}

Push-Location $repoRoot
try {
    & "$PSScriptRoot/event-day-preflight.ps1" @eventArgs

    & docker build --tag $ImageTag .
    Require-NativeSuccess "YouthLM competition image build failed."

    & docker volume create $volumeName | Out-Null
    Require-NativeSuccess "Could not create the isolated preflight data volume."
    $volumeCreated = $true

    Start-PreflightContainer
    $baseUrl = Wait-ForContainerReady

    $readiness = Invoke-RestMethod `
        -Method Get `
        -Uri "$baseUrl/ready" `
        -TimeoutSec 10
    if ($readiness.status -ne "ready") {
        throw "The built container did not pass /ready."
    }

    $catalog = Invoke-RestMethod `
        -Method Get `
        -Uri "$baseUrl/v1/data-sources" `
        -TimeoutSec 10
    $sourceIds = @($catalog.sources | ForEach-Object { $_.source_id })
    foreach ($requiredSourceId in @(
        "ntpc_population_by_age_sex_district",
        "ntpc_unemployment_by_age_sex"
    )) {
        if ($requiredSourceId -notin $sourceIds) {
            throw "The built container is missing a required public data source."
        }
    }

    & docker exec $containerName `
        /srv/youthlm/.venv/bin/python `
        -c "from pathlib import Path; Path('/data/build-preflight.marker').write_text('ok', encoding='utf-8')"
    Require-NativeSuccess "The container could not write to the persistent volume."

    Stop-PreflightContainer
    Start-PreflightContainer
    $baseUrl = Wait-ForContainerReady

    $marker = (& docker exec $containerName `
        /srv/youthlm/.venv/bin/python `
        -c "from pathlib import Path; print(Path('/data/build-preflight.marker').read_text(encoding='utf-8'))" |
        Out-String).Trim()
    Require-NativeSuccess "The recreated container could not read the persistent volume."
    if ($marker -ne "ok") {
        throw "The /data persistence marker did not survive container recreation."
    }

    Write-Host "YouthLM competition build preflight passed."
    Write-Host "Image ready for deployment: $ImageTag"
}
finally {
    Stop-PreflightContainer
    if ($volumeCreated) {
        & docker volume rm $volumeName | Out-Null
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Could not remove temporary Docker volume $volumeName."
        }
    }
    Pop-Location
}
