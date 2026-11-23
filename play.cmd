@echo off
setlocal
pushd "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0play.ps1" %*
set "game_status=%ERRORLEVEL%"
if not "%game_status%"=="0" pause
popd
exit /b %game_status%
