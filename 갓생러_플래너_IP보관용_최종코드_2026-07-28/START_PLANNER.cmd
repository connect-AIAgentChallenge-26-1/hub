@echo off
setlocal
title Godsaeng Planner Final Source
set "ROOT=%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 24 or later is required.
  pause
  exit /b 1
)

if not exist "%ROOT%backend\.env" (
  echo [Setup required]
  echo Copy .env.example to backend\.env and enter the required server keys.
  echo Never upload backend\.env to GitHub or a pull request.
  pause
  exit /b 1
)

cd /d "%ROOT%backend"
echo Godsaeng Planner: http://127.0.0.1:3001
echo Keep this window open while using the planner.
node server.js
pause

