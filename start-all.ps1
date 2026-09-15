param(
    [switch]$NoRun
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend = Join-Path $root 'skin_care_agent\backend'
$mobile = Join-Path $root 'skin_care_agent\mobile'
$python = Join-Path $root '.venv-slice4a\Scripts\python.exe'
$sdk = 'D:\Users\yumeifeng\AppData\Local\Android\Sdk'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$emulator = Join-Path $sdk 'emulator\emulator.exe'
$backendLog = Join-Path $backend 'backend-live.log'
$expoLog = Join-Path $mobile 'expo-live.log'

function Wait-Condition {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)][string]$Description,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds,
        [int]$PollIntervalMilliseconds = 500,
        [Parameter(Mandatory = $true)][scriptblock]$Probe
    )

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $lastError = $null

    do {
        try {
            $value = & $Probe
            if ($null -ne $value -and $value -ne $false) {
                return $value
            }
        } catch {
            $lastError = $_.Exception.Message
        }

        Start-Sleep -Milliseconds $PollIntervalMilliseconds
    } while ([DateTime]::UtcNow -lt $deadline)

    $detail = if ($lastError) { " Last error: $lastError" } else { '' }
    throw "$Description timed out after $TimeoutSeconds seconds.$detail"
}

function Get-EmulatorStateFromAdbDevices {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [AllowEmptyString()]
        [string[]]$Lines
    )

    foreach ($line in $Lines) {
        if ($line -match '^\s*emulator-5554\s+(\S+)') {
            return $Matches[1]
        }
    }

    return 'missing'
}

function Test-PathInsideRoot {
    param(
        [AllowNull()][string]$Candidate,
        [Parameter(Mandatory = $true)][string]$ExpectedRoot
    )

    if ([string]::IsNullOrWhiteSpace($Candidate)) {
        return $false
    }

    try {
        $candidatePath = [IO.Path]::GetFullPath($Candidate).TrimEnd('\')
        $rootPath = [IO.Path]::GetFullPath($ExpectedRoot).TrimEnd('\')
        return $candidatePath.Equals($rootPath, [StringComparison]::OrdinalIgnoreCase) -or
            $candidatePath.StartsWith($rootPath + '\', [StringComparison]::OrdinalIgnoreCase)
    } catch {
        return $false
    }
}

function Test-ProjectListenerProcess {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]$ProcessInfo,
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$WorkspaceRoot,
        [Parameter(Mandatory = $true)][string]$MobileRoot
    )

    $commandLine = [string]$ProcessInfo.CommandLine
    $executablePath = [string]$ProcessInfo.ExecutablePath

    if ($Port -eq 8000) {
        $isWorkspacePython = Test-PathInsideRoot -Candidate $executablePath -ExpectedRoot $WorkspaceRoot
        $isBackendCommand = $commandLine -match '(?i)(?:^|\s)(?:-m\s+)?uvicorn(?:\.exe)?\s+app\.main:app(?:\s|$)'
        return $isWorkspacePython -and $isBackendCommand
    }

    if ($Port -eq 8081) {
        $escapedMobileRoot = [regex]::Escape([IO.Path]::GetFullPath($MobileRoot).TrimEnd('\'))
        $isMobileCommand = $commandLine -match "(?i)$escapedMobileRoot" -and
            $commandLine -match '(?i)expo' -and
            $commandLine -match '(?i)(?:^|\s)start(?:\s|$)'
        return $isMobileCommand
    }

    return $false
}

function Test-ProjectChildProcess {
    param(
        [Parameter(Mandatory = $true)]$ProcessInfo,
        [Parameter(Mandatory = $true)][string]$WorkspaceRoot,
        [Parameter(Mandatory = $true)][string]$ProjectRoot
    )

    $isWorkspaceExecutable = Test-PathInsideRoot `
        -Candidate ([string]$ProcessInfo.ExecutablePath) `
        -ExpectedRoot $WorkspaceRoot
    $escapedProjectRoot = [regex]::Escape([IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\'))
    $hasProjectCommand = [string]$ProcessInfo.CommandLine -match "(?i)$escapedProjectRoot"

    return $isWorkspaceExecutable -or $hasProjectCommand
}

function Get-ProcessDescendants {
    param(
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][object[]]$AllProcesses,
        [Parameter(Mandatory = $true)][AllowEmptyCollection()][int[]]$ParentProcessIds
    )

    $queue = @($ParentProcessIds)
    $seen = @{}
    $descendants = @()

    while ($queue.Count -gt 0) {
        $parentId = [int]$queue[0]
        if ($queue.Count -gt 1) {
            $queue = @($queue[1..($queue.Count - 1)])
        } else {
            $queue = @()
        }

        foreach ($child in @($AllProcesses | Where-Object { $_.ParentProcessId -eq $parentId })) {
            if (!$seen.ContainsKey([int]$child.ProcessId)) {
                $seen[[int]$child.ProcessId] = $true
                $descendants += $child
                $queue += [int]$child.ProcessId
            }
        }
    }

    return $descendants
}

function Stop-ProjectListeners {
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][int[]]$Ports)

    $allProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $targets = @()

    # Stop project launchers first. Uvicorn reload can otherwise respawn a
    # worker after its listening child is terminated.
    $launchers = @($allProcesses | Where-Object {
        ([string]$_.CommandLine -match '(?i)D:\\Mia\\agent_tryout\\skin_care_agent\\backend' -and
            [string]$_.CommandLine -match '(?i)uvicorn\s+app\.main:app') -or
        ([string]$_.CommandLine -match '(?i)D:\\Mia\\agent_tryout\\skin_care_agent\\mobile' -and
            [string]$_.CommandLine -match '(?i)expo.*start')
    })
    $targets += $launchers
    $targets += Get-ProcessDescendants -AllProcesses $allProcesses -ParentProcessIds @($launchers | Select-Object -ExpandProperty ProcessId)

    foreach ($port in $Ports) {
        $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
        $listenerPids = @($listeners | Select-Object -ExpandProperty OwningProcess -Unique)

        foreach ($listenerPid in $listenerPids) {
            $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId = $listenerPid" -ErrorAction SilentlyContinue
            if ($null -ne $processInfo -and !(Test-ProjectListenerProcess -ProcessInfo $processInfo -Port $port -WorkspaceRoot $root -MobileRoot $mobile)) {
                throw "Port $port is occupied by an unrelated process (PID $listenerPid): $($processInfo.CommandLine)"
            }

            if ($null -ne $processInfo) {
                Write-Host "Stopping existing project listener on port $port (PID $listenerPid)..."
                $targets += $processInfo
            }

            # A reload worker may retain the socket even when the listener PID
            # is already gone from the process table.
            $children = Get-ProcessDescendants -AllProcesses $allProcesses -ParentProcessIds @([int]$listenerPid)
            foreach ($child in $children) {
                if (Test-ProjectChildProcess -ProcessInfo $child -WorkspaceRoot $root -ProjectRoot (Join-Path $root 'skin_care_agent')) {
                    $targets += $child
                }
            }
        }

        $targets = @($targets | Sort-Object ProcessId -Unique)
        foreach ($target in $targets) {
            Stop-Process -Id $target.ProcessId -Force -ErrorAction SilentlyContinue
        }

        if ($listenerPids.Count -gt 0) {
            Wait-Condition -Description "port $port cleanup" -TimeoutSeconds 10 -Probe {
                $remaining = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
                return ($remaining.Count -eq 0)
            } | Out-Null
        }
    }
}

function Start-Background {
    param(
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Command,
        [Parameter(Mandatory = $true)][string]$LogPath
    )

    $escapedWorkingDirectory = $WorkingDirectory.Replace("'", "''")
    $escapedLogPath = $LogPath.Replace("'", "''")
    $backgroundCommand = "Set-Location -LiteralPath '$escapedWorkingDirectory'; $Command *> '$escapedLogPath'"

    return Start-Process -FilePath 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' `
        -ArgumentList '-NoProfile', '-Command', $backgroundCommand `
        -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru
}

function Invoke-Adb {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$AdbPath = $adb
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # adb writes normal daemon startup messages to stderr. Preserve its
        # numeric exit code instead of promoting that status text to an error.
        $ErrorActionPreference = 'Continue'
        $output = @(& $AdbPath @Arguments 2>$null)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = $output
    }
}

function Test-PixelEmulatorProcess {
    $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -match '(?i)^(emulator|qemu-system-.+)\.exe$' -and
        [string]$_.CommandLine -match '(?i)(?:^|\s)-avd\s+Pixel_8(?:\s|$)'
    })
    return ($processes.Count -gt 0)
}

function Assert-RequiredPaths {
    foreach ($requiredPath in @($backend, $mobile, $python, $adb, $emulator)) {
        if (!(Test-Path -LiteralPath $requiredPath)) {
            throw "Required path not found: $requiredPath"
        }
    }
}

function Start-Project {
    Assert-RequiredPaths

    Write-Host 'Cleaning old project listeners...'
    Stop-ProjectListeners -Ports 8000, 8081

    Write-Host 'Starting backend...'
    $backendCommand = "& '$($python.Replace("'", "''"))' -m uvicorn app.main:app --reload --reload-dir app --host 0.0.0.0 --port 8000"
    Start-Background -WorkingDirectory $backend -Command $backendCommand -LogPath $backendLog | Out-Null

    Write-Host 'Starting Expo frontend in LAN mode...'
    Start-Background -WorkingDirectory $mobile -Command 'npm.cmd run start -- --lan' -LogPath $expoLog | Out-Null

    Write-Host 'Waiting for backend and Metro...'
    Wait-Condition -Description 'backend health check' -TimeoutSeconds 45 -Probe {
        $response = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8000/health' -TimeoutSec 3
        return ($response.StatusCode -eq 200)
    } | Out-Null
    Wait-Condition -Description 'Metro readiness check' -TimeoutSeconds 120 -Probe {
        $response = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8081' -TimeoutSec 3
        return ($response.StatusCode -eq 200)
    } | Out-Null

    Write-Host 'Starting or reusing Pixel_8...'
    $adbStart = Invoke-Adb -Arguments @('start-server')
    if ($adbStart.ExitCode -ne 0) {
        throw 'Unable to start the ADB server.'
    }

    $deviceState = Get-EmulatorStateFromAdbDevices -Lines (Invoke-Adb -Arguments @('devices')).Output
    if ($deviceState -eq 'missing') {
        if (Test-PixelEmulatorProcess) {
            Write-Host 'Pixel_8 process exists; waiting for it to appear in ADB...'
        } else {
            Start-Process -FilePath $emulator `
                -ArgumentList '-avd', 'Pixel_8', '-gpu', 'swiftshader_indirect', '-no-snapshot', '-no-boot-anim' `
                -WindowStyle Hidden | Out-Null
        }
    } elseif ($deviceState -ne 'device') {
        Write-Host "Pixel_8 is currently $deviceState; waiting for ADB to recover..."
    }

    Wait-Condition -Description 'Pixel_8 boot' -TimeoutSeconds 150 -PollIntervalMilliseconds 1000 -Probe {
        $devices = Invoke-Adb -Arguments @('devices')
        if ($devices.ExitCode -ne 0) {
            return $false
        }

        $state = Get-EmulatorStateFromAdbDevices -Lines $devices.Output
        if ($state -ne 'device') {
            return $false
        }

        $boot = Invoke-Adb -Arguments @('-s', 'emulator-5554', 'shell', 'getprop', 'sys.boot_completed')
        return $boot.ExitCode -eq 0 -and (($boot.Output -join '').Trim() -eq '1')
    } | Out-Null

    foreach ($port in @(8000, 8081)) {
        $reverse = Invoke-Adb -Arguments @('-s', 'emulator-5554', 'reverse', "tcp:$port", "tcp:$port")
        if ($reverse.ExitCode -ne 0) {
            throw "ADB reverse failed for port $port."
        }
    }

    $openApp = Invoke-Adb -Arguments @(
        '-s', 'emulator-5554', 'shell', 'am', 'start',
        '-a', 'android.intent.action.VIEW',
        '-d', 'exp://127.0.0.1:8081'
    )
    if ($openApp.ExitCode -ne 0) {
        throw 'Unable to open the Expo app on Pixel_8.'
    }

    Write-Host ''
    Write-Host 'Startup complete:' -ForegroundColor Green
    Write-Host 'Backend: http://localhost:8000'
    Write-Host 'Frontend: http://localhost:8081'
    Write-Host 'Emulator: Pixel_8 (emulator-5554)'
    Write-Host "Backend log: $backendLog"
    Write-Host "Expo log: $expoLog"
}

if (!$NoRun) {
    Start-Project
}
