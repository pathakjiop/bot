@echo off
cls
title SERVICE BOT - WINDOWS
set "cyan= [96m"
set "green= [92m"
set "reset= [0m"

echo %cyan%######################################
echo ##     WINDOWS STARTUP INITIATED    ##
echo ######################################%reset%

:: Launch API
start "API SERVER" cmd /k "color 0B && bun run src/index.ts"

:: Launch Worker
start "PYTHON WORKER" cmd /k "color 0E && python src/worker/worker.py"

echo %green%[SUCCESS] Both windows triggered.%reset%
timeout /t 3
exit