@echo off
rem Sends the Claude Code hook payload to the AI Coding Alerts extension.
rem With no listener (VS Code closed), plays the alert sound directly.
rem Usage: alert-hook.cmd popup|finished|activity
netstat -an | findstr /c:"127.0.0.1:51789" | findstr LISTENING >nul 2>nul
if errorlevel 1 (
  powershell -NoProfile -Command "Start-Process powershell -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%~dp0alert-fallback.ps1','%1'"
) else (
  curl -s --connect-timeout 2 --max-time 3 -X POST http://127.0.0.1:51789/alert -H "content-type: application/json" -d @- >nul 2>nul
)
exit /b 0
