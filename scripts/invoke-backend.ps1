param([string[]] $Tasks = @('run'), [switch] $TestDatabase, [switch] $Background)
. (Join-Path $PSScriptRoot 'runtime-common.ps1')
$config = Import-ProjectEnv
if (-not $config.ContainsKey('DB_PASSWORD')) { throw 'Run scripts/start-database.ps1 first to create the project .env.' }
if ($TestDatabase) { $env:DB_NAME = $config.DB_TEST_NAME }
Use-ProjectJava
$backend = Join-Path $script:ProjectRoot 'backend'
if (-not (Test-Path -LiteralPath (Join-Path $backend 'build.sbt'))) { throw 'backend/build.sbt is missing.' }
$sbt = Get-Command sbt.bat -ErrorAction SilentlyContinue
$launcher = Join-Path $script:ProjectRoot '.tools/sbt/sbt-launch.jar'
if ($sbt) { $launcher = Join-Path (Split-Path $sbt.Source -Parent) 'sbt-launch.jar' }
if (-not (Test-Path -LiteralPath $launcher)) { throw 'Install sbt, or put its official sbt-launch.jar at .tools/sbt/sbt-launch.jar.' }
$env:COURSIER_CACHE = Join-Path $script:ProjectRoot '.tools/coursier'
$arguments = @('-Xms256m', '-Xmx1536m', '-Dfile.encoding=UTF-8', '-Dsbt.supershell=false', '-Dsbt.log.noformat=true', '-Dsbt.server.autostart=false', '-Dsbt.override.build.repos=true', ('-Dsbt.repository.config=' + (Join-Path $PSScriptRoot 'sbt-repositories')), ('-Dsbt.boot.directory=' + (Join-Path $script:ProjectRoot '.tools/sbt/boot')), ('-Dsbt.global.base=' + (Join-Path $script:ProjectRoot '.tools/sbt/global')), '-jar', $launcher) + $Tasks
$java = Join-Path $env:JAVA_HOME 'bin/java.exe'
if ($Background) {
    $statePath = Join-Path $script:LocalRoot 'backend-runtime.json'
    if (Test-Path -LiteralPath $statePath) {
        $state = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
        $previous = Get-Process -Id $state.processId -ErrorAction SilentlyContinue
        if ($previous -and $previous.ProcessName -eq 'java' -and (Test-RecordedProcessStart $previous $state.startedAt)) { throw 'The project backend process is already running. Use stop-backend.ps1 first.' }
    }
    New-Item -ItemType Directory -Path $script:LocalRoot -Force | Out-Null
    # Build once, then run the real IOApp main directly. This leaves sbt free for tests and
    # keeps the long-lived server in one identifiable Java process with normal shutdown hooks.
    $buildArguments = $arguments[0..($arguments.Length - $Tasks.Length - 1)] + @('compile', 'export Runtime / fullClasspath')
    Push-Location -LiteralPath $backend
    try {
        $buildOutput = @(& $java @buildArguments 2>&1)
        $buildExit = $LASTEXITCODE
    } finally { Pop-Location }
    $buildOutput | ForEach-Object { $_.ToString() } | Set-Content -LiteralPath (Join-Path $script:LocalRoot 'backend-build.log') -Encoding UTF8
    if ($buildExit -ne 0) { $buildOutput | Write-Output; throw "Backend compilation failed ($buildExit); see .local/backend-build.log." }
    $classpath = @($buildOutput | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -match '^[A-Za-z]:[\\/]' -and $_.Contains(';') }) | Select-Object -Last 1
    if (-not $classpath) { throw 'sbt did not export its runtime classpath; see .local/backend-build.log.' }
    foreach ($entry in $classpath.Split(';')) { if (-not (Test-Path -LiteralPath $entry)) { throw "Runtime classpath entry is missing: $entry" } }
    # Pass Unicode paths through CreateProcess's UTF-16 arguments.
    $runtimeArguments = @('-Xms128m', '-Xmx768m', '-Dfile.encoding=UTF-8', '-cp', $classpath, 'services.system.Main')
    $quoted = $runtimeArguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }
    $process = Start-Process -FilePath $java -ArgumentList $quoted -WorkingDirectory $backend -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $script:LocalRoot 'backend.stdout.log') -RedirectStandardError (Join-Path $script:LocalRoot 'backend.stderr.log')
    @{ processId = $process.Id; startedAt = $process.StartTime.ToUniversalTime().ToString('o'); javaPath = $java; projectRoot = $script:ProjectRoot } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    Write-Host "Backend launching (PID $($process.Id)); see .local/backend.stdout.log and .local/backend.stderr.log."
} else {
    Push-Location -LiteralPath $backend
    try { & $java @arguments; if ($LASTEXITCODE -ne 0) { throw "sbt exited with code $LASTEXITCODE" } }
    finally { Pop-Location }
}
