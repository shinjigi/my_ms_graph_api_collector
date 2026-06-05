@echo off
REM Launcher: full pipeline + UI on a single port (http://localhost:3001).
REM Double-click to run, or invoke from a terminal.

REM Move to the directory containing this script (project root).
cd /d "%~dp0"

echo ============================================
echo  my_ms_graph_api_collector - starting...
echo  Pipeline: collect -^> aggregate -^> analyse
echo           -^> web build -^> serve
echo  UI: http://localhost:3001
echo ============================================
echo.

call npm run app

echo.
echo ============================================
echo  Stopped (exit code %ERRORLEVEL%).
echo ============================================
pause
