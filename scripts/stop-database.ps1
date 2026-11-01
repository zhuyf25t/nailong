. (Join-Path $PSScriptRoot 'runtime-common.ps1')
$data = [IO.Path]::GetFullPath((Join-Path $script:LocalRoot 'postgres'))
if (-not $data.StartsWith($script:ProjectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to stop a cluster outside this project.' }
if (-not (Test-Path -LiteralPath (Join-Path $data 'PG_VERSION'))) { Write-Host 'Project database has not been initialized.'; exit 0 }
$runtimePath = Join-Path $script:LocalRoot 'database-runtime.json'
$preferred = ''
if (Test-Path -LiteralPath $runtimePath) { $preferred = (Get-Content -LiteralPath $runtimePath -Raw -Encoding UTF8 | ConvertFrom-Json).pgBin }
$pg = Resolve-PgBin $preferred
& (Join-Path $pg 'pg_ctl.exe') -D $data status *> $null
if ($LASTEXITCODE -ne 0) { Write-Host 'Project database is already stopped.'; exit 0 }
Invoke-HiddenNative (Join-Path $pg 'pg_ctl.exe') @('-D', $data, '-m', 'fast', '-w', '-t', '30', 'stop') 'postgres-stop'
Write-Host 'Stopped only the project-local PostgreSQL cluster; data is preserved.'
