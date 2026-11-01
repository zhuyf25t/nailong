. (Join-Path $PSScriptRoot 'runtime-common.ps1')

function Find-ProjectProcess([string] $StateFile, [string] $ProcessName, [string] $PathProperty) {
    if (-not (Test-Path -LiteralPath $StateFile)) { return $null }
    $state = Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($state.projectRoot -ne $script:ProjectRoot) { throw 'Process state belongs to a different project.' }
    $process = Get-Process -Id $state.processId -ErrorAction SilentlyContinue
    if (-not $process) { return $null }
    if ($process.ProcessName -ne $ProcessName -or -not (Test-RecordedProcessStart $process $state.startedAt) -or $process.Path -ne $state.$PathProperty) { return $null }
    return $process
}

function Wait-LocalHttp([string] $Url, [Diagnostics.Process] $Process, [int] $Seconds) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    do {
        $Process.Refresh()
        if ($Process.HasExited) { throw "Project process exited before $Url became ready; inspect .local logs." }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200) { return }
        } catch { }
        Start-Sleep -Milliseconds 500
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "$Url did not become ready within $Seconds seconds; inspect .local logs."
}

# Validate dependencies before starting anything. Explicit npm installs cannot race an editor's install.
$node = Get-Command node.exe -ErrorAction Stop
$vite = Join-Path $script:ProjectRoot 'frontend/node_modules/vite/bin/vite.js'
if (-not (Test-Path -LiteralPath $vite)) { throw 'Frontend dependencies are missing. Run npm ci from the frontend directory, then retry.' }
Use-ProjectJava
$null = Resolve-PgBin
if (-not (Get-Command sbt.bat -ErrorAction SilentlyContinue) -and -not (Test-Path -LiteralPath (Join-Path $script:ProjectRoot '.tools/sbt/sbt-launch.jar'))) { throw 'sbt launcher is missing. Install sbt or put its launcher in .tools/sbt/sbt-launch.jar.' }
$frontState = Join-Path $script:LocalRoot 'frontend-runtime.json'
$apiState = Join-Path $script:LocalRoot 'backend-runtime.json'
$frontend = Find-ProjectProcess $frontState 'node' 'nodePath'
$backend = Find-ProjectProcess $apiState 'java' 'javaPath'
if (-not $frontend -and -not (Test-LocalPort 5173)) { throw 'Port 5173 belongs to an unrecognized process. It was not stopped.' }
if (-not $backend -and -not (Test-LocalPort 8080)) { throw 'Port 8080 belongs to an unrecognized process. It was not stopped.' }

& (Join-Path $PSScriptRoot 'start-database.ps1')
$config = Import-ProjectEnv
if ($config.API_HOST -ne '127.0.0.1' -or [int]$config.API_PORT -ne 8080) { throw 'The local demo expects API_HOST=127.0.0.1 and API_PORT=8080, matching the Vite /api proxy.' }
if (-not $backend) {
    & (Join-Path $PSScriptRoot 'start-backend.ps1') -Background
    $backend = Find-ProjectProcess $apiState 'java' 'javaPath'
    if (-not $backend) { throw 'Backend process could not be identified after startup.' }
} else { Write-Host "Reusing project backend PID $($backend.Id)." }
Wait-LocalHttp 'http://127.0.0.1:8080/api/health' $backend 30
if (-not $frontend) {
    $arguments = @($vite, '--host', '127.0.0.1', '--port', '5173', '--strictPort') | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }
    $frontend = Start-Process -FilePath $node.Source -ArgumentList $arguments -WorkingDirectory (Join-Path $script:ProjectRoot 'frontend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $script:LocalRoot 'frontend.stdout.log') -RedirectStandardError (Join-Path $script:LocalRoot 'frontend.stderr.log')
    @{ processId = $frontend.Id; startedAt = $frontend.StartTime.ToUniversalTime().ToString('o'); nodePath = $node.Source; projectRoot = $script:ProjectRoot; port = 5173 } | ConvertTo-Json | Set-Content -LiteralPath $frontState -Encoding UTF8
} else { Write-Host "Reusing project frontend PID $($frontend.Id)." }
Wait-LocalHttp 'http://127.0.0.1:5173/' $frontend 30
Write-Host 'Nailong is ready: http://127.0.0.1:5173/ (frontend + Scala API + PostgreSQL).'
Write-Host 'Port 5174 is unchanged. Use scripts/stop-app.ps1 to stop only this project stack.'
