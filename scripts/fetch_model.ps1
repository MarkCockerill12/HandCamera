# Placeholder script to download the ONNX model from Hugging Face
# Usage: ./fetch_model.ps1

$HF_MODEL_URL = "https://huggingface.co/YOUR_USERNAME/YOUR_REPO/resolve/main/gesture_model.onnx"
$DESTINATION = "../public/model/gesture_model.onnx"

Write-Host "Downloading model from $HF_MODEL_URL..." -ForegroundColor Cyan

try {
    if (-not (Test-Path "../public/model")) {
        New-Item -ItemType Directory -Path "../public/model" -Force
    }
    
    Invoke-WebRequest -Uri $HF_MODEL_URL -OutFile $DESTINATION
    Write-Host "Success! Model saved to $DESTINATION" -ForegroundColor Green
} catch {
    Write-Host "Failed to download model. Please check the URL and your internet connection." -ForegroundColor Red
    Write-Host $_.Exception.Message
}
