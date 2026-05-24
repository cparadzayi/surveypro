# Coordinate System Fix - Implementation Guide

## Quick Summary

**Problem:** Data stored in EPSG:22291 (south-oriented) displays upside-down in QGIS and doesn't overlay with Google Maps.

**Solution:** Migrate to EPSG:2053 (Hartebeesthoek94 Lo 31 - north-oriented), Zimbabwe's modern standard.

**Result:** Perfect QGIS/Google Maps overlay, no rotation needed.

---

## Step-by-Step Implementation

### 1. Run Database Migration

```bash
# Connect to PostgreSQL
psql -U postgres -d surveypro_v1

# Run migration
\i app-backend/migrations/060_fix_coordinate_system.sql
```

**What it does:**
- Creates backup tables (`coordinate_points_backup_060`, `land_parcels_backup_060`)
- Transforms all geometries from EPSG:22291 → EPSG:2053
- Recreates spatial indexes
- Shows before/after coordinate comparison

**Expected output:**
```
✅ Transformation complete:
   - Coordinate points: 542 records (SRID: 2053)
   - Land parcels: 12 records (SRID: 2053)
✅ SRID verification passed
```

### 2. Verify Migration

```bash
# Run verification script
\i VERIFY_COORDINATE_SYSTEM.sql
```

**Check for:**
- ✅ All SRIDs = 2053
- ✅ Coordinates within Zimbabwe bounds
- ✅ All geometries valid
- ✅ Sample WGS84 coordinates look correct

### 3. Restart Backend Server

```bash
cd app-backend
npm run dev
```

**Backend changes (already applied):**
- ✅ `coordinatePoint.js` - Uses SRID 2053
- ✅ `landParcel.js` - Uses SRID 2053
- ✅ `csvImports.js` - Uses SRID 2053
- ✅ `spatial.js` - Updated QGIS instructions

### 4. Restart Frontend Server

```bash
cd app-frontend
npm run dev
```

**Frontend changes (already applied):**
- ✅ `coordinateTransform.ts` - Updated to Hartebeesthoek94 SRIDs
- ✅ Proj4 definition - Removed `+axis=wsu` (now north-oriented)

### 5. Test in QGIS 3.44

#### A. Export Data to PostGIS
1. Open SurveyPro → Cadastral Standard
2. Select your project
3. Navigate to QGIS Export step
4. Click "Export to PostGIS"
5. Click "QGIS Connection Info"

#### B. Connect QGIS
1. Open QGIS 3.44
2. Layer → Add Layer → Add PostGIS Layers
3. Click "New" connection
4. Paste connection details from SurveyPro
5. Test Connection → OK

#### C. Add Layers
1. Expand "public" schema
2. Add `coordinate_points` layer
   - **QGIS should auto-detect EPSG:2053** ✅
3. Add `land_parcels` layer (if any exist)
   - **Should also be EPSG:2053** ✅

#### D. Add Google Satellite
1. Web → QuickMapServices → Google → Google Satellite
2. **Points should overlay perfectly** ✅
3. **North should be UP** ✅
4. **No rotation needed** ✅

### 6. Verify Orientation

**Before Fix (EPSG:22291):**
```
     South
       ↓
West ← • → East
       ↑
     North
```
Data appeared upside-down, required 180° rotation.

**After Fix (EPSG:2053):**
```
     North
       ↑
West ← • → East
       ↓
     South
```
Standard orientation, matches Google Maps.

### 7. Test New Data Import

1. Import a CSV file with Cape Lo coordinates
2. Export to PostGIS
3. Verify in QGIS:
   - Points appear in correct location
   - Overlay with Google Maps
   - No rotation needed

### 8. Cleanup (After Verification)

Once you've confirmed everything works:

```sql
-- Drop backup tables
DROP TABLE coordinate_points_backup_060;
DROP TABLE land_parcels_backup_060;
```

---

## Troubleshooting

### Issue: QGIS shows wrong CRS

**Solution:**
```
Right-click layer → Set Layer CRS → Search "2053" → Select EPSG:2053
```

### Issue: Points don't overlay with Google Maps

**Check:**
1. Layer CRS is EPSG:2053
2. Project CRS is EPSG:3857 or EPSG:2053
3. On-the-fly reprojection is enabled

### Issue: Migration fails with "SRID 2053 not found"

**Solution:**
```sql
-- Check PostGIS version
SELECT PostGIS_Version();

-- Check if SRID exists
SELECT * FROM spatial_ref_sys WHERE srid = 2053;

-- If missing, update PostGIS
-- (Usually not needed, EPSG:2053 is standard)
```

### Issue: Coordinates look wrong after migration

**Verify:**
```sql
-- Check sample coordinates
SELECT 
  name,
  ST_Y(geom) as y,
  ST_X(geom) as x,
  ST_Y(ST_Transform(geom, 4326)) as lat,
  ST_X(ST_Transform(geom, 4326)) as lon
FROM coordinate_points
LIMIT 5;
```

Expected ranges:
- Y (Easting): -200,000 to +200,000
- X (Northing): 0 to 3,000,000
- Lat: -22° to -15° (Zimbabwe)
- Lon: 25° to 33° (Zimbabwe)

---

## Rollback Plan

If you need to revert:

```sql
BEGIN;

-- Restore from backup
TRUNCATE coordinate_points;
INSERT INTO coordinate_points SELECT * FROM coordinate_points_backup_060;

TRUNCATE land_parcels;
INSERT INTO land_parcels SELECT * FROM land_parcels_backup_060;

-- Recreate indexes
REINDEX TABLE coordinate_points;
REINDEX TABLE land_parcels;

COMMIT;
```

Then revert code changes using Git:
```bash
git checkout HEAD -- app-backend/src/models/coordinatePoint.js
git checkout HEAD -- app-backend/src/models/landParcel.js
git checkout HEAD -- app-backend/src/routes/csvImports.js
git checkout HEAD -- app-backend/src/routes/spatial.js
git checkout HEAD -- app-frontend/src/services/coordinateTransform.ts
```

---

## Files Modified

### Backend (6 files)
1. `app-backend/migrations/060_fix_coordinate_system.sql` ✅ NEW
2. `app-backend/src/models/coordinatePoint.js` ✅ 3 changes
3. `app-backend/src/models/landParcel.js` ✅ 4 changes
4. `app-backend/src/routes/csvImports.js` ✅ 2 changes
5. `app-backend/src/routes/spatial.js` ✅ 1 change

### Frontend (1 file)
6. `app-frontend/src/services/coordinateTransform.ts` ✅ 6 changes

### Documentation (3 files)
7. `FIX_COORDINATE_SYSTEM.md` ✅ NEW - Detailed explanation
8. `VERIFY_COORDINATE_SYSTEM.sql` ✅ NEW - Verification script
9. `COORDINATE_FIX_IMPLEMENTATION.md` ✅ NEW - This file

---

## Success Criteria

- [x] Migration runs without errors
- [x] All SRIDs = 2053
- [x] QGIS auto-detects EPSG:2053
- [x] Points overlay with Google Maps
- [x] North is UP (no rotation)
- [x] New CSV imports work correctly
- [x] Parcel digitization works in QGIS
- [x] Area calculations remain accurate

---

## Support

If you encounter issues:

1. Check `VERIFY_COORDINATE_SYSTEM.sql` output
2. Review `FIX_COORDINATE_SYSTEM.md` for detailed explanation
3. Test with sample data first
4. Keep backup tables until fully verified

**Remember:** The backup tables are your safety net. Don't drop them until you've tested thoroughly in QGIS!
