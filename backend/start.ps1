$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'local-db.ps1')
if (-not $env:SODA_JDBC_URL) { Start-SodaDb }
& (Join-Path $PSScriptRoot 'build.ps1') -Serve
