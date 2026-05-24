@echo off
echo Starting backend with full logging...
echo Logs will be saved to backend-full.log
echo Press Ctrl+C to stop the server
npm run dev 2>&1 | tee backend-full.log
