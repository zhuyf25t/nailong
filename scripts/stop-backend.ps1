. (Join-Path $PSScriptRoot 'runtime-common.ps1')
$statePath = Join-Path $script:LocalRoot 'backend-runtime.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Host 'No project backend PID is recorded.'; exit 0 }
$state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($state.projectRoot -ne $script:ProjectRoot) { throw 'Refusing a backend state file belonging to a different project.' }
$process = Get-Process -Id $state.processId -ErrorAction SilentlyContinue
if (-not $process) { Write-Host 'Project backend is already stopped.'; exit 0 }
if ($process.ProcessName -ne 'java' -or -not (Test-RecordedProcessStart $process $state.startedAt) -or $process.Path -ne $state.javaPath) {
    throw 'Recorded PID no longer identifies the original project Java process; refusing to stop it.'
}
Stop-Process -Id $process.Id
Write-Host "Stopped project backend PID $($process.Id)."
