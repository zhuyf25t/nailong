[CmdletBinding()]
param(
    [switch] $SmokeTest,
    [switch] $ServerOnly,
    [string] $Godot = $env:GODOT_BIN,
    [int] $StartupTimeoutSeconds = 300
)
$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'game'
$runtime = Join-Path $PSScriptRoot '.parkour-runtime'
$serverScript = Join-Path $PSScriptRoot 'backend/start.ps1'
if (-not $Godot) { $Godot = 'D:\HW3Tools\Godot-4.7.2\Godot_v4.7.2-stable_win64.exe' }
if (-not $ServerOnly -and -not (Test-Path -LiteralPath $Godot -PathType Leaf)) { throw "Godot executable missing: $Godot" }
$console = Join-Path (Split-Path -Parent $Godot) (([IO.Path]::GetFileNameWithoutExtension($Godot)) + '_console.exe')
if (-not (Test-Path -LiteralPath $console)) { $console = $Godot }
$null = New-Item -ItemType Directory -Path $runtime -Force
$baseUrl = 'http://127.0.0.1:8739'
function Read-ParkourHealth([string]$address) {
    try { return Invoke-RestMethod "$address/health" -TimeoutSec 2 } catch { return $null }
}
function Test-ParkourServer($health) {
    return ($health.status -eq 'ok' -and $health.game -eq 'discontinuous')
}
$gate = New-Object Threading.Mutex($false, 'Local\Discontinuous_Parkour_Startup')
$locked = $false
try {
    try { $locked = $gate.WaitOne([TimeSpan]::FromSeconds($StartupTimeoutSeconds)) }
    catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another launch is still starting the game.' }
    $health = Read-ParkourHealth $baseUrl
    if (-not (Test-ParkourServer $health)) {
        if ($health) { throw "Port 8739 is occupied by a different service: $($health.game)" }
        $stopFile = Join-Path $runtime 'server.stop'
        $serverPidFile = Join-Path $runtime 'launcher.pid'
        if (Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile }
        $stdout = Join-Path $runtime 'server.log'
        $stderr = Join-Path $runtime 'server-errors.log'
        $previousSignal = $env:SODA_STOP_FILE
        $previousHost = $env:SODA_BIND_HOST
        $previousPort = $env:SODA_HTTP_PORT
        try {
            $env:SODA_STOP_FILE = $stopFile
            $env:SODA_BIND_HOST = '127.0.0.1'
            $env:SODA_HTTP_PORT = '8739'
            $shell = (Get-Command powershell.exe).Source
            $serverArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $serverScript + '"'
            $server = Start-Process $shell -ArgumentList $serverArgs -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
            [IO.File]::WriteAllText($serverPidFile, [string]$server.Id)
        } finally {
            $env:SODA_STOP_FILE = $previousSignal
            $env:SODA_BIND_HOST = $previousHost
            $env:SODA_HTTP_PORT = $previousPort
        }
        Write-Host "Starting Discontinuous Existence. Server log: $stdout"
        $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
        while (-not (Test-ParkourServer (Read-ParkourHealth $baseUrl))) {
            if ($server.HasExited -or [DateTime]::UtcNow -ge $deadline) {
                throw "Game server failed to start. See $stdout and $stderr"
            }
            Start-Sleep -Milliseconds 400
        }
    }
    if ($ServerOnly) {
        Write-Host "Discontinuous Existence service ready at $baseUrl"
        return
    }
    $importLog = Join-Path $runtime 'godot-import.log'
    $importArgs = '--headless --path "' + $project + '" --import --log-file "' + $importLog + '"'
    $import = Start-Process $console -ArgumentList $importArgs -WindowStyle Hidden -PassThru -Wait
    if ($import.ExitCode -ne 0 -or ((Test-Path $importLog) -and (Select-String -LiteralPath $importLog -Pattern 'SCRIPT ERROR|Parse Error|Failed to load' -Quiet))) {
        throw "Godot import failed. See $importLog"
    }
} finally {
    if ($locked) { $gate.ReleaseMutex() }
    $gate.Dispose()
}
$gameArgs = '--path "' + $project + '"'
if ($SmokeTest) {
    $smokeLog = Join-Path $runtime 'playthrough.log'
    $gameArgs += ' --headless --script res://tests/parkour_smoke.gd --log-file "' + $smokeLog + '"'
}
$previousUrl = $env:SODA_API_URL
try {
    $env:SODA_API_URL = $baseUrl
    $process = Start-Process $Godot -ArgumentList $gameArgs -WorkingDirectory $project -PassThru -Wait
} finally {
    $env:SODA_API_URL = $previousUrl
}
if ($process.ExitCode -ne 0) { throw "Godot exited with code $($process.ExitCode)" }
if ($SmokeTest -and -not (Select-String -LiteralPath $smokeLog -Pattern 'PARKOUR SMOKE PASS' -SimpleMatch -Quiet)) {
    throw "The playthrough did not complete. See $smokeLog"
}
