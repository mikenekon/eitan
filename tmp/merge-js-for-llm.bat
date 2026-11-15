@echo off
setlocal
chcp 65001 >nul

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "OUTDIR=%ROOT%\tmp"
set "OUTPUT=%OUTDIR%\merged-js-for-llm.txt"
set "TEMP_OUTPUT=%OUTPUT%.tmp"

if not exist "%OUTDIR%\" mkdir "%OUTDIR%"
if errorlevel 1 (
  echo Failed to create output directory: "%OUTDIR%"
  exit /b 1
)

> "%TEMP_OUTPUT%" echo // JavaScript source files merged for LLM context.
for %%F in (
  "data-loader.js"
  "js\core.js"
  "js\storage.js"
  "js\pending.js"
  "js\platform.js"
  "js\shell.js"
  "js\units.js"
  "js\study-flow.js"
  "js\study-steps.js"
  "js\done.js"
  "js\cards.js"
  "js\history.js"
  "js\settings.js"
  "js\main.js"
) do call :append "%%~F" || goto :append_failed

move /y "%TEMP_OUTPUT%" "%OUTPUT%" >nul
if errorlevel 1 (
  echo Failed to write merged file: "%OUTPUT%"
  del "%TEMP_OUTPUT%" >nul 2>nul
  exit /b 1
)

echo Created: "%OUTPUT%"
exit /b 0

:append_failed
del "%TEMP_OUTPUT%" >nul 2>nul
exit /b 1

:append
if not exist "%ROOT%\%~1" (
  echo Missing source file: "%ROOT%\%~1"
  exit /b 1
)
>> "%TEMP_OUTPUT%" echo.
>> "%TEMP_OUTPUT%" echo // ===== %~1 =====
type "%ROOT%\%~1" >> "%TEMP_OUTPUT%"
if errorlevel 1 (
  echo Failed to read source file: "%ROOT%\%~1"
  exit /b 1
)
>> "%TEMP_OUTPUT%" echo.
exit /b 0
