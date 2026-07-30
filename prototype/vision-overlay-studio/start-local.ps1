$ErrorActionPreference = "Stop"
$StudioRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $StudioRoot)
$InferenceRoot = Join-Path $ProjectRoot "tools\yolo-sam2-overlay"
$Python = Join-Path $InferenceRoot ".venv\Scripts\python.exe"
$WebRoot = $StudioRoot

if (-not (Test-Path $Python)) {
    throw "YOLO/SAM2 environment is missing. Follow tools/yolo-sam2-overlay/README.md first."
}

$Backend = $null
try {
    $null = Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/health" -TimeoutSec 1
    Write-Host "Reusing the YOLO/SAM2 API already running on port 8000."
}
catch {
    $Backend = Start-Process `
        -FilePath $Python `
        -ArgumentList "-m", "uvicorn", "src.server:app", "--host", "127.0.0.1", "--port", "8000" `
        -WorkingDirectory $InferenceRoot `
        -WindowStyle Hidden `
        -PassThru
}

try {
    Push-Location $WebRoot
    Write-Host "YOLO/SAM2 API: http://127.0.0.1:8000"
    Write-Host "Overlay Studio will open at the Vite URL below. Press Ctrl+C to stop both servers."
    & npm.cmd run dev
}
finally {
    Pop-Location
    if ($Backend -and -not $Backend.HasExited) {
        Stop-Process -Id $Backend.Id
    }
}
