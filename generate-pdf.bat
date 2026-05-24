@echo off
cd app-backend
node scripts/csv-to-pdf.js ../test-coordinates.csv ../test-coordinates-preview.pdf
cd ..
echo.
echo PDF generated! Opening file...
start test-coordinates-preview.pdf
