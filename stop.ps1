$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot '.night-runtime'
function Test-SodaRunning([int]$port) {
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 2
        return $health.game -eq 'nightshift'
    } catch { return $false }
}

function Stop-LocalShift([int]$port, [string]$ownerDirectory) {
    if (-not (Test-SodaRunning $port)) { return }
    $stopFile = Join-Path $ownerDirectory 'server.stop'
    $pidFile = Join-Path $ownerDirectory 'launcher.pid'
    if (-not (Test-Path -LiteralPath $pidFile)) { throw 'This server was started outside play.ps1. Stop it in its own terminal first.' }
    $launcherId = [int]([IO.File]::ReadAllText($pidFile))
    if (-not (Get-Process -Id $launcherId -ErrorAction SilentlyContinue)) { throw 'The launcher that owns this server is no longer running.' }
    [IO.File]::WriteAllText($stopFile, '')
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    while (Test-SodaRunning $port) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'The server has not finished shutting down.' }
        Start-Sleep -Milliseconds 250
    }
}
$pressRuntime = Join-Path $runtime 'press-server'
if (Test-Path -LiteralPath $pressRuntime) { Stop-LocalShift 8741 $pressRuntime }
$otherRuntime = Join-Path $runtime 'story-server'
if (Test-Path -LiteralPath $otherRuntime) { Stop-LocalShift 8740 $otherRuntime }
Stop-LocalShift 8738 $runtime
& (Join-Path $PSScriptRoot 'backend/stop-db.ps1')
Write-Host 'Night Shift is stopped. Completed nights are saved.'
