@echo off
setlocal
where py >nul 2>nul
if not errorlevel 1 (
  py -3 "%~dp0serve.py" %*
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python 3.9 or later is required. See README.md.
    pause
    exit /b 1
  )
  python "%~dp0serve.py" %*
)
if errorlevel 1 pause
