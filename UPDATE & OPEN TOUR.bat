@echo off
title Ajdan 360 Tour
echo.
echo  Checking 360 renders in assets\panos ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\pack-panos.ps1"
echo.
echo  Opening the tour...
start "" "%~dp0index.html"
timeout /t 2 >nul
