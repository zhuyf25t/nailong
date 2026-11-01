param([int] $Port = 55432, [string] $PgBin = '')
. (Join-Path $PSScriptRoot 'runtime-common.ps1')

$pg = Resolve-PgBin $PgBin
$data = Join-Path $script:LocalRoot 'postgres'
$envPath = Join-Path $script:ProjectRoot '.env'
$adminPath = Join-Path $script:LocalRoot 'database-admin.env'
New-Item -ItemType Directory -Path $script:LocalRoot -Force | Out-Null
$config = Read-LocalEnv $envPath
if (-not $config.ContainsKey('DB_PASSWORD')) {
    if (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION')) { throw 'Existing cluster has no application credentials. Restore .env rather than resetting its password.' }
    while (-not (Test-LocalPort $Port)) { $Port++; if ($Port -gt 55532) { throw 'No available local PostgreSQL port in range.' } }
    $password = New-LocalSecret
    $lines = @('DB_HOST=127.0.0.1', "DB_PORT=$Port", 'DB_NAME=nailong', 'DB_TEST_NAME=nailong_test', 'DB_USER=nailong', "DB_PASSWORD=$password", 'DB_MAX_POOL_SIZE=10', 'DB_CONNECTION_TIMEOUT_MS=5000', 'API_HOST=127.0.0.1', 'API_PORT=8080')
    if (Test-Path -LiteralPath $envPath) { Add-Content -LiteralPath $envPath -Value $lines -Encoding UTF8 }
    else { Set-Content -LiteralPath $envPath -Value $lines -Encoding UTF8 }
    $config = Read-LocalEnv $envPath
}
if ($config.DB_HOST -ne '127.0.0.1' -or $config.DB_NAME -ne 'nailong' -or $config.DB_TEST_NAME -ne 'nailong_test' -or $config.DB_USER -ne 'nailong') {
    throw 'This script only manages the project-local 127.0.0.1 cluster with nailong/nailong_test databases and nailong app role.'
}
$Port = [int] $config.DB_PORT
if (-not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) {
    $adminPassword = New-LocalSecret
    Set-Content -LiteralPath $adminPath -Value "PG_ADMIN_PASSWORD=$adminPassword" -Encoding UTF8
    $pwFile = Join-Path $script:LocalRoot 'initdb-password.tmp'
    [IO.File]::WriteAllText($pwFile, $adminPassword, [Text.UTF8Encoding]::new($false))
    try { Invoke-HiddenNative (Join-Path $pg 'initdb.exe') @('-D', $data, '-U', 'nailong_admin', '--auth=scram-sha-256', '--encoding=UTF8', '--locale=C', "--pwfile=$pwFile") 'initdb' }
    finally { Remove-Item -LiteralPath $pwFile -ErrorAction SilentlyContinue }
    Add-Content -LiteralPath (Join-Path $data 'postgresql.conf') -Encoding UTF8 -Value @("listen_addresses = '127.0.0.1'", "port = $Port", 'max_connections = 40', "shared_buffers = '64MB'", "password_encryption = 'scram-sha-256'")
}
$admin = Read-LocalEnv $adminPath
if (-not $admin.ContainsKey('PG_ADMIN_PASSWORD')) { throw 'Missing .local/database-admin.env for this cluster.' }
& (Join-Path $pg 'pg_ctl.exe') -D $data status *> $null
if ($LASTEXITCODE -ne 0) {
    if (-not (Test-LocalPort $Port)) { throw "Port $Port is in use by another process. This script will not stop it." }
    Invoke-HiddenNative (Join-Path $pg 'pg_ctl.exe') @('-D', $data, '-l', (Join-Path $script:LocalRoot 'postgres.log'), '-w', '-t', '30', 'start') 'postgres-start'
}
$oldPassword = $env:PGPASSWORD
$oldAppPassword = $env:NAILONG_APP_PASSWORD
try {
    $env:PGPASSWORD = $admin.PG_ADMIN_PASSWORD
    $env:NAILONG_APP_PASSWORD = $config.DB_PASSWORD
    $sql = @'
\getenv app_password NAILONG_APP_PASSWORD
SELECT format('CREATE ROLE nailong LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L', :'app_password') WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nailong') \gexec
SELECT 'CREATE DATABASE nailong OWNER nailong' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'nailong') \gexec
SELECT 'CREATE DATABASE nailong_test OWNER nailong' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'nailong_test') \gexec
'@
    $sql | & (Join-Path $pg 'psql.exe') -X -h 127.0.0.1 -p $Port -U nailong_admin -d postgres -v ON_ERROR_STOP=1 -q
    if ($LASTEXITCODE -ne 0) { throw 'Application role/database provisioning failed.' }
    $env:PGPASSWORD = $config.DB_PASSWORD
    foreach ($db in @('nailong', 'nailong_test')) {
        & (Join-Path $pg 'psql.exe') -X -h 127.0.0.1 -p $Port -U nailong -d $db -v ON_ERROR_STOP=1 -At -c 'SELECT current_database(), current_user, version();'
        if ($LASTEXITCODE -ne 0) { throw "Application connection check failed: $db" }
    }
} finally {
    $env:PGPASSWORD = $oldPassword
    $env:NAILONG_APP_PASSWORD = $oldAppPassword
}
@{ pgBin = $pg; dataDirectory = $data; host = '127.0.0.1'; port = $Port; database = 'nailong'; testDatabase = 'nailong_test' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $script:LocalRoot 'database-runtime.json') -Encoding UTF8
Write-Host "Project PostgreSQL ready at 127.0.0.1:$Port; credentials stay in .env."
