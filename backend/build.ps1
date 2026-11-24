param([string[]]$Tasks = @('test'), [switch]$Serve)
$ErrorActionPreference = 'Stop'
$courseTools = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.tools'))
$java = if (Test-Path "$courseTools/jdk-21/bin/java.exe") { "$courseTools/jdk-21/bin/java.exe" }
elseif (Test-Path "$env:USERPROFILE/.local/lib/jdk-21/bin/java.exe") { "$env:USERPROFILE/.local/lib/jdk-21/bin/java.exe" }
elseif ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' }
else { (Get-Command java.exe).Source }
$launcher = Join-Path (Split-Path (Get-Command sbt.bat).Source) 'sbt-launch.jar'
$opts = @('-Xmx1200m','-Dfile.encoding=UTF-8','-Dsbt.supershell=false','-Dsbt.server.autostart=false','-Dsbt.log.noformat=true','-Dsbt.override.build.repos=true', "-Dsbt.repository.config=$PSScriptRoot/repositories")
$env:COURSIER_CACHE = Join-Path $env:USERPROFILE '.cache/coursier'
Push-Location $PSScriptRoot
try {
    if ($Serve) { $Tasks = @('prepareServer') }
    $compiler = New-Object Threading.Mutex($false, 'Local\Discontinuous_Parkour_Compiler')
    $locked = $false
    try {
        try { $locked = $compiler.WaitOne([TimeSpan]::FromMinutes(5)) }
        catch [Threading.AbandonedMutexException] { $locked = $true }
        if (-not $locked) { throw 'Timed out waiting for the active parkour build.' }
        & $java @opts -jar $launcher @Tasks
        if ($LASTEXITCODE -ne 0) { throw "sbt exited with $LASTEXITCODE" }
    } finally {
        if ($locked) { $compiler.ReleaseMutex() }
        $compiler.Dispose()
    }
    if ($Serve) {
        $classpath = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'target/runtime-server-classpath.txt'))
        & $java '-Dfile.encoding=UTF-8' '-cp' $classpath soda.parkour.Main
        if ($LASTEXITCODE -ne 0) { throw "Parkour server exited with $LASTEXITCODE" }
    }
} finally { Pop-Location }
