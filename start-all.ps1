$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root 'skin_care_agent\backend'
$mobile = Join-Path $root 'skin_care_agent\mobile'
$python = Join-Path $root '.venv-slice4a\Scripts\python.exe'
$sdk = 'D:\Users\yumeifeng\AppData\Local\Android\Sdk'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$emulator = Join-Path $sdk 'emulator\emulator.exe'

if (!(Test-Path $python)) { throw "Python not found: $python" }
if (!(Test-Path $adb)) { throw "adb not found: $adb" }
if (!(Test-Path $emulator)) { throw "emulator not found: $emulator" }

function Start-Background($workingDirectory, $command, $logName) {
    $log = Join-Path $workingDirectory $logName
    Start-Process -FilePath 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
        -ArgumentList '-NoProfile', '-Command', "Set-Location -LiteralPath '$workingDirectory'; $command *> '$log'" `
        -WorkingDirectory $workingDirectory -WindowStyle Hidden | Out-Null
}

Write-Host 'Starting backend...'
Start-Background $backend "& '$python' -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000" 'backend-live.log'

Write-Host 'Starting Expo frontend...'
Start-Background $mobile 'npm.cmd run start -- --localhost' 'expo-live.log'

Write-Host 'Starting or reusing Pixel_8...'
& $adb start-server | Out-Null
$device = (& $adb devices | Select-String 'emulator-5554\s+device')
if (!$device) {
    Start-Process -FilePath $emulator -ArgumentList '-avd', 'Pixel_8', '-gpu', 'swiftshader_indirect', '-no-snapshot', '-no-boot-anim' -WindowStyle Hidden | Out-Null
}

for ($i = 0; $i -lt 45; $i++) {
    Start-Sleep -Seconds 2
    $boot = (& $adb -s emulator-5554 shell getprop sys.boot_completed 2>$null) -join ''
    if ($boot.Trim() -eq '1') { break }
    if ($i -eq 44) { throw 'Pixel_8 boot timeout' }
}

& $adb -s emulator-5554 reverse tcp:8000 tcp:8000 | Out-Null
& $adb -s emulator-5554 reverse tcp:8081 tcp:8081 | Out-Null
Start-Sleep -Seconds 5
& $adb -s emulator-5554 shell am start -a android.intent.action.VIEW -d 'exp://127.0.0.1:8081' | Out-Null

try {
    $health = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8000/health' -TimeoutSec 10
    if ($health.StatusCode -ne 200) { throw 'Backend health check failed' }
} catch {
    throw "Backend did not start: $($_.Exception.Message)"
}

Write-Host ''
Write-Host 'Startup complete:' -ForegroundColor Green
Write-Host 'Backend: http://localhost:8000'
Write-Host 'Frontend: http://localhost:8081'
Write-Host 'Emulator: Pixel_8 (emulator-5554)'
