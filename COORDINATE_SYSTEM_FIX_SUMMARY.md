# Coordinate System Fix - Migration to Cape Lo 31

## Problem Summary

**Issue:** Data was displaying 1 degree east of correct location in QGIS (showing at 32°E instead of 30°E for Zvishavane, Zimbabwe).

**Root Cause:** 
1. Original data was in **Cape Lo 31 (EPSG:22291)**
2. Migration 062 incorrectly transformed to **Hartebeesthoek94 Lo29 (EPSG:2053)**
3. Migration 063 relabeled to **Hartebeesthoek94 Lo31 (EPSG:2054)** without fixing coordinates
4. Result: Coordinate values were corrupted (Y=2,248,243 instead of Y=97,057)

## Solution Implemented

### Migration 069: Revert to Cape Lo 31
- **File:** `app-backend/migrations/069_revert_to_cape_lo31_complete.sql`
- **Action:** Changed database SRID from 2054 → 22291 (Cape Lo 31)
- **Created:** QGIS-friendly views (`coordinate_points_qgis`, `land_parcels_qgis`)
- **Transforms:** Cape Lo 31 → WGS84 (EPSG:4326) for QGIS display

### Backend Code Updates
Updated SRID from 2054 → 22291 in:
- ✅ `app-backend/src/models/coordinatePoint.js` (create, batchCreate, update)
- ✅ `app-backend/src/models/landParcel.js` (all geometry operations)
- ✅ `app-backend/src/routes/csvImports.js` (CSV import)
- ✅ `app-backend/src/routes/spatial.js` (QGIS instructions)

### Frontend Updates
- ✅ `app-frontend/src/views/modules/cadastral-standard/ProjectSetupView.vue`
  - Changed default datum from `hartebeesthoek94` → `cape`
  - Updated UI text: "Cape Datum is Zimbabwe's standard for cadastral surveys"
  - Reordered dropdown to show Cape Datum first

## Correct Coordinate System: Cape Lo 31 (EPSG:22291)

**Why Cape Lo 31?**
- Standard for Zimbabwean cadastral surveys
- Based on Cape Datum (Modified Clarke 1880 ellipsoid)
- Lo31 zone (Central Meridian = 31°E)
- South-oriented: Y=Westing, X=Southing

**Expected Coordinate Values:**
| Point | Y (Cape Lo 31) | X (Cape Lo 31) | Lat (WGS84) | Lon (WGS84) |
|-------|----------------|----------------|-------------|-------------|
| 2283A | 97,057.022     | 2,247,854.388  | -20.32°     | 30.07°      |

**Location:** Zvishavane, Zimbabwe (NOT 32°E!)

## QGIS Setup Instructions

### For Users:
1. **Add PostGIS Layer:** `coordinate_points_qgis` (NOT `coordinate_points`)
2. **Geometry column:** `geom_qgis`
3. **CRS:** EPSG:4326 (WGS84) - auto-detected
4. **Result:** Data displays correctly in Zvishavane, Zimbabwe

### Technical Details:
- **Base tables:** Use EPSG:22291 (Cape Lo 31)
- **QGIS views:** Transform to EPSG:4326 (WGS84) via `ST_Transform(geom, 4326)`
- **No manual axis negation needed** - PostGIS handles south-oriented projection

## Data Migration Steps

### Completed:
1. ✅ Ran migration 069 (database SRID changed to 22291)
2. ✅ Updated backend code (all models and routes)
3. ✅ Updated frontend (default datum changed to Cape)
4. ✅ Deleted corrupted coordinate data

### Required:
1. ⏳ **Re-import CSV data** through SurveyPro frontend
   - File: `cadastral-standard/Magls 2283.csv`
   - Will restore correct Cape Lo 31 coordinates
2. ⏳ **Verify in QGIS** using `coordinate_points_qgis` view

## Verification Commands

### Check coordinate values:
```bash
psql -U postgres -d surveypro_db -c "
  SELECT 
    name, 
    ST_Y(geom) as y_cape_lo31, 
    ST_X(geom) as x_cape_lo31,
    ST_Y(geom_qgis) as lat_wgs84,
    ST_X(geom_qgis) as lon_wgs84
  FROM coordinate_points_qgis 
  LIMIT 3;
"
```

### Expected output:
```
 name  | y_cape_lo31 | x_cape_lo31 | lat_wgs84 | lon_wgs84
-------+-------------+-------------+-----------+-----------
 2283A | 97057.022   | 2247854.388 | -20.32    | 30.07
```

### Check SRID:
```bash
psql -U postgres -d surveypro_db -c "
  SELECT 
    Find_SRID('public', 'coordinate_points', 'geom') as srid,
    srtext 
  FROM spatial_ref_sys 
  WHERE srid = 22291;
"
```

## Files Modified

### Backend:
- `app-backend/migrations/069_revert_to_cape_lo31_complete.sql` (NEW)
- `app-backend/src/models/coordinatePoint.js`
- `app-backend/src/models/landParcel.js`
- `app-backend/src/routes/csvImports.js`
- `app-backend/src/routes/spatial.js`

### Frontend:
- `app-frontend/src/views/modules/cadastral-standard/ProjectSetupView.vue`

### Documentation:
- `REVERT_TO_CAPE_LO31_INSTRUCTIONS.md` (NEW)
- `COORDINATE_SYSTEM_FIX_SUMMARY.md` (THIS FILE)

## Status

✅ **Migration Complete**
✅ **Backend Code Updated**
✅ **Frontend Updated**
⏳ **Awaiting CSV Re-import**
⏳ **Awaiting QGIS Verification**

## Next Steps

1. Re-import CSV data through SurveyPro frontend
2. Verify coordinates in database (should be Y≈97,000, X≈2,247,000)
3. Test in QGIS using `coordinate_points_qgis` view
4. Confirm data displays at 30.07°E (Zvishavane), NOT 32°E

---

**Date:** December 13, 2025
**Issue:** 1-degree eastward shift in QGIS
**Resolution:** Reverted to Cape Lo 31 (EPSG:22291) - Zimbabwe's cadastral standard
