# fetch_model.ps1
# Neural Core: Remote Model Synchronizer

$HF_MODEL_URL = "https://huggingface.co/Hypernova823/HandCamera/resolve/main/hand_camera.onnx"
$TARGET_DIR = "public/model"
$TARGET_FILE = "$TARGET_DIR/gesture_model.onnx"

Write-Host "[v5.5 Fetch] Syncing with Neural Core repository..." -ForegroundColor Cyan

# Create directory if missing
if (-not (Test-Path $TARGET_DIR)) {
    New-Item -ItemType Directory -Path $TARGET_DIR | Out-Null
}

# Download model
try {
    Write-Host "[v5.5 Fetch] Downloading: $HF_MODEL_URL" -ForegroundColor Gray
    Invoke-WebRequest -Uri $HF_MODEL_URL -OutFile $TARGET_FILE
    Write-Host "[v5.5 Fetch] Model synchronized successfully: $TARGET_FILE" -ForegroundColor Green
} catch {
    Write-Host "[v5.5 Fetch] CRITICAL ERROR: Could not sync model." -ForegroundColor Red
    Write-Error $_
}
