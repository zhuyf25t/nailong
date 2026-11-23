$ErrorActionPreference = 'Stop'

function Find-SodaPg {
    $found = Get-Command pg_ctl.exe -ErrorAction SilentlyContinue
    $choices = @($env:SODA_PG_BIN, 'D:/PostgreSQL/bin')
    if ($found) { $choices += Split-Path $found.Source }
    $installed = Join-Path $env:ProgramFiles 'PostgreSQL'
    if (Test-Path -LiteralPath $installed) {
        $choices += Get-ChildItem $installed -Directory | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'bin' }
    }
    foreach ($dir in $choices) {
        if ($dir -and (Test-Path (Join-Path $dir 'pg_ctl.exe'))) { return $dir }
    }
    throw 'PostgreSQL is missing. Set SODA_PG_BIN to the directory containing pg_ctl.exe.'
}

function Test-SodaDatabase([string]$pg, [string]$cluster, [string]$pwFile, [int]$port) {
    $oldPgPassword = $env:PGPASSWORD
    $oldTimeout = $env:PGCONNECT_TIMEOUT
    $env:PGPASSWORD = [IO.File]::ReadAllText($pwFile)
    $env:PGCONNECT_TIMEOUT = '2'
    try {
        # Windows PowerShell 5 treats even redirected native stderr as a terminating error.
        # A refused connection is expected when starting a stopped local server.
        $beforeProbe = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            $liveId = & (Join-Path $pg 'psql.exe') -X -w -At -h 127.0.0.1 -p $port -U soda -d postgres -c 'SELECT system_identifier::text FROM pg_control_system()' 2>$null
            $probeExit = $LASTEXITCODE
        } finally { $ErrorActionPreference = $beforeProbe }
        if ($probeExit -ne 0) { return $false }
        $localControl = & (Join-Path $pg 'pg_controldata.exe') -D $cluster
        if ($LASTEXITCODE -ne 0 -or -not ($localControl -match (':\s*' + [regex]::Escape($liveId) + '\s*$'))) {
            throw "Port $port belongs to a different PostgreSQL cluster."
        }
        return $true
    } finally {
        $env:PGPASSWORD = $oldPgPassword
        $env:PGCONNECT_TIMEOUT = $oldTimeout
    }
}

function Start-SodaDb {
    $pg = Find-SodaPg
    $dir = Join-Path $PSScriptRoot '.runtime'
    $cluster = Join-Path $dir 'pg'
    $pwFile = Join-Path $dir 'local-db-password'
    $port = 55437
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    if (-not (Test-Path $pwFile)) {
        if (Test-Path "$cluster/PG_VERSION") { throw 'Restore .runtime/local-db-password for the existing arena database.' }
        $bytes = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
        [IO.File]::WriteAllText($pwFile, [Convert]::ToBase64String($bytes), [Text.UTF8Encoding]::new($false))
    }
    if (-not (Test-Path "$cluster/PG_VERSION")) {
        & (Join-Path $pg 'initdb.exe') -D $cluster -U soda --auth=scram-sha-256 --encoding=UTF8 --locale=C "--pwfile=$pwFile"
        if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL initdb failed.' }
    }
    if (-not (Test-SodaDatabase $pg $cluster $pwFile $port)) {
        $launcher = Join-Path $pg 'pg_ctl.exe'
        $launchArgs = @('-D', $cluster, '-l', (Join-Path $dir 'postgres.log'), '-o', "-p $port -h 127.0.0.1", '-w', '-t', '30', 'start')
        $quoted = $launchArgs | ForEach-Object { '"' + $_ + '"' }
        $p = Start-Process -FilePath $launcher -ArgumentList $quoted -WindowStyle Hidden -PassThru
        $null = $p.Handle
        if (-not $p.WaitForExit(45000) -or $p.ExitCode -ne 0) {
            throw "Could not start the project database on port $port. See .runtime/postgres.log."
        }
    }
    $env:SODA_JDBC_URL = "jdbc:postgresql://127.0.0.1:$port/postgres"
    $env:SODA_DB_USER = 'soda'
    $env:SODA_DB_PASSWORD = [IO.File]::ReadAllText($pwFile)
}

function Stop-SodaDb {
    $pg = Find-SodaPg
    $cluster = Join-Path $PSScriptRoot '.runtime/pg'
    $pwFile = Join-Path $PSScriptRoot '.runtime/local-db-password'
    if ((Test-Path "$cluster/PG_VERSION") -and (Test-SodaDatabase $pg $cluster $pwFile 55437)) {
        & (Join-Path $pg 'pg_ctl.exe') -D $cluster -w -t 30 -m fast stop
        if ($LASTEXITCODE -ne 0 -or (Test-SodaDatabase $pg $cluster $pwFile 55437)) {
            throw 'The project database is still running or could not be stopped.'
        }
    }
}
