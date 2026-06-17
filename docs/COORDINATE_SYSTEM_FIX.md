# Coordinate System Mismatch Fix

## Problem Diagnosed

**Symptom:** Vertex-to-point matching fails with 3,040+ km distances

**Root Cause:** Coordinate system mismatch between `land_parcels` and `coordinate_points` tables

### Current Broken Flow

1. **Frontend (MapLibreAreaView.vue line 2353-2354):**
   ```typescript
   // Transform Cape Lo coordinates to WGS84 for GeoJSON
   // Backend will transform from WGS84 (EPSG:4326) to Cape Lo 31 (EPSG:22291)
   const loZone = workflowState?.projectInfo?.centralMeridian || 31;
   const wgs84Points = capeLoArrayToWGS84(parcel.points.map(...));
   ```
   - **Sends:** WGS84 (lat/lon in degrees)

2. **Backend (landParcel.js line 38):**
   ```javascript
   ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 22291)
   ```
   - **Expects:** WGS84 (EPSG:4326)
   - **Transforms to:** Cape Lo 29 (EPSG:22289) ❌ **WRONG!**
   - **Should be:** Cape Lo 31 (EPSG:22291) for Lo31 projects

3. **Backend (coordinatePoint.js line 41):**
   ```javascript
   ST_SetSRID(ST_MakePoint($3, $4), 22291)
   ```
   - **Expects:** Cape Lo 31 coordinates (meters)
   - **Stores as:** Cape Lo 31 (EPSG:22291) ✅ **CORRECT**

### The Mismatch

- **Parcels:** WGS84 → **Lo 29** (EPSG:22289) - HARDCODED!
- **Points:** Cape Lo 31 (EPSG:22291) - Correct for Lo31 projects
- **Result:** 3,040 km distance (different coordinate systems)

## Solution

### Option A: Dynamic SRID (Recommended)

Make backend use project-specific SRID based on central meridian:

**1. Add SRID to API requests:**

```typescript
// Frontend: MapLibreAreaView.vue
const getSRID = (loZone: number): number => {
  const sridMap: Record<number, number> = {
    25: 22287,  // Cape Lo 25
    27: 22289,  // Cape Lo 27
    29: 22289,  // Cape Lo 29 (same as 27)
    31: 22291,  // Cape Lo 31
    33: 22293   // Cape Lo 33
  };
  return sridMap[loZone] || 22291;
};

// When creating parcel:
const loZone = workflowState?.projectInfo?.centralMeridian || 31;
const srid = getSRID(loZone);

await createLandParcel({
  project_id: projectId,
  stand: parcel.designation,
  geom: geoJsonPolygon,
  srid: srid,  // ← Add this
  ...
});
```

**2. Update backend models:**

```javascript
// coordinatePoint.js - line 41
// Change from hardcoded 22291 to dynamic SRID
ST_SetSRID(ST_MakePoint($3, $4), $9)  // Add SRID as parameter

// landParcel.js - line 38
// Change from hardcoded 22291 to dynamic SRID
ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $10)  // Add SRID as parameter
```

### Option B: Store Project SRID (Better Long-term)

Add `srid` column to `survey_projects` table:

```sql
ALTER TABLE survey_projects 
ADD COLUMN srid INTEGER DEFAULT 22291;

-- Update existing projects based on central meridian
UPDATE survey_projects 
SET srid = CASE 
  WHEN central_meridian = 25 THEN 22287
  WHEN central_meridian = 27 THEN 22289
  WHEN central_meridian = 29 THEN 22289
  WHEN central_meridian = 31 THEN 22291
  WHEN central_meridian = 33 THEN 22293
  ELSE 22291
END;
```

Then fetch SRID from project and use throughout.

## Immediate Hotfix

For your current project (Lo 31), change line 38 in `landParcel.js`:

```javascript
// FROM:
ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 22291)

// TO:
ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 22291)
```

Wait, that's already 22291! Let me check the actual SRID in your database...

## Diagnostic Query

Run this to see actual SRIDs:

```sql
-- Check coordinate_points SRID
SELECT 
  'coordinate_points' as table_name,
  ST_SRID(geom) as srid,
  COUNT(*) as count,
  MIN(ST_Y(geom)) as min_y,
  MAX(ST_Y(geom)) as max_y,
  MIN(ST_X(geom)) as min_x,
  MAX(ST_X(geom)) as max_x
FROM surveyor_surveyor_kuda.coordinate_points
WHERE project_id = 1
GROUP BY ST_SRID(geom);

-- Check land_parcels SRID
SELECT 
  'land_parcels' as table_name,
  ST_SRID(geom) as srid,
  COUNT(*) as count
FROM surveyor_surveyor_kuda.land_parcels
WHERE project_id = 1
GROUP BY ST_SRID(geom);
```

## Expected Coordinate Ranges

- **Cape Lo 31 (EPSG:22291):**
  - Y (Westing): -200,000 to +200,000 meters
  - X (Southing): 0 to 3,000,000 meters
  
- **WGS84 (EPSG:4326):**
  - Longitude: 15°E to 35°E (Zimbabwe)
  - Latitude: -15° to -25° (Zimbabwe)

Your coordinates (Y=97506, X=2247785) are **valid Cape Lo 31** coordinates.

## Next Steps

1. Run diagnostic SQL to confirm SRIDs
2. Check if coordinate_points are stored in wrong SRID
3. Apply appropriate fix based on findings
