@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-orbit-desktop.ps1" %*
if errorlevel 1 pause

