@echo off
echo ========================================
echo CLEARING ALL CACHES
echo ========================================
echo.

echo [1/5] Clearing Vite cache...
if exist "node_modules\.vite" (
    rmdir /s /q "node_modules\.vite"
    echo     ✓ Vite cache cleared
) else (
    echo     - No Vite cache found
)
echo.

echo [2/5] Clearing dist folder...
if exist "dist" (
    rmdir /s /q "dist"
    echo     ✓ Dist folder cleared
) else (
    echo     - No dist folder found
)
echo.

echo [3/5] Clearing Vite temp files...
if exist ".vite" (
    rmdir /s /q ".vite"
    echo     ✓ Vite temp cleared
) else (
    echo     - No Vite temp found
)
echo.

echo [4/5] Clearing TypeScript cache...
if exist ".tsbuildinfo" (
    del /q ".tsbuildinfo"
    echo     ✓ TypeScript cache cleared
) else (
    echo     - No TypeScript cache found
)
echo.

echo [5/5] Clearing Vue component cache...
if exist "node_modules\.cache" (
    rmdir /s /q "node_modules\.cache"
    echo     ✓ Vue cache cleared
) else (
    echo     - No Vue cache found
)
echo.

echo ========================================
echo ✅ ALL CACHES CLEARED!
echo ========================================
echo.
echo NEXT STEPS:
echo 1. Close all browser tabs with your app
echo 2. In browser: Press Ctrl+Shift+Delete
echo    - Select "Cached images and files"
echo    - Select "All time"
echo    - Click "Clear data"
echo 3. Run: npm run dev
echo 4. Open app in new browser tab
echo 5. Press Ctrl+Shift+R to hard refresh
echo.
pause
