param(
    [string]$Destination = "$PSScriptRoot\..\model_assets\face_landmarker.task"
)

$ErrorActionPreference = "Stop"
$url = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
$expectedSha256 = "64184E229B263107BC2B804C6625DB1341FF2BB731874B0BCC2FE6544E0BC9FF"
$destinationPath = [System.IO.Path]::GetFullPath($Destination)
$destinationDir = Split-Path -Parent $destinationPath
New-Item -ItemType Directory -Force -Path $destinationDir | Out-Null
Invoke-WebRequest -Uri $url -OutFile $destinationPath
$actualSha256 = (Get-FileHash $destinationPath -Algorithm SHA256).Hash
if ($actualSha256 -ne $expectedSha256) {
    Remove-Item -LiteralPath $destinationPath
    throw "Face Landmarker SHA256 mismatch: $actualSha256"
}
Write-Host "Downloaded Face Landmarker to $destinationPath"