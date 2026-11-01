. (Join-Path $PSScriptRoot 'runtime-common.ps1')
$statePath = Join-Path $script:LocalRoot 'frontend-runtime.json'
if (Test-Path -LiteralPath $statePath) {
    $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($state.projectRoot -ne $script:ProjectRoot -or $state.port -ne 5173) { throw 'Refusing frontend state that does not belong to this project on 5173.' }
    $process = Get-Process -Id $state.processId -ErrorAction SilentlyContinue
    if ($process) {
        if ($process.ProcessName -ne 'node' -or -not (Test-RecordedProcessStart $process $state.startedAt) -or $process.Path -ne $state.nodePath) { throw 'Recorded frontend PID was reused; it was not stopped.' }
        Stop-Process -Id $process.Id
        Write-Host "Stopped project frontend PID $($process.Id)."
    }
}
& (Join-Path $PSScriptRoot 'stop-backend.ps1')
& (Join-Path $PSScriptRoot 'stop-database.ps1')
Write-Host 'Project stack stopped. Database files are preserved; port 5174 was not touched.'
