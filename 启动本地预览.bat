@echo off
rem TradePilot local preview launcher (port 8188, isolated data dir)
setlocal
cd /d "%~dp0tradepilot-core"
set PORT=8188
set HOST=127.0.0.1
set DATA_DIR=..\tmp\local-preview-data
start "TradePilot preview" /min ..\tmp\node-v22.23.3-win-x64\node.exe server.js
timeout /t 2 /nobreak >nul
start http://127.0.0.1:8188/
endlocal
