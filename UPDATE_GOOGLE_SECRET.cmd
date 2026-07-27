@echo off
title Update Google Client Secret
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0UPDATE_GOOGLE_SECRET.ps1"
if errorlevel 1 (
  echo.
  echo The secret was not saved. Review the error above.
  pause
  exit /b 1
)
call "%~dp0START_PLANNER.cmd"
