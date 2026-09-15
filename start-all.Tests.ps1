$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'start-all.ps1'
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $scriptPath,
    [ref]$tokens,
    [ref]$parseErrors
)
$parameterNames = @($ast.ParamBlock.Parameters | ForEach-Object {
    $_.Name.VariablePath.UserPath
})

Describe 'start-all.ps1 import contract' {
    It 'can be loaded without starting project processes' {
        ($parameterNames -contains 'NoRun') | Should Be $true
    }
}

if ($parameterNames -contains 'NoRun') {
    . $scriptPath -NoRun

    Describe 'project listener ownership checks' {
        It 'accepts this workspace backend listener' {
            $process = [pscustomobject]@{
                ProcessId = 101
                ExecutablePath = 'D:\Mia\agent_tryout\.venv-slice4a\Scripts\python.exe'
                CommandLine = 'python -m uvicorn app.main:app --port 8000'
            }

            Test-ProjectListenerProcess `
                -ProcessInfo $process `
                -Port 8000 `
                -WorkspaceRoot 'D:\Mia\agent_tryout' `
                -MobileRoot 'D:\Mia\agent_tryout\skin_care_agent\mobile' |
                Should Be $true
        }

        It 'accepts this workspace Expo listener' {
            $process = [pscustomobject]@{
                ProcessId = 102
                ExecutablePath = 'C:\Program Files\nodejs\node.exe'
                CommandLine = 'node D:\Mia\agent_tryout\skin_care_agent\mobile\node_modules\expo\bin\cli start --lan'
            }

            Test-ProjectListenerProcess `
                -ProcessInfo $process `
                -Port 8081 `
                -WorkspaceRoot 'D:\Mia\agent_tryout' `
                -MobileRoot 'D:\Mia\agent_tryout\skin_care_agent\mobile' |
                Should Be $true
        }

        It 'rejects an unrelated listener on a project port' {
            $process = [pscustomobject]@{
                ProcessId = 103
                ExecutablePath = 'C:\Python312\python.exe'
                CommandLine = 'python -m http.server 8000'
            }

            Test-ProjectListenerProcess `
                -ProcessInfo $process `
                -Port 8000 `
                -WorkspaceRoot 'D:\Mia\agent_tryout' `
                -MobileRoot 'D:\Mia\agent_tryout\skin_care_agent\mobile' |
                Should Be $false
        }
    }

    Describe 'ADB device state parsing' {
        It 'preserves offline state so another emulator is not started' {
            Get-EmulatorStateFromAdbDevices -Lines @(
                'List of devices attached',
                'emulator-5554          offline transport_id:1'
            ) | Should Be 'offline'
        }

        It 'reports a missing emulator separately' {
            Get-EmulatorStateFromAdbDevices -Lines @('List of devices attached') |
                Should Be 'missing'
        }

        It 'treats an empty first ADB response as a missing emulator' {
            Get-EmulatorStateFromAdbDevices -Lines @('') | Should Be 'missing'
        }
    }

    Describe 'readiness polling' {
        It 'tolerates transient probe errors and returns the successful value' {
            $state = @{ Attempts = 0 }

            $result = Wait-Condition `
                -Description 'test probe' `
                -TimeoutSeconds 2 `
                -PollIntervalMilliseconds 1 `
                -Probe {
                    $state.Attempts += 1
                    if ($state.Attempts -lt 3) {
                        throw 'temporarily unavailable'
                    }
                    return 'ready'
                }

            $result | Should Be 'ready'
            $state.Attempts | Should Be 3
        }
    }

    Describe 'process tree cleanup' {
        It 'treats an empty parent process list as no descendants' {
            $result = @(Get-ProcessDescendants -AllProcesses @() -ParentProcessIds @())

            $result.Count | Should Be 0
        }

        It 'recognizes a workspace Python worker as a project child' {
            $worker = [pscustomobject]@{
                ExecutablePath = 'D:\Mia\agent_tryout\.uv-python-slice4a\python.exe'
                CommandLine = 'python -c "from multiprocessing.spawn import spawn_main"'
            }

            Test-ProjectChildProcess `
                -ProcessInfo $worker `
                -WorkspaceRoot 'D:\Mia\agent_tryout' `
                -ProjectRoot 'D:\Mia\agent_tryout\skin_care_agent' |
                Should Be $true
        }
    }

    Describe 'ADB command execution' {
        It 'does not treat a successful stderr status message as a terminating error' {
            $result = Invoke-Adb `
                -AdbPath $env:ComSpec `
                -Arguments @('/d', '/s', '/c', 'echo daemon starting 1>&2 & echo ready & exit /b 0')

            $result.ExitCode | Should Be 0
            ($result.Output -join '') | Should Match 'ready'
        }
    }
}
