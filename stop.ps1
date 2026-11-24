$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot '.parkour-runtime'
function Test-ParkourRunning([int]$port) {
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 2
        return $health.game -eq 'discontinuous'
    } catch { return $false }
}
if (Test-ParkourRunning 8739) {
    $stopFile = Join-Path $runtime 'server.stop'
    $pidFile = Join-Path $runtime 'launcher.pid'
    if (-not (Test-Path -LiteralPath $pidFile)) { throw 'This server was started outside play.ps1. Stop it in its own terminal first.' }
    $launcherId = [int]([IO.File]::ReadAllText($pidFile))
    if (-not (Get-Process -Id $launcherId -ErrorAction SilentlyContinue)) { throw 'The launcher that owns this server is no longer running.' }
    [IO.File]::WriteAllText($stopFile, '')
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    while (Test-ParkourRunning 8739) {
        if ([DateTime]::UtcNow -gt $deadline) { throw 'The server has not finished shutting down.' }
        Start-Sleep -Milliseconds 250
    }
}
& (Join-Path $PSScriptRoot 'backend/stop-db.ps1')
Write-Host 'Discontinuous Existence is stopped.'
