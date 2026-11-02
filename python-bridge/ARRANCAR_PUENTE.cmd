@echo off
setlocal
cd /d "%~dp0"
echo Cierra primero la ventana anterior del puente. Solo debe funcionar una copia.
where py >nul 2>nul
if errorlevel 1 (
  python -u "%~dp0bridge.py"
) else (
  py -3 -u "%~dp0bridge.py"
)
set "BRIDGE_EXIT=%ERRORLEVEL%"
echo.
echo El puente se ha detenido. Revisa bridge_errors.log y bridge_diagnostico.txt.
pause
exit /b %BRIDGE_EXIT%
