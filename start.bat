@echo off
chcp 65001 >nul
cd /d "%~dp0"
node cli.cjs
if errorlevel 1 (
  pause
  exit /b 1
)
exit /b 0
