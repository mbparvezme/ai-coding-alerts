@echo off
rem Forwards the Claude Code hook payload to the AI Coding Alerts extension.
rem When no listener is up (VS Code closed), plays the alert sound directly.
rem Usage: alert-hook.cmd popup|finished
curl -s --connect-timeout 1 --max-time 5 -X POST http://127.0.0.1:51789/alert -H "content-type: application/json" -d @- >nul 2>nul
if errorlevel 1 powershell -NoProfile -Command "Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0alert-fallback.ps1','%1'"
exit /b 0
