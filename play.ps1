[CmdletBinding()]
param(
    [switch] $SmokeTest,
    [string] $Godot = $env:GODOT_BIN,
    [uri] $ConnectTo,
    [int] $StartupTimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'game'
$runtime = Join-Path $PSScriptRoot '.runtime'
$serverScript = Join-Path $PSScriptRoot 'backend/start.ps1'
$stopFile = Join-Path $runtime 'server.stop'
$serverPidFile = Join-Path $runtime 'launcher.pid'
if (-not $Godot) { $Godot = 'D:\HW3Tools\Godot-4.7.2\Godot_v4.7.2-stable_win64.exe' }
if (-not (Test-Path -LiteralPath $Godot -PathType Leaf)) { throw "Godot executable missing: $Godot" }
$console = Join-Path (Split-Path -Parent $Godot) (([IO.Path]::GetFileNameWithoutExtension($Godot)) + '_console.exe')
if (-not (Test-Path -LiteralPath $console)) { $console = $Godot }
$null = New-Item -ItemType Directory -Path $runtime -Force
$baseUrl = 'http://127.0.0.1:8737'
if ($ConnectTo) {
    if (-not $ConnectTo.IsAbsoluteUri -or $ConnectTo.Scheme -notin @('http', 'https') -or $ConnectTo.UserInfo -or $ConnectTo.Query -or $ConnectTo.Fragment) {
        throw 'Pass a server URL such as http://192.168.1.20:8737'
    }
    $baseUrl = $ConnectTo.AbsoluteUri.TrimEnd('/')
}

function Test-SodaHealth {
    try {
        $health = Invoke-RestMethod "$baseUrl/health" -TimeoutSec 2
        return $health.status -eq 'ok' -and $health.game -eq 'soda'
    } catch { return $false }
}

# Two launchers share one local room server and serialize resource import.
$gate = New-Object Threading.Mutex($false, 'Local\HW3_Soda_Startup')
$locked = $false
try {
    try { $locked = $gate.WaitOne([TimeSpan]::FromSeconds($StartupTimeoutSeconds)) }
    catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another launch is still starting the game.' }
    if (-not (Test-SodaHealth)) {
        if ($ConnectTo) { throw "The Soda Scramble server at $baseUrl is unavailable." }
        if (Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile }
        $stdout = Join-Path $runtime 'server.log'
        $stderr = Join-Path $runtime 'server-errors.log'
        $previousSignal = $env:SODA_STOP_FILE
        $previousHost = $env:SODA_BIND_HOST
        try {
            $env:SODA_STOP_FILE = $stopFile
            $env:SODA_BIND_HOST = '127.0.0.1'
            $shell = (Get-Command powershell.exe).Source
            $serverArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $serverScript + '"'
            $server = Start-Process $shell -ArgumentList $serverArgs -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
            [IO.File]::WriteAllText($serverPidFile, [string]$server.Id)
        } finally {
            $env:SODA_STOP_FILE = $previousSignal
            $env:SODA_BIND_HOST = $previousHost
        }
        Write-Host "Starting Soda Scramble. Server log: $stdout"
        $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
        while (-not (Test-SodaHealth)) {
            if ($server.HasExited -or [DateTime]::UtcNow -ge $deadline) {
                throw "Game server failed to start. See $stdout and $stderr"
            }
            Start-Sleep -Milliseconds 400
        }
    }
    $importLog = Join-Path $runtime 'godot-import.log'
    $importArgs = '--headless --path "' + $project + '" --import --log-file "' + $importLog + '"'
    $import = Start-Process $console -ArgumentList $importArgs -WindowStyle Hidden -PassThru -Wait
    if ($import.ExitCode -ne 0 -or (Select-String -LiteralPath $importLog -Pattern 'SCRIPT ERROR|Parse Error|Failed to load' -Quiet)) {
        throw "Godot import failed. See $importLog"
    }
} finally {
    if ($locked) { $gate.ReleaseMutex() }
    $gate.Dispose()
}

$gameArgs = '--path "' + $project + '"'
if ($SmokeTest) {
    $smokeLog = Join-Path $runtime 'playthrough.log'
    $gameArgs += ' --headless --script res://tests/playthrough.gd --log-file "' + $smokeLog + '"'
}
$previousUrl = $env:SODA_API_URL
try {
    $env:SODA_API_URL = $baseUrl
    $process = Start-Process $Godot -ArgumentList $gameArgs -WorkingDirectory $project -PassThru -Wait
} finally { $env:SODA_API_URL = $previousUrl }
if ($process.ExitCode -ne 0) { throw "Godot exited with code $($process.ExitCode)" }
if ($SmokeTest -and -not (Select-String -LiteralPath $smokeLog -Pattern 'Soda playthrough PASS' -SimpleMatch -Quiet)) {
    throw "The playthrough did not complete. See $smokeLog"
}
