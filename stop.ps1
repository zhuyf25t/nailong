$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot '.night-runtime'
$stopFile = Join-Path $runtime 'server.stop'
$pidFile = Join-Path $runtime 'launcher.pid'

function Test-SodaRunning {
    try {
        $health = Invoke-RestMethod 'http://127.0.0.1:8738/health' -TimeoutSec 2
        return $health.game -eq 'nightshift'
    } catch { return $false }
}

if (Test-SodaRunning) {
    if (-not (Test-Path -LiteralPath $pidFile)) { throw 'This server was started outside play.ps1. Stop it in its own terminal first.' }
    $launcherId = [int]([IO.File]::ReadAllText($pidFile))
    if (-not (Get-Process -Id $launcherId -ErrorAction SilentlyContinue)) { throw 'The launcher that owns this server is no longer running.' }
    [IO.File]::WriteAllText($stopFile, '')
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    while (Test-SodaRunning) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'The server has not finished shutting down.' }
        Start-Sleep -Milliseconds 250
    }
}
& (Join-Path $PSScriptRoot 'backend/stop-db.ps1')
Write-Host 'Night Shift is stopped. Completed nights are saved.'
