@echo off
setlocal
title Godsaeng Planner Server
set "ROOT=%~dp0"
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"

if not exist "%NODE_EXE%" (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)

if not exist "%NODE_EXE%" if "%NODE_EXE%"=="%ProgramFiles%\nodejs\node.exe" (
  echo Node.js was not found.
  echo Install Node.js and run this file again.
  pause
  exit /b 1
)

cd /d "%ROOT%work"
echo.
echo Starting Godsaeng Planner Server...
echo Keep this window open while using the planner.
echo.
"%NODE_EXE%" server.js
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo The server stopped with exit code %EXIT_CODE%.
echo EXIT_CODE=%EXIT_CODE%>"%ROOT%planner-server-error.log"
echo Review the error above and keep this window open.
pause
exit /b %EXIT_CODE%
