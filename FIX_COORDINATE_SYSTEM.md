# Fix Coordinate System for QGIS/Google Maps Overlay

## Problem
Data stored in **EPSG:22291 (Cape Lo 31 - South Oriented)** displays upside-down in QGIS and doesn't overlay with Google Maps. You need to rotate QGIS 180° to see it correctly.

## Root Cause
Cape Lo 31 (EPSG:22291) is a **south-oriented** coordinate system where:
- **+axis=wsu** (Westing-Southing-Up)
- Y = Westing (west direction)
- X = Southing (south direction)
- Origin at equator, pointing south

This is incompatible with modern GIS tools that expect **north-oriented** systems.

## Solution: Use Hartebeesthoek94 Lo 31 (EPSG:2053)

Zimbabwe's modern official coordinate system is **Hartebeesthoek94 / Lo 31 (EPSG:2053)**:
- **North-oriented** (standard GIS orientation)
- Based on WGS84 datum (compatible with GPS/Google Maps)
- No rotation needed in QGIS
- Direct overlay with Google Maps satellite imagery

### Comparison

| Property | Cape Lo 31 (22291) | Hartebeesthoek94 Lo 31 (2053) |
|----------|-------------------|-------------------------------|
| **Orientation** | South (wsu) | North (enu) |
| **Datum** | Cape (Clarke 1880) | Hartebeesthoek94 (WGS84) |
| **QGIS Display** | Upside-down | Correct |
| **Google Maps** | No overlay | Perfect overlay |
| **GPS Compatible** | No (requires transformation) | Yes (direct) |
| **Modern Standard** | Legacy (pre-1999) | Current (1999+) |

## Implementation Steps

### Step 1: Update Database Schema

Create migration to change SRID from 22291 → 2053:

```sql
-- Migration: 060_fix_coordinate_system.sql
BEGIN;

-- 1. Update coordinate_points table
ALTER TABLE coordinate_points 
  ALTER COLUMN geom TYPE GEOMETRY(Point, 2053) 
  USING ST_Transform(geom, 2053);

-- 2. Update land_parcels table  
ALTER TABLE land_parcels 
  ALTER COLUMN geom TYPE GEOMETRY(Polygon, 2053)
  USING ST_Transform(geom, 2053);

-- 3. Recreate spatial indexes
DROP INDEX IF EXISTS coordinate_points_geom_idx;
DROP INDEX IF EXISTS land_parcels_geom_idx;

CREATE INDEX coordinate_points_geom_idx ON coordinate_points USING GIST(geom);
CREATE INDEX land_parcels_geom_idx ON land_parcels USING GIST(geom);

COMMIT;
```

### Step 2: Update Backend Code

**File: `app-backend/src/models/coordinatePoint.js`**

```javascript
// Line 41 - Change SRID from 22291 to 2053
VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 2053), $5, $6, $7, $8)

// Line 54 - Batch create
values.push(`($${paramIndex}, $${paramIndex+1}, ST_SetSRID(ST_MakePoint($${paramIndex+2}, $${paramIndex+3}), 2053), $${paramIndex+4}, $${paramIndex+5})`)

// Line 79 - Update
THEN ST_SetSRID(ST_MakePoint($2, $3), 2053)
```

**File: `app-backend/src/routes/csvImports.js`**

```javascript
// Line 465 - Update matched points
SET geom = ST_SetSRID(ST_MakePoint($1, $2), 2053),

// Line 529 - Insert new points
VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 2053), $5)
```

**File: `app-backend/src/models/landParcel.js`**

```javascript
// Line 38 - Create parcel (transform from WGS84 to 2053)
VALUES ($1, $2, $3, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 2053), $5, $6)

// Line 68 - Update parcel
updates.push(`geom = ST_SetSRID(ST_GeomFromGeoJSON($${paramIndex++}), 2053)`);

// Lines 252, 309 - Validation queries
SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 2053) as geom
```

### Step 3: Update Frontend Constants

**File: `app-frontend/src/services/coordinateTransform.ts`**

Update SRID constants:

```typescript
export const CAPE_LO_ZONES = {
  LO25: { 
    srid: 2051,  // Hartebeesthoek94 / Lo25
    centralMeridian: 25, 
    name: 'Hartebeesthoek94 Lo25',
    description: 'Zimbabwe Western Zone',
    coordinateRange: { y: [-200000, 200000], x: [0, 3000000] }
  },
  LO27: { 
    srid: 2052,  // Hartebeesthoek94 / Lo27
    centralMeridian: 27, 
    name: 'Hartebeesthoek94 Lo27',
    description: 'Zimbabwe Central Western Zone',
    coordinateRange: { y: [-200000, 200000], x: [0, 3000000] }
  },
  LO29: { 
    srid: 2054,  // Hartebeesthoek94 / Lo29
    centralMeridian: 29, 
    name: 'Hartebeesthoek94 Lo29',
    description: 'Zimbabwe Central Zone',
    coordinateRange: { y: [-200000, 200000], x: [0, 3000000] }
  },
  LO31: { 
    srid: 2053,  // Hartebeesthoek94 / Lo31 (MOST COMMON)
    centralMeridian: 31, 
    name: 'Hartebeesthoek94 Lo31',
    description: 'Zimbabwe Central Eastern Zone',
    coordinateRange: { y: [-200000, 200000], x: [0, 3000000] }
  },
  LO33: { 
    srid: 2055,  // Hartebeesthoek94 / Lo33
    centralMeridian: 33, 
    name: 'Hartebeesthoek94 Lo33',
    description: 'Zimbabwe Eastern Zone',
    coordinateRange: { y: [-200000, 200000], x: [0, 3000000] }
  }
}

// Update Proj4 definition - REMOVE +axis=wsu (north-oriented by default)
export const CAPE_LO_PROJ4_DEF = (centralMeridian: number) => 
  `+proj=tmerc +lat_0=0 +lon_0=${centralMeridian} +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`
```

### Step 4: Update QGIS Connection Instructions

**File: `app-backend/src/routes/spatial.js` (Line 672)**

```javascript
'🎯 STEP 4: CONFIGURE LAYERS',
'  • Set CRS to EPSG:2053 (Hartebeesthoek94 / Lo31)',  // Changed from 22291
'  • Enable labels on coordinate_points layer',
```

## Data Migration Strategy

### Option A: Transform Existing Data (Recommended)

If you have existing data in EPSG:22291, PostgreSQL can transform it automatically:

```sql
-- Check current SRID
SELECT DISTINCT ST_SRID(geom) FROM coordinate_points;
SELECT DISTINCT ST_SRID(geom) FROM land_parcels;

-- Transform data
UPDATE coordinate_points 
SET geom = ST_Transform(geom, 2053);

UPDATE land_parcels 
SET geom = ST_Transform(geom, 2053);
```

### Option B: Re-import CSV Data

If your CSV files contain the original Cape Lo coordinates:

1. The coordinates in CSV are still valid (they're just numbers)
2. Update backend code to use SRID 2053
3. Delete existing points: `DELETE FROM coordinate_points WHERE project_id = X`
4. Re-import CSV through SurveyPro interface
5. Points will be stored with correct SRID 2053

## Verification in QGIS

After implementing the fix:

1. **Add PostGIS Layer**
   - Connect to database
   - Add `coordinate_points` and `land_parcels`
   - QGIS should auto-detect EPSG:2053

2. **Add Google Satellite Layer**
   - Install QuickMapServices plugin
   - Add Google Satellite
   - Should be in EPSG:3857 (Web Mercator)

3. **Enable On-The-Fly Reprojection**
   - Project → Properties → CRS
   - Set to EPSG:2053 or EPSG:3857
   - Both layers should overlay perfectly

4. **Verify Orientation**
   - North should be UP
   - No 180° rotation needed
   - Points should match Google Maps locations

## Expected Results

✅ **Before Fix (EPSG:22291)**
- Data appears upside-down in QGIS
- Requires 180° rotation
- No Google Maps overlay
- South-oriented axes

✅ **After Fix (EPSG:2053)**
- Data displays correctly (north = up)
- No rotation needed
- Perfect Google Maps overlay
- Standard GIS orientation
- GPS coordinates work directly

## Files to Modify

### Backend
1. `app-backend/migrations/060_fix_coordinate_system.sql` (NEW)
2. `app-backend/src/models/coordinatePoint.js` (4 changes)
3. `app-backend/src/models/landParcel.js` (4 changes)
4. `app-backend/src/routes/csvImports.js` (2 changes)
5. `app-backend/src/routes/spatial.js` (1 change - instructions)

### Frontend
6. `app-frontend/src/services/coordinateTransform.ts` (SRID constants + Proj4 def)

## Testing Checklist

- [ ] Run migration 060
- [ ] Verify SRID changed: `SELECT ST_SRID(geom) FROM coordinate_points LIMIT 1`
- [ ] Export test project to PostGIS
- [ ] Open in QGIS 3.44
- [ ] Add Google Satellite layer
- [ ] Verify points overlay correctly
- [ ] Verify no rotation needed
- [ ] Test parcel digitization
- [ ] Verify new parcels have SRID 2053

## Rollback Plan

If issues occur:

```sql
-- Rollback to EPSG:22291
BEGIN;

ALTER TABLE coordinate_points 
  ALTER COLUMN geom TYPE GEOMETRY(Point, 22291) 
  USING ST_Transform(geom, 22291);

ALTER TABLE land_parcels 
  ALTER COLUMN geom TYPE GEOMETRY(Polygon, 22291)
  USING ST_Transform(geom, 22291);

COMMIT;
```

## References

- **EPSG:2053**: https://epsg.io/2053 (Hartebeesthoek94 / Lo31)
- **EPSG:22291**: https://epsg.io/22291 (Cape / Lo31 - Deprecated)
- Zimbabwe Survey Standards: Use Hartebeesthoek94 datum (1999+)
- QGIS Documentation: https://docs.qgis.org/3.44/en/docs/user_manual/working_with_projections/

## Support

If you encounter issues:
1. Check PostgreSQL has PostGIS extension: `SELECT PostGIS_Version();`
2. Verify SRID exists: `SELECT * FROM spatial_ref_sys WHERE srid = 2053;`
3. Check QGIS CRS settings: Project → Properties → CRS
4. Enable QGIS debugging: Settings → Options → CRS → Log CRS operations
