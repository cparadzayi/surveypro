# Coordinate Swap Fix for EPSG:22291 (Cape Lo 31)

## Problem
Survey points in `surveyor_kuziva_paradzayi.coordinate_points` table were appearing in Gabon (West Africa) instead of Zimbabwe when viewed in QGIS.

## Root Cause
**Incorrect coordinate order in `ST_MakePoint()` calls.**

For EPSG:22291 with `+axis=wsu` (West-South-Up):
- **First ordinate (X)** = Westing (~97,000 meters)
- **Second ordinate (Y)** = Southing (~2,247,000 meters)

The CSV parser provides:
- `pt.y` = Westing (~97k)
- `pt.x` = Southing (~2.2M)

But the code was calling `ST_MakePoint(pt.x, pt.y)` = `ST_MakePoint(Southing, Westing)` which is **backwards**.

## Solution
Changed all `ST_MakePoint()` calls to use `ST_MakePoint(pt.y, pt.x)` = `ST_MakePoint(Westing, Southing)`.

## Files Modified

### 1. `app-backend/src/models/coordinatePoint.js`
- **Line 66**: `create()` method - Changed from `[..., x, y, ...]` to `[..., y, x, ...]`
- **Line 174**: `batchCreate()` method - Changed from `params.push(..., pt.x, pt.y, ...)` to `params.push(..., pt.y, pt.x, ...)`
- **Line 265**: `update()` method - Changed from `[name, x, y, ...]` to `[name, y, x, ...]`

### 2. Generated Columns (Already Correct)
The generated columns in `setup_surveyor_kuziva_schema.sql` are correct:
```sql
y DOUBLE PRECISION GENERATED ALWAYS AS (ST_Y(geom)) STORED,  -- Southing
x DOUBLE PRECISION GENERATED ALWAYS AS (ST_X(geom)) STORED,  -- Westing
```

This is correct because after the fix:
- `ST_MakePoint(Westing, Southing)` stores Westing as X ordinate, Southing as Y ordinate
- `ST_X(geom)` returns Westing → stored in `x` column ✓
- `ST_Y(geom)` returns Southing → stored in `y` column ✓

### 3. CSV Import (Already Correct)
`app-backend/src/routes/csvImports.js` was already correct:
- Line 534: `[match.coordinate.y, match.coordinate.x, ...]` ✓
- Line 601: `[..., newPt.y, newPt.x, ...]` ✓

## Next Steps

### 1. Delete Existing Data
All existing coordinate points in the database have **swapped coordinates** and must be deleted:

```sql
-- Delete all points from surveyor_kuziva_paradzayi schema
DELETE FROM surveyor_kuziva_paradzayi.coordinate_points;
```

### 2. Re-import CSV
Re-import your CSV file through the SurveyPro frontend. The new import will use the corrected coordinate order.

### 3. Verify in QGIS
After re-import:
1. Open QGIS
2. Add PostGIS layer: `surveyor_kuziva_paradzayi.coordinate_points`
3. Set CRS to EPSG:22291
4. Points should now appear in Zimbabwe (not Gabon)

## Expected Coordinates

**Zimbabwe (Correct):**
- Westing: ~97,000 meters
- Southing: ~2,247,000 meters
- WGS84: ~30°E, ~20°S

**Gabon (Incorrect - before fix):**
- Would appear at ~2.2°E, ~0.97°S

## Verification Query
```sql
-- Check first 5 points
SELECT 
    name,
    ST_X(geom) as x_westing,
    ST_Y(geom) as y_southing,
    ST_AsText(ST_Transform(geom, 4326)) as wgs84
FROM surveyor_kuziva_paradzayi.coordinate_points
LIMIT 5;
```

Expected output:
- `x_westing`: ~97,000
- `y_southing`: ~2,247,000
- `wgs84`: POINT(30.xxx -20.xxx) - Zimbabwe coordinates
