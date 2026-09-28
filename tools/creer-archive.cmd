@echo off
setlocal
rem Autorise ce lancement uniquement, sans modifier la configuration Windows.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0package.ps1"
set "archiveExitCode=%errorlevel%"
echo.
if not "%archiveExitCode%"=="0" echo Echec de creation du ZIP. Voir l'erreur ci-dessus.
pause
exit /b %archiveExitCode%
