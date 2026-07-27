@echo off
title Import Google OAuth Credentials
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0IMPORT_GOOGLE_OAUTH.ps1"
if errorlevel 1 (
  echo.
  echo The Google OAuth credentials were not imported.
  pause
  exit /b 1
)
call "%~dp0START_PLANNER.cmd"
