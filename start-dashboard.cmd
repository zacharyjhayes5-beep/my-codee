@echo off
title Agency Dashboard - keep this window open
cd /d "%~dp0dashboard"

echo.
echo   Starting the dashboard...
echo   Your browser will open by itself in a few seconds.
echo.
echo   KEEP THIS WINDOW OPEN while you use the dashboard.
echo   Closing it stops the dashboard. Nothing is lost.
echo.

if not exist "node_modules" (
  echo   First run - setting things up, this takes a minute...
  echo.
  call npm install --no-audit --no-fund
  echo.
)

start "" powershell -NoProfile -Command "Start-Sleep 6; Start-Process 'http://localhost:5173/my-codee/'"

call npm run dev
