[CmdletBinding()]
param(
    [switch] $SmokeTest,
    [switch] $ServerOnly,
    [string] $Godot = $env:GODOT_BIN,
    [uri] $ConnectTo,
    [int] $StartupTimeoutSeconds = 300
)

$ErrorActionPreference = 'Stop'
$project = Join-Path $PSScriptRoot 'game'
$runtime = Join-Path $PSScriptRoot '.night-runtime'
$serverScript = Join-Path $PSScriptRoot 'backend/start.ps1'
if (-not $Godot) { $Godot = 'D:\HW3Tools\Godot-4.7.2\Godot_v4.7.2-stable_win64.exe' }
if (-not $ServerOnly -and -not (Test-Path -LiteralPath $Godot -PathType Leaf)) { throw "Godot executable missing: $Godot" }
$console = Join-Path (Split-Path -Parent $Godot) (([IO.Path]::GetFileNameWithoutExtension($Godot)) + '_console.exe')
if (-not (Test-Path -LiteralPath $console)) { $console = $Godot }
$null = New-Item -ItemType Directory -Path $runtime -Force
$baseUrl = 'http://127.0.0.1:8738'
if ($ConnectTo) {
    if (-not $ConnectTo.IsAbsoluteUri -or $ConnectTo.Scheme -notin @('http', 'https') -or $ConnectTo.UserInfo -or $ConnectTo.Query -or $ConnectTo.Fragment) {
        throw 'Pass a server URL such as http://192.168.1.20:8738'
    }
    $baseUrl = $ConnectTo.AbsoluteUri.TrimEnd('/')
}

function Read-NightHealth([string]$address) {
    try {
        return Invoke-RestMethod "$address/health" -TimeoutSec 2
    } catch { return $null }
}
function Test-CampaignServer($health) {
    return ($health.status -eq 'ok' -and $health.game -eq 'nightshift' -and $health.storyCampaign -eq 4)
}

# Serialize startup and import when multiple windows use the same service.
$gate = New-Object Threading.Mutex($false, 'Local\HW3_NightShift_Startup')
$locked = $false
try {
    try { $locked = $gate.WaitOne([TimeSpan]::FromSeconds($StartupTimeoutSeconds)) }
    catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'Another launch is still starting the game.' }
    $serverRuntime = $runtime
    $health = Read-NightHealth $baseUrl
    if (-not $ConnectTo -and -not (Test-CampaignServer $health)) {
        # Reuse a current server first, then choose a free port without interrupting a shift.
        $free = if (-not $health) { 8738 }
        $folders = @{ 8738 = $runtime; 8740 = (Join-Path $runtime 'story-server'); 8741 = (Join-Path $runtime 'press-server'); 8742 = (Join-Path $runtime 'relay-server') }
        foreach ($candidate in 8740,8741,8742) {
            $candidateUrl = "http://127.0.0.1:$candidate"
            $other = Read-NightHealth $candidateUrl
            if (Test-CampaignServer $other) {
                $baseUrl = $candidateUrl
                $health = $other
                break
            }
            if (-not $free -and -not $other) { $free = $candidate }
        }
        if (-not (Test-CampaignServer $health)) {
            if (-not $free) { throw 'All local Night Shift ports are occupied. Close the previous game then run stop.ps1.' }
            $baseUrl = "http://127.0.0.1:$free"
            $serverRuntime = (New-Item -ItemType Directory -Path $folders[$free] -Force).FullName
        }
    }
    if (-not (Test-CampaignServer $health)) {
        if ($ConnectTo) { throw "This endpoint must run Night Shift story campaign v4: $baseUrl" }
        $stopFile = Join-Path $serverRuntime 'server.stop'
        $serverPidFile = Join-Path $serverRuntime 'launcher.pid'
        if (Test-Path -LiteralPath $stopFile) { Remove-Item -LiteralPath $stopFile }
        $stdout = Join-Path $serverRuntime 'server.log'
        $stderr = Join-Path $serverRuntime 'server-errors.log'
        $previousSignal = $env:SODA_STOP_FILE
        $previousHost = $env:SODA_BIND_HOST
        $previousPort = $env:SODA_HTTP_PORT
        try {
            $env:SODA_STOP_FILE = $stopFile
            $env:SODA_BIND_HOST = '127.0.0.1'
            $env:SODA_HTTP_PORT = ([uri]$baseUrl).Port.ToString()
            $shell = (Get-Command powershell.exe).Source
            $serverArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $serverScript + '"'
            $server = Start-Process $shell -ArgumentList $serverArgs -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
            [IO.File]::WriteAllText($serverPidFile, [string]$server.Id)
        } finally {
            $env:SODA_STOP_FILE = $previousSignal
            $env:SODA_BIND_HOST = $previousHost
            $env:SODA_HTTP_PORT = $previousPort
        }
        Write-Host "Starting Night Shift. Server log: $stdout"
        $deadline = [DateTime]::UtcNow.AddSeconds($StartupTimeoutSeconds)
        while (-not (Test-CampaignServer (Read-NightHealth $baseUrl))) {
            if ($server.HasExited -or [DateTime]::UtcNow -ge $deadline) {
                throw "Game server failed to start. See $stdout and $stderr"
            }
            Start-Sleep -Milliseconds 400
        }
    }
    if ($ServerOnly) {
        Write-Host "Night Shift service ready at $baseUrl"
        return
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
    $gameArgs += ' --headless --script res://tests/night_playthrough.gd --log-file "' + $smokeLog + '"'
}
$previousUrl = $env:SODA_API_URL
$previousLocal = $env:NIGHT_LOCAL_ALTERNATE
try {
    $env:SODA_API_URL = $baseUrl
    $env:NIGHT_LOCAL_ALTERNATE = if (-not $ConnectTo -and $baseUrl -ne 'http://127.0.0.1:8738') { '1' } else { '0' }
    $process = Start-Process $Godot -ArgumentList $gameArgs -WorkingDirectory $project -PassThru -Wait
} finally {
    $env:SODA_API_URL = $previousUrl
    $env:NIGHT_LOCAL_ALTERNATE = $previousLocal
}
if ($process.ExitCode -ne 0) { throw "Godot exited with code $($process.ExitCode)" }
if ($SmokeTest -and -not (Select-String -LiteralPath $smokeLog -Pattern 'Night shift playthrough PASS' -SimpleMatch -Quiet)) {
    throw "The playthrough did not complete. See $smokeLog"
}
