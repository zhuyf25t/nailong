[CmdletBinding()]
param(
    [switch] $SmokeTest,
    [switch] $QuickCheck,
    [string] $DataDir,
    [ValidateRange(1024,65535)] [int] $HttpPort = 18737,
    [ValidateRange(1024,65535)] [int] $DatabasePort = 55438
)

$ErrorActionPreference = 'Stop'
if ($HttpPort -eq $DatabasePort) { throw 'Choose two different local ports.' }
$appDir = $PSScriptRoot
if (-not $DataDir) {
    $DataDir = Join-Path $env:LOCALAPPDATA 'OnlyThreeOnShift'
    if ($SmokeTest -or $QuickCheck) { $DataDir = Join-Path $DataDir 'verification' }
}
$DataDir = [IO.Path]::GetFullPath($DataDir)
$null = New-Item -ItemType Directory -Path $DataDir -Force
$clusterDir = Join-Path $DataDir 'pg'
$keyFile = Join-Path $DataDir 'database.key'
$signal = Join-Path $DataDir 'stop.signal'
$ownerFile = Join-Path $DataDir 'service.json'
$javaBin = Join-Path $appDir 'java\bin\java.exe'
$pgBin = Join-Path $appDir 'postgres\bin'
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$godotBin = Join-Path $appDir 'engine\NightShift.exe'
$pack = Join-Path $appDir 'nightshift.pck'
$url = "http://127.0.0.1:$HttpPort"
$utf8 = [Text.UTF8Encoding]::new($false)
$childServer = $null
$ownsDb = $false
$exitCode = 1

function Test-Port([int]$Port) {
    $tcp = [Net.Sockets.TcpClient]::new()
    try {
        $result = $tcp.BeginConnect('127.0.0.1', $Port, $null, $null)
        if (-not $result.AsyncWaitHandle.WaitOne(350)) { return $false }
        $tcp.EndConnect($result)
        return $true
    } catch { return $false } finally { $tcp.Dispose() }
}

function Test-Game {
    try {
        $health = Invoke-RestMethod "$url/health" -TimeoutSec 2 -DisableKeepAlive
        return $health.status -eq 'ok' -and $health.game -eq 'nightshift'
    } catch { return $false }
}

function Start-Hidden([string]$File, [string]$Arguments, [string]$Stdout, [string]$Stderr, [string]$WorkingDirectory = $appDir) {
    $p = Start-Process -FilePath $File -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $DataDir $Stdout) -RedirectStandardError (Join-Path $DataDir $Stderr)
    $null = $p.Handle
    return $p
}

function Wait-Command($Proc, [int]$Seconds, [string]$Failure) {
    if (-not $Proc.WaitForExit($Seconds * 1000)) { throw "$Failure (timeout)" }
    if ($Proc.ExitCode -ne 0) { throw "$Failure (exit $($Proc.ExitCode))" }
}

function Wait-ServerStop($Proc) {
    [IO.File]::WriteAllText($signal, '', $utf8)
    if (-not $Proc.WaitForExit(45000)) {
        # Only the Java process positively identified as belonging to our data directory.
        $Proc.Kill()
        if (-not $Proc.WaitForExit(5000)) { throw 'The game server has not stopped yet.' }
    }
}

function Stop-OwnedDb {
    $p = Start-Hidden $pgCtl ('-D "' + $clusterDir + '" -w -t 30 -m fast stop') 'database-stop.log' 'database-stop-error.log'
    Wait-Command $p 40 'Could not stop the saved game database'
}

function Test-OwnedDb {
    if (-not (Test-Path -LiteralPath (Join-Path $clusterDir 'postmaster.pid'))) { return $false }
    $p = Start-Hidden $pgCtl ('-D "' + $clusterDir + '" status') 'database-status.log' 'database-status-error.log'
    return $p.WaitForExit(5000) -and $p.ExitCode -eq 0
}

function Initialize-GameDatabase {
    # PostgreSQL 17 on Windows places the share path in its bootstrap SQL.
    # An absolute, ASCII catalog path avoids an ANSI/UTF-8 mismatch even when
    # the player extracted the game to a directory named in Chinese.
    $share = Join-Path $appDir 'postgres\share'
    $temporary = $null
    $drive = $null
    try {
        if ($share -match '[^\x00-\x7f]') {
            $tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
            if ($tempBase -notmatch '[^\x00-\x7f]') {
                $temporary = Join-Path $tempBase ('night-shift-catalog-' + [Guid]::NewGuid().ToString('N'))
                Copy-Item -LiteralPath $share -Destination $temporary -Recurse
                $share = $temporary
            } else {
                # If the user's temp directory is also non-ASCII, borrow an
                # unused drive letter in this login session during initdb only.
                foreach ($letter in (90..68)) {
                    $candidate = ([char]$letter).ToString() + ':'
                    if ([IO.Directory]::GetLogicalDrives() -contains ($candidate + '\')) { continue }
                    & subst.exe $candidate $share
                    if ($LASTEXITCODE -eq 0) { $drive = $candidate; break }
                }
                if (-not $drive) { throw 'Could not prepare a catalog path. Move the game folder to a path with ASCII characters and retry.' }
                $share = $drive + '\.'
            }
        }
        $setup = '-L "' + $share + '" -D "' + $clusterDir + '" -U soda --auth=scram-sha-256 --encoding=UTF8 --locale=C --pwfile="' + $keyFile + '"'
        $p = Start-Hidden (Join-Path $pgBin 'initdb.exe') $setup 'database-init.log' 'database-init-error.log'
        Wait-Command $p 100 'Could not create the save database'
    } finally {
        if ($drive) { & subst.exe $drive /d }
        if ($temporary -and (Test-Path -LiteralPath $temporary)) {
            $actual = (Resolve-Path -LiteralPath $temporary).Path
            if ((Split-Path -Parent $actual) -eq $tempBase.TrimEnd('\') -and (Split-Path -Leaf $actual) -match '^night-shift-catalog-[0-9a-f]{32}$') {
                Remove-Item -LiteralPath $actual -Recurse -Force
            }
        }
    }
}

# Windows releases a mutex if its owner is unexpectedly closed. The next run
# then recovers only this profile's Java process and PostgreSQL cluster.
$hasher = [Security.Cryptography.SHA256]::Create()
try { $hash = $hasher.ComputeHash($utf8.GetBytes($DataDir.ToLowerInvariant())) }
finally { $hasher.Dispose() }
$mutexId = 'Local\NightShift_' + ([BitConverter]::ToString($hash, 0, 12) -replace '-', '')
$mutex = [Threading.Mutex]::new($false, $mutexId)
$locked = $false
try {
    try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { throw 'The game is already open for this Windows user.' }
    $env:PATH = (Join-Path $appDir 'java\bin') + ';' + $pgBin + ';' + $env:PATH
    if (Test-Path -LiteralPath $ownerFile) {
        $savedOwner = Get-Content -Raw -LiteralPath $ownerFile | ConvertFrom-Json
        $old = Get-Process -Id ([int]$savedOwner.pid) -ErrorAction SilentlyContinue
        if ($old -and $old.Path -eq $savedOwner.exe -and $old.StartTime.ToUniversalTime().Ticks.ToString() -eq $savedOwner.started) {
            Wait-ServerStop $old
        }
        Remove-Item -LiteralPath $ownerFile
    }
    if (Test-OwnedDb) { Stop-OwnedDb }
    if ((Test-Port $HttpPort) -or (Test-Port $DatabasePort)) {
        throw "A different program is using port $HttpPort or $DatabasePort. Use two free ports with -HttpPort and -DatabasePort."
    }
    if (Test-Path -LiteralPath $signal) { Remove-Item -LiteralPath $signal }
    if (-not (Test-Path -LiteralPath $keyFile)) {
        if (Test-Path -LiteralPath (Join-Path $clusterDir 'PG_VERSION')) { throw 'database.key is missing from the existing save directory.' }
        $bytes = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        [IO.File]::WriteAllText($keyFile, [Convert]::ToBase64String($bytes), $utf8)
    }
    if (-not (Test-Path -LiteralPath (Join-Path $clusterDir 'PG_VERSION'))) {
        Write-Host '正在为第一个夜班创建本机存档……'
        Initialize-GameDatabase
    }
    $dbArgs = '-D "' + $clusterDir + '" -l "' + (Join-Path $DataDir 'postgres.log') + '" -o "-h 127.0.0.1 -p ' + $DatabasePort + '" -w -t 35 start'
    $p = Start-Hidden $pgCtl $dbArgs 'database-start.log' 'database-start-error.log'
    Wait-Command $p 45 'Could not start the save database'
    $ownsDb = $true
    $env:SODA_JDBC_URL = "jdbc:postgresql://127.0.0.1:$DatabasePort/postgres"
    $env:SODA_DB_USER = 'soda'
    $env:SODA_DB_PASSWORD = [IO.File]::ReadAllText($keyFile)
    $env:SODA_STOP_FILE = 'stop.signal'
    $env:SODA_BIND_HOST = '127.0.0.1'
    $env:SODA_HTTP_PORT = [string]$HttpPort
    $env:SODA_API_URL = $url
    $javaArgs = '-Xmx384m -Dfile.encoding=UTF-8 -cp "' + (Join-Path $appDir 'server\lib\*') + '" soda.Main'
    $childServer = Start-Hidden $javaBin $javaArgs 'game-server.log' 'game-server-errors.log' $DataDir
    $env:SODA_DB_PASSWORD = $null
    $record = @{pid=$childServer.Id; exe=$javaBin; started=$childServer.StartTime.ToUniversalTime().Ticks.ToString()}
    [IO.File]::WriteAllText($ownerFile, ($record | ConvertTo-Json -Compress), $utf8)
    $deadline = [DateTime]::UtcNow.AddSeconds(60)
    while (-not (Test-Game)) {
        if ($childServer.HasExited -or [DateTime]::UtcNow -gt $deadline) { throw 'The local game server could not start.' }
        Start-Sleep -Milliseconds 250
    }
    $clientLog = Join-Path $DataDir 'client.log'
    $argsList = '--main-pack "' + $pack + '" --log-file "' + $clientLog + '"'
    if ($QuickCheck) {
        $verifyKey = [Security.Cryptography.SHA256]::Create()
        try { $bytes = $verifyKey.ComputeHash($utf8.GetBytes('night-shift-verification:' + [IO.File]::ReadAllText($keyFile))) }
        finally { $verifyKey.Dispose() }
        $env:NIGHT_VERIFY_PASSWORD = [Convert]::ToBase64String($bytes)
        $env:NIGHT_VERIFY_ACCOUNT = 'PackCheck-' + ([BitConverter]::ToString($bytes, 0, 5) -replace '-', '')
        $env:NIGHT_VERIFY_EXISTING = if (Test-Path -LiteralPath (Join-Path $DataDir 'checked')) { '1' } else { '0' }
        $argsList += ' --headless --script res://tests/distribution_check.gd'
    }
    elseif ($SmokeTest) { $argsList += ' --headless --script res://tests/night_playthrough.gd' }
    if ($SmokeTest -or $QuickCheck) {
        $client = Start-Hidden $godotBin $argsList 'client-output.log' 'client-error.log'
    } else {
        Write-Host '夜班只有三只已就绪。退出游戏后，这个窗口会自动关闭。'
        $client = Start-Process $godotBin -ArgumentList $argsList -WorkingDirectory $appDir -PassThru
    }
    $null = $client.Handle
    $client.WaitForExit()
    if ($client.ExitCode -ne 0) { throw "Game window exited with $($client.ExitCode)." }
    if ($QuickCheck -or $SmokeTest) {
        $marker = if ($QuickCheck) { 'Distribution check PASS' } else { 'Night shift playthrough PASS' }
        if (-not (Select-String -LiteralPath $clientLog -Pattern $marker -SimpleMatch -Quiet)) { throw 'The verification run did not complete.' }
        if ($QuickCheck) { [IO.File]::WriteAllText((Join-Path $DataDir 'checked'), '', $utf8) }
        Write-Host $marker
    }
    $exitCode = 0
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    [Console]::Error.WriteLine("Game logs: $DataDir")
} finally {
    try {
        if ($null -ne $childServer -and -not $childServer.HasExited) { Wait-ServerStop $childServer }
        if ($null -ne $childServer -and (Test-Path -LiteralPath $ownerFile)) { Remove-Item -LiteralPath $ownerFile }
        if ($ownsDb) { Stop-OwnedDb }
    } catch {
        [Console]::Error.WriteLine($_.Exception.Message)
        $exitCode = 1
    } finally {
        if ($locked) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}
exit $exitCode
