@echo off
title Publish dashboard to the live site
cd /d "%~dp0"

echo.
echo   Sending your saved changes up to GitHub...
echo.
echo   A browser window may open asking you to sign in to GitHub.
echo   That is normal, and only happens the first time.
echo.

git push origin main

echo.
if errorlevel 1 (
  echo   ---------------------------------------------------------------
  echo   That did not go through. Nothing was sent, nothing was broken.
  echo   Copy the message above and show it to Claude.
  echo   ---------------------------------------------------------------
) else (
  echo   ---------------------------------------------------------------
  echo   Sent. The live site rebuilds itself and will be updated in
  echo   about two minutes:
  echo.
  echo   https://zacharyjhayes5-beep.github.io/my-codee/
  echo   ---------------------------------------------------------------
)

echo.
pause
