param(
    [string]$AwsRegion = "us-west-2",
    [string]$StackName = "youthlm-competition",
    [string]$SourceVersion = "release/competition-2026-09-12",
    [string]$ImageTag = "competition",
    [string]$ClientCidr = ""
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$templatePath = Join-Path $repositoryRoot "infra\competition-ec2.yaml"

foreach ($name in @("AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN")) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) {
        throw "$name is required in this PowerShell process."
    }
}

if ([string]::IsNullOrWhiteSpace($ClientCidr)) {
    $publicIp = (Invoke-RestMethod -Uri "https://checkip.amazonaws.com" -TimeoutSec 15).Trim()
    $ClientCidr = "$publicIp/32"
}
if ($ClientCidr -notmatch '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/32$') {
    throw "ClientCidr must be one exact IPv4 /32 CIDR."
}

Write-Host "Validating the competition deployment template..."
aws cloudformation validate-template `
    --region $AwsRegion `
    --template-body "file://$templatePath" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "CloudFormation template validation failed."
}

Write-Host "Creating or updating the restricted YouthLM stack..."
aws cloudformation deploy `
    --region $AwsRegion `
    --stack-name $StackName `
    --template-file $templatePath `
    --capabilities CAPABILITY_IAM `
    --no-fail-on-empty-changeset `
    --parameter-overrides `
        "ClientCidr=$ClientCidr" `
        "SourceVersion=$SourceVersion" `
        "ImageTag=$ImageTag"
if ($LASTEXITCODE -ne 0) {
    throw "CloudFormation deployment failed."
}

$buildProject = aws cloudformation describe-stacks `
    --region $AwsRegion `
    --stack-name $StackName `
    --query "Stacks[0].Outputs[?OutputKey=='BuildProjectName'].OutputValue | [0]" `
    --output text
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($buildProject)) {
    throw "Could not resolve the CodeBuild project."
}

Write-Host "Building and publishing the private competition image..."
$buildId = aws codebuild start-build `
    --region $AwsRegion `
    --project-name $buildProject `
    --query "build.id" `
    --output text
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($buildId)) {
    throw "Could not start CodeBuild."
}

$terminalBuildStates = @("SUCCEEDED", "FAILED", "FAULT", "STOPPED", "TIMED_OUT")
do {
    Start-Sleep -Seconds 10
    $buildStatus = aws codebuild batch-get-builds `
        --region $AwsRegion `
        --ids $buildId `
        --query "builds[0].buildStatus" `
        --output text
    if ($LASTEXITCODE -ne 0) {
        throw "Could not read CodeBuild status."
    }
    Write-Host "CodeBuild: $buildStatus"
} while ($terminalBuildStates -notcontains $buildStatus)

if ($buildStatus -ne "SUCCEEDED") {
    throw "CodeBuild ended with status $buildStatus. Inspect build $buildId."
}

$applicationUrl = aws cloudformation describe-stacks `
    --region $AwsRegion `
    --stack-name $StackName `
    --query "Stacks[0].Outputs[?OutputKey=='ApplicationUrl'].OutputValue | [0]" `
    --output text
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($applicationUrl)) {
    throw "Could not resolve the application URL."
}

Write-Host "Waiting for the deployed API..."
$ready = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
    try {
        $response = Invoke-RestMethod -Uri "$applicationUrl/ready" -TimeoutSec 5
        if ($response.status -eq "ready") {
            $ready = $true
            break
        }
    }
    catch {
        Write-Host "Readiness attempt $attempt/60 is not ready yet."
    }
    Start-Sleep -Seconds 10
}
if (-not $ready) {
    throw "The deployed API did not become ready: $applicationUrl"
}

Write-Host "YouthLM is ready: $applicationUrl"

