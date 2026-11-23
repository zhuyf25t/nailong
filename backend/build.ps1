param([string[]]$Tasks = @('test'), [switch]$Serve)
$ErrorActionPreference = 'Stop'
$courseTools = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../nailong/.tools'))
$java = if (Test-Path "$courseTools/jdk-21/bin/java.exe") { "$courseTools/jdk-21/bin/java.exe" } elseif ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin/java.exe' } else { (Get-Command java.exe).Source }
$launcher = Join-Path (Split-Path (Get-Command sbt.bat).Source) 'sbt-launch.jar'
$opts = @('-Xmx1200m','-Dfile.encoding=UTF-8','-Dsbt.supershell=false','-Dsbt.server.autostart=false','-Dsbt.log.noformat=true','-Dsbt.override.build.repos=true', "-Dsbt.repository.config=$PSScriptRoot/repositories")
if (Test-Path "$courseTools/coursier") {
    $env:COURSIER_CACHE = "$courseTools/coursier"
    $opts += "-Dsbt.boot.directory=$courseTools/sbt/boot"
}
Push-Location $PSScriptRoot
try {
    if ($Serve) { $Tasks = @('prepareLaunch') }
    & $java @opts -jar $launcher @Tasks
    if ($LASTEXITCODE -ne 0) { throw "sbt exited with $LASTEXITCODE" }
    if ($Serve) {
        $classpath = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'target/runtime-classpath.txt'))
        & $java '-Dfile.encoding=UTF-8' '-cp' $classpath soda.Main
        if ($LASTEXITCODE -ne 0) { throw "Soda exited with $LASTEXITCODE" }
    }
} finally { Pop-Location }
