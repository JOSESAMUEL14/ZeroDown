
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet("blue", "green")]
    [string]$Target
)

$Previous = minikube kubectl -- get service zerodown-service -o jsonpath='{.spec.selector.version}'
$Previous = "$Previous".Trim()

if ($Previous -notin @("blue", "green")) {
    Write-Host "Cannot identify current deployment."
    exit 1
}

$ServiceFile = if ($Target -eq "green") {
    "k8s/service-green.yaml"
} else {
    "k8s/service.yaml"
}

Write-Host "Current version: $Previous"
Write-Host "Checking $Target deployment..."

$Ready = minikube kubectl -- get deployment "zerodown-$Target" -o jsonpath='{.status.readyReplicas}'
$Ready = "$Ready".Trim()

if ($Ready -ne "2") {
    Write-Host "Target deployment is not healthy. Aborting."
    exit 1
}

Write-Host "Switching traffic..."

minikube kubectl -- apply -f $ServiceFile

if ($LASTEXITCODE -ne 0) {
    exit 1
}

$PortForward = $null

try {
    Write-Host "Starting port-forward..."

    $PortForward = Start-Process -FilePath "minikube.exe" `
        -ArgumentList "kubectl -- port-forward service/zerodown-service 18083:80" `
        -PassThru -WindowStyle Hidden

    $Verified = $false
    $Expected = if ($Target -eq "blue") { "v1" } else { "v2" }

    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1

        try {
            $Response = Invoke-RestMethod "http://127.0.0.1:18083/version" -TimeoutSec 2

            if ($Response.version -eq $Expected) {
                $Verified = $true
                break
            }
        }
        catch {
            # Retry until port-forward is ready.
        }
    }

    if (-not $Verified) {
        throw "Application version verification failed."
    }

    Write-Host "Deployment successful: $Target ($Expected)"
}
catch {
    Write-Host "Verification failed: $($_.Exception.Message)"
    Write-Host "Rolling back to $Previous..."

    $RollbackFile = if ($Previous -eq "green") {
        "k8s/service-green.yaml"
    } else {
        "k8s/service.yaml"
    }

    minikube kubectl -- apply -f $RollbackFile
    exit 1
}
finally {
    if ($null -ne $PortForward) {
        taskkill.exe /PID $PortForward.Id /T /F 2>$null | Out-Null
    }
}
