Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:ProjectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$script:LocalRoot = Join-Path $script:ProjectRoot '.local'

function Read-LocalEnv([string] $Path) {
    $values = @{}
    if (Test-Path -LiteralPath $Path) {
        foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
            if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') { $values[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'") }
        }
    }
    return $values
}

function Import-ProjectEnv {
    $values = Read-LocalEnv (Join-Path $script:ProjectRoot '.env')
    foreach ($key in $values.Keys) { [Environment]::SetEnvironmentVariable($key, $values[$key], 'Process') }
    return $values
}

function New-LocalSecret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes)
}

function Resolve-PgBin([string] $Preferred = '') {
    $candidates = @($Preferred, $env:NAILONG_PG_BIN, (Join-Path $script:ProjectRoot '.tools/postgresql/bin'), 'D:/PostgreSQL/bin')
    $found = Get-Command pg_ctl.exe -ErrorAction SilentlyContinue
    if ($found) { $candidates += Split-Path $found.Source -Parent }
    $installRoot = Join-Path $env:ProgramFiles 'PostgreSQL'
    if (Test-Path -LiteralPath $installRoot) {
        $candidates += Get-ChildItem -LiteralPath $installRoot -Directory | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'bin' }
    }
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath (Join-Path $candidate 'pg_ctl.exe'))) { return [IO.Path]::GetFullPath($candidate) }
    }
    throw 'PostgreSQL binaries not found. Set NAILONG_PG_BIN or install official PostgreSQL binaries into .tools/postgresql/bin. See https://www.postgresql.org/download/windows/ .'
}

function Test-LocalPort([int] $Port) {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $Port)
    try { $listener.Start(); return $true } catch { return $false } finally { $listener.Stop() }
}

function Test-RecordedProcessStart([Diagnostics.Process] $Process, [object] $RecordedStart) {
    try {
        # PowerShell 7 ConvertFrom-Json converts ISO dates to DateTime; Windows PowerShell
        # 5 keeps them as strings. Comparing formatted strings silently loses precision
        # in PowerShell 7. Compare exact UTC ticks in both runtimes instead.
        if ($RecordedStart -is [DateTimeOffset]) { $expected = $RecordedStart.UtcDateTime }
        elseif ($RecordedStart -is [DateTime]) { $expected = $RecordedStart.ToUniversalTime() }
        else { $expected = [DateTime]::Parse([string] $RecordedStart, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime() }
        return $Process.StartTime.ToUniversalTime().Ticks -eq $expected.Ticks
    } catch { return $false }
}

function Invoke-HiddenNative([string] $Executable, [string[]] $Arguments, [string] $Name) {
    New-Item -ItemType Directory -Path $script:LocalRoot -Force | Out-Null
    $stdout = Join-Path $script:LocalRoot ($Name + '.stdout.log')
    $stderr = Join-Path $script:LocalRoot ($Name + '.stderr.log')
    # Windows Start-Process joins ArgumentList; quote each argument once so paths with spaces survive.
    $quoted = $Arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }
    $process = Start-Process -FilePath $Executable -ArgumentList $quoted -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $null = $process.Handle
    # Start-Process -Wait follows descendants, which would also wait for the long-lived postgres server.
    # Wait for this launcher only; pg_ctl itself waits until PostgreSQL is ready.
    if (-not $process.WaitForExit(60000)) { throw "$Name launcher did not finish within 60 seconds; inspect .local logs before retrying." }
    if ($process.ExitCode -ne 0) {
        $detail = (Get-Content -LiteralPath $stderr -ErrorAction SilentlyContinue) -join [Environment]::NewLine
        throw "$Name failed ($($process.ExitCode)): $detail"
    }
}

function Use-ProjectJava {
    $localJdk = Join-Path $script:ProjectRoot '.tools/jdk-21'
    if (Test-Path -LiteralPath (Join-Path $localJdk 'bin/java.exe')) { $env:JAVA_HOME = $localJdk }
    if (-not $env:JAVA_HOME) {
        $java = Get-Command java.exe -ErrorAction Stop
        $env:JAVA_HOME = Split-Path (Split-Path $java.Source -Parent) -Parent
    }
    $env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $env:PATH
}
