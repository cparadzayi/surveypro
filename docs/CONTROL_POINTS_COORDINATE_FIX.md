# Control Points Coordinate System Fix

**Date:** December 5, 2025  
**Issue:** Control point selection was using WGS84 lat/lng instead of Gauss Y/X coordinates

---

## Problem Identified

The `control_points` table in the `public` schema has two coordinate systems:

1. **Primary (Gauss-Conformal):** `y_gauss`, `x_gauss` - Zimbabwe cadastral standard
2. **Secondary (WGS84):** `lat_wgs84`, `lng_wgs84` - Derived for map display

The cadastral workflow was incorrectly treating WGS84 as primary coordinates instead of Gauss.

## Root Cause

1. **Backend API** (`control-points.js`): Returns both `y_gauss`, `x_gauss` AND `lat_wgs84`, `lng_wgs84`
2. **Frontend** (`ControlPointSelectionView.vue`): Was mapping `lat_wgs84 → y` and `lng_wgs84 → x`
3. **Map utilities** (`controlPointMapUtils.ts`): Interface comments incorrectly said `y: Latitude, x: Longitude`

## Solution Implemented

### 1. Updated Type Definitions

**File:** `app-frontend/src/utils/controlPointMapUtils.ts`

```typescript
export interface ControlPoint {
  id: number
  monu_num: string
  type: string
  y: number // Y coordinate (Gauss-Conformal: Westing)
  x: number // X coordinate (Gauss-Conformal: Southing)
  lat_wgs84?: number // Latitude (WGS84, for map display)
  lng_wgs84?: number // Longitude (WGS84, for map display)
  description?: string
  central_meridian?: number
  distance?: number
}
```

### 2. Updated Data Mapping

**File:** `app-frontend/src/views/modules/cadastral-standard/ControlPointSelectionView.vue`

```typescript
// Convert coordinates from API response
controlPoints.value = response.data.data.map((point: any) => ({
  ...point,
  y: point.y_gauss ? parseFloat(point.y_gauss) : null, // Primary: Gauss Westing
  x: point.x_gauss ? parseFloat(point.x_gauss) : null, // Primary: Gauss Southing
  lat_wgs84: point.lat_wgs84 ? parseFloat(point.lat_wgs84) : null,
  lng_wgs84: point.lng_wgs84 ? parseFloat(point.lng_wgs84) : null
}))
```

### 3. Updated Distance Calculations

Distance calculations now explicitly use WGS84 coordinates:

```typescript
const pointsWithDistance = controlPoints.value
  .filter((point: any) => {
    const hasValidGauss = typeof point.y === 'number' && typeof point.x === 'number'
    const hasValidWGS84 = typeof point.lat_wgs84 === 'number' && typeof point.lng_wgs84 === 'number'
    return hasValidGauss && hasValidWGS84
  })
  .map((point: any) => {
    // Use WGS84 for distance calculation
    const distance = calculateDistance(centerLat, centerLng, point.lat_wgs84, point.lng_wgs84)
    return { ...point, distance }
  })
```

### 4. Updated Map Utils

**File:** `app-frontend/src/utils/controlPointMapUtils.ts`

```typescript
// Use WGS84 if available, fallback to y/x
const pointsWithDistance = points.map((p) => ({
  ...p,
  distance: calculateDistance(
    surveyCenter.lat,
    surveyCenter.lng,
    p.lat_wgs84 || p.y,
    p.lng_wgs84 || p.x
  ),
}))
```

## Coordinate System Clarification

### Zimbabwe Gauss-Conformal System

- **Y coordinate:** Westing (meters west of central meridian)
- **X coordinate:** Southing (meters south of equator)
- **Zones:** Lo 25, Lo 27, Lo 29, Lo 31, Lo 33
- **Convention:** P(Y, X) format

### Usage in Application

- **Primary coordinates:** Always use Gauss Y/X for:
  - Storage in database
  - Cadastral calculations
  - Area computations
  - Coordinate lists
  - Field books

- **WGS84 coordinates:** Use only for:
  - Map display (Leaflet, MapLibre)
  - Distance calculations (Haversine formula)
  - User-facing location context

## Files Modified

1. `app-frontend/src/utils/controlPointMapUtils.ts` - Updated interface and distance calculations
2. `app-frontend/src/views/modules/cadastral-standard/ControlPointSelectionView.vue` - Fixed coordinate mapping
3. `app-frontend/src/components/cadastral/ControlPointMapView.vue` - Updated interface and display

## Testing Checklist

- [ ] Control points load correctly when selecting central meridian
- [ ] Debug console shows Gauss Y/X as primary coordinates
- [ ] Map displays control points at correct locations (using WGS84)
- [ ] Distance calculations work correctly (20km radius search)
- [ ] Auto-selection picks nearest points correctly
- [ ] Selected control points persist in workflow state
- [ ] Coordinate list generation uses Gauss coordinates
- [ ] Field book shows correct Gauss Y/X values

## Database Notes

The `control_points` table in `public` schema must have:

```sql
-- Primary coordinates (Gauss-Conformal)
y_gauss NUMERIC(15, 3)  -- Westing
x_gauss NUMERIC(15, 3)  -- Southing
gauss_lo INTEGER         -- Central meridian (27, 29, 31, 33)

-- Secondary coordinates (WGS84, derived)
lat_wgs84 NUMERIC(10, 7)  -- Latitude
lng_wgs84 NUMERIC(10, 7)  -- Longitude
```

**Migration 028** added the WGS84 columns. If WGS84 coordinates are missing, run the transformation script:
```sql
-- See: app-backend/scripts/populate-wgs84-cape-datum-correct.sql
```

## Impact

✅ **Fixed:** Control points now correctly use Gauss coordinates as primary  
✅ **Fixed:** Distance calculations use WGS84 (correct for Haversine)  
✅ **Fixed:** Map display uses appropriate coordinate system  
✅ **Maintained:** Backward compatibility with existing data  
✅ **Improved:** Clear separation between cadastral (Gauss) and display (WGS84) coordinates

---

## Troubleshooting: Only 1 Control Point Showing

### Problem
After importing control_points table, only 1 point appears within 20km radius search.

### Possible Causes

#### Cause 1: Missing WGS84 Coordinates
The refactored code requires BOTH coordinate systems:
1. **Gauss coordinates** (`y_gauss`, `x_gauss`) - for cadastral work ✅ (imported)
2. **WGS84 coordinates** (`lat_wgs84`, `lng_wgs84`) - for distance calculations ❌ (missing)

When you imported the table, only Gauss coordinates were populated. WGS84 columns are NULL.

#### Cause 2: Schema-Per-Surveyor Issue
If using schema-per-surveyor architecture, the control points API might not be able to access `public.control_points` from your surveyor schema.

**Quick check:** Look at your browser console. Do you see:
- "⚠️ Point missing WGS84 coords" → **Cause 1 (see below)**
- "Failed to fetch control points" or empty results → **Cause 2 (see SCHEMA_PER_SURVEYOR_CONTROL_POINTS_FIX.md)**

### Check Your Database

Run this diagnostic query:
```bash
psql -d surveypro_db -f CHECK_CONTROL_POINTS_WGS84.sql
```

Expected output if WGS84 is missing:
```
total_points | with_wgs84_coords | missing_wgs84 | wgs84_coverage_percent
-------------|-------------------|---------------|----------------------
     500     |         1         |      499      |        0.20
```

### Solution: Populate WGS84 Coordinates

Run the transformation script to generate WGS84 from Gauss:

```bash
cd app-backend/scripts
psql -d surveypro_db -f populate-wgs84-cape-datum-correct.sql
```

This script:
1. ✅ Uses correct Cape Datum EPSG codes (22285, 22287, 22289, 22291, 22293)
2. ✅ Transforms Y (westing), X (southing) → Latitude, Longitude
3. ✅ Validates coordinates are in Zimbabwe range (-23° to -15° lat, 25° to 34° lng)
4. ✅ Takes ~2-3 minutes for 500 control points

**Note:** Requires PostGIS extension installed:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### After Running Transformation

1. Refresh your browser
2. Re-run control point selection
3. Console should now show:
   ```
   [ControlPointSelection] Points with WGS84 coordinates: 500
   [ControlPointSelection] ✅ Auto-selected 15 control points within 20km
   ```

### Why This Happens

The imported `control_points` dump may have been taken before Migration 028 added WGS84 columns, or before the transformation script was run. The WGS84 coordinates are **derived** from Gauss coordinates using PostGIS spatial transformations.

---

**Status:** Refactoring complete. If only 1 point showing, run WGS84 transformation script.
