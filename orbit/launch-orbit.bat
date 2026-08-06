@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Orbit development launcher could not find Node.js.
  echo Install Node.js from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo Orbit development launcher could not find npm.
  pause
  exit /b 1
)

if not exist "node_modules\electron\package.json" (
  echo Installing Orbit development dependencies...
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed.
    pause
    exit /b 1
  )
)

call npm run dev
if errorlevel 1 (
  echo Orbit stopped with an error.
  pause
  exit /b 1
)
