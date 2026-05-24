# Debug Plan for Parcel 1463

## Step 1: Check Browser Console
When you click "Export Area & Consistency PDF", look for these logs:
```
[MapLibre] 📊 Loaded X parcels from database
[MapLibre] 🔧 Extracting Cape Lo points from geometry for PDF: 1463
[MapLibre] ✅ Extracted X points from geometry for PDF
[MapLibre] 🔧 Computing residuals for QGIS parcel 1463...
[MapLibre] 📊 Processing X computed parcels (in-memory + database)
```

## Step 2: Check API Response
Open browser DevTools > Network tab > Look for request to:
`/land-parcels?project_id=1`

Check if parcel 1463 is in the response with `geom` field.

## Step 3: Check PDF Generation
Look for console logs from useAreaConsistencyPDF.ts:
```
[PDF] Processing X edges for 1463
[PDF] ⚠️ Skipping parcel without point data: 1463
```

## What to Report Back:
1. Does parcel 1463 appear in the API response?
2. Are there any console warnings about parcel 1463?
3. How many parcels does the PDF say it's processing?
