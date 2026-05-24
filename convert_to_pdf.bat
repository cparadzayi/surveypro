@echo off
echo Converting QGIS Manual to PDF...
echo.
echo This requires Pandoc to be installed.
echo Download from: https://pandoc.org/installing.html
echo.

REM Check if pandoc is installed
where pandoc >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Pandoc is not installed or not in PATH
    echo.
    echo Please install Pandoc from: https://pandoc.org/installing.html
    echo.
    pause
    exit /b 1
)

REM Convert to PDF with nice formatting
pandoc "QGIS_Area_Computation_Manual.md" ^
    -o "QGIS_Area_Computation_Manual.pdf" ^
    --pdf-engine=xelatex ^
    -V geometry:margin=1in ^
    -V fontsize=11pt ^
    -V documentclass=article ^
    -V colorlinks=true ^
    -V linkcolor=blue ^
    -V urlcolor=blue ^
    -V toccolor=black ^
    --toc ^
    --toc-depth=2 ^
    --number-sections ^
    --highlight-style=tango

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ✅ SUCCESS! PDF created: QGIS_Area_Computation_Manual.pdf
    echo.
    start "" "QGIS_Area_Computation_Manual.pdf"
) else (
    echo.
    echo ❌ ERROR: PDF conversion failed
    echo.
    echo Try installing MiKTeX or TinyTeX for LaTeX support:
    echo - MiKTeX: https://miktex.org/download
    echo - TinyTeX: https://yihui.org/tinytex/
)

pause
