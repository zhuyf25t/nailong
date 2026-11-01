. (Join-Path $PSScriptRoot 'runtime-common.ps1')
$toolsRoot = Join-Path $script:ProjectRoot '.tools'
$destination = [IO.Path]::GetFullPath((Join-Path $toolsRoot 'jdk-21'))
if (Test-Path -LiteralPath (Join-Path $destination 'bin/java.exe')) {
    & (Join-Path $destination 'bin/java.exe') -version
    exit $LASTEXITCODE
}
New-Item -ItemType Directory -Path $toolsRoot -Force | Out-Null
$releases = Invoke-RestMethod -Uri 'https://api.adoptium.net/v3/assets/latest/21/hotspot?architecture=x64&image_type=jdk&os=windows&vendor=eclipse'
$package = $releases[0].binary.package
$download = [Uri] $package.link
if ($download.Scheme -ne 'https' -or $download.Host -ne 'github.com' -or -not $download.AbsolutePath.StartsWith('/adoptium/temurin21-binaries/releases/download/')) { throw 'Unexpected Adoptium package source.' }
$archive = Join-Path $toolsRoot 'temurin21.zip'
if (-not (Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $package.checksum) {
    Invoke-WebRequest -Uri $package.link -OutFile $archive -UseBasicParsing
}
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $package.checksum) { throw 'JDK checksum does not match the official Adoptium API.' }
$package | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $toolsRoot 'temurin-package.json') -Encoding UTF8
$extracted = Join-Path $toolsRoot ('jdk-extract-' + [Guid]::NewGuid().ToString('N'))
Expand-Archive -LiteralPath $archive -DestinationPath $extracted
$folders = @(Get-ChildItem -LiteralPath $extracted -Directory)
if ($folders.Count -ne 1 -or -not (Test-Path -LiteralPath (Join-Path $folders[0].FullName 'bin/java.exe'))) { throw 'Unexpected JDK archive layout.' }
$source = [IO.Path]::GetFullPath($folders[0].FullName)
$allowedRoot = [IO.Path]::GetFullPath($toolsRoot) + [IO.Path]::DirectorySeparatorChar
if (-not $source.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase) -or -not $destination.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'JDK move is outside this project tools directory.' }
Move-Item -LiteralPath $source -Destination $destination
Remove-Item -LiteralPath $extracted
& (Join-Path $destination 'bin/java.exe') -version
if ($LASTEXITCODE -ne 0) { throw 'Downloaded JDK could not run.' }
