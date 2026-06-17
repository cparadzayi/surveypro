# 🔧 Control Point Selection Fix

**Issue:** Auto-selection not finding control points within 50km of Zvishavane  
**Root Cause:** Coordinate system mismatch  
**Date:** November 23, 2025

---

## ⚡ **QUICK START - ALL LO ZONES**

**For a comprehensive solution that handles ALL Zimbabwe Lo zones (25, 27, 29, 31, 33):**

👉 **See:** `WGS84_CONVERSION_ALL_ZONES.md`

**Quick command:**
```bash
cd app-backend
scripts\populate-wgs84-all-zones.bat
```

This will convert ALL control points in your database automatically!

---

## 🐛 Problem Analysis

### **The Issue**
The control point auto-selection routine is not finding any control points within 50km of the survey center, even though control points exist in the area (e.g., Zvishavane).

### **Root Cause**
The control points are stored in **Gauss-Conformal coordinates** (y_gauss, x_gauss in meters), but the auto-selection code is treating these as **WGS84 lat/lng coordinates** (decimal degrees).

**Code Location:** `ControlPointSelectionView.vue` line 381
```typescript
distance: calculateDistance(centerLat, centerLng, point.y, point.x)
```

This calculates Haversine distance assuming `point.y` and `point.x` are lat/lng, but they are actually Gauss-Conformal projected coordinates.

### **Why This Fails**
- **Gauss-Conformal coordinates** are in meters (e.g., y=2,500,000m, x=500,000m)
- **WGS84 coordinates** are in degrees (e.g., lat=-20.33°, lng=30.07°)
- Haversine formula expects degrees, not meters
- Result: Incorrect distance calculations, no points found

---

## ✅ Solution Options

### **Option 1: Add WGS84 Coordinates to Database (RECOMMENDED)**

**Pros:**
- ✅ Clean separation of coordinate systems
- ✅ Fast queries (no conversion overhead)
- ✅ Supports future spatial queries
- ✅ Industry standard

**Cons:**
- ⚠️ Requires coordinate transformation
- ⚠️ Need to populate existing data

**Implementation:**
1. Add `lat_wgs84` and `lng_wgs84` columns (Migration 028 - created)
2. Transform Gauss coordinates to WGS84
3. Update API to return WGS84 coordinates
4. Update frontend to use WGS84 coordinates

---

### **Option 2: Convert Coordinates in Backend API**

**Pros:**
- ✅ No database changes needed
- ✅ Works with existing data

**Cons:**
- ❌ Conversion overhead on every request
- ❌ More complex API code
- ❌ Harder to maintain

---

### **Option 3: Use Projected Distance Calculation**

**Pros:**
- ✅ No coordinate conversion needed
- ✅ Works with existing data

**Cons:**
- ❌ More complex distance formula
- ❌ Less accurate over long distances
- ❌ Requires survey center in Gauss coordinates

---

## 🚀 Recommended Fix (Option 1)

### **Step 1: Run Migration**

Migration 028 has been created to add WGS84 columns:

```bash
# Migration will run automatically on next server start
# Or manually run:
cd app-backend
npm start
```

**Migration adds:**
- `lat_wgs84 NUMERIC(10, 7)` - Latitude in decimal degrees
- `lng_wgs84 NUMERIC(10, 7)` - Longitude in decimal degrees
- Indexes for spatial queries

---

### **Step 2: Transform Coordinates**

You need to convert existing Gauss-Conformal coordinates to WGS84.

**Option A: Use QGIS (Recommended)**

1. Export control points to CSV:
   ```sql
   COPY (SELECT id, monu_num, gauss_lo, y_gauss, x_gauss FROM control_points) 
   TO 'C:/temp/control_points_gauss.csv' WITH CSV HEADER;
   ```

2. Open in QGIS:
   - Layer → Add Layer → Add Delimited Text Layer
   - Select CSV file
   - Geometry: Point coordinates
   - X field: `x_gauss`
   - Y field: `y_gauss`
   - CRS: **Hartebeesthoek94 / Lo{zone}** (e.g., EPSG:2048 for Lo31)

3. Reproject to WGS84:
   - Right-click layer → Export → Save Features As
   - Format: CSV
   - CRS: **EPSG:4326 (WGS84)**
   - Geometry: AS_XY
   - Save as: `control_points_wgs84.csv`

4. Import WGS84 coordinates:
   ```sql
   -- Create temp table
   CREATE TEMP TABLE temp_wgs84 (
     id INTEGER,
     monu_num VARCHAR(20),
     lng_wgs84 NUMERIC(10, 7),
     lat_wgs84 NUMERIC(10, 7)
   );
   
   -- Import CSV
   COPY temp_wgs84 FROM 'C:/temp/control_points_wgs84.csv' WITH CSV HEADER;
   
   -- Update control_points
   UPDATE control_points cp
   SET 
     lat_wgs84 = t.lat_wgs84,
     lng_wgs84 = t.lng_wgs84
   FROM temp_wgs84 t
   WHERE cp.id = t.id;
   
   -- Verify
   SELECT COUNT(*) FROM control_points WHERE lat_wgs84 IS NOT NULL;
   ```

**Option B: Use PostGIS (If Available)**

```sql
-- Install PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geometry column
ALTER TABLE control_points ADD COLUMN IF NOT EXISTS geom_gauss GEOMETRY(Point, 2048);
ALTER TABLE control_points ADD COLUMN IF NOT EXISTS geom_wgs84 GEOMETRY(Point, 4326);

-- Populate Gauss geometry (example for Lo31 - EPSG:2048)
UPDATE control_points
SET geom_gauss = ST_SetSRID(ST_MakePoint(x_gauss, y_gauss), 2048)
WHERE gauss_lo = 31;

-- Transform to WGS84
UPDATE control_points
SET geom_wgs84 = ST_Transform(geom_gauss, 4326)
WHERE geom_gauss IS NOT NULL;

-- Extract lat/lng
UPDATE control_points
SET 
  lat_wgs84 = ST_Y(geom_wgs84),
  lng_wgs84 = ST_X(geom_wgs84)
WHERE geom_wgs84 IS NOT NULL;

-- Verify
SELECT monu_num, lat_wgs84, lng_wgs84 FROM control_points LIMIT 10;
```

**Option C: Use Online Conversion Tool**

1. Export control points
2. Use coordinate converter (e.g., https://epsg.io/transform)
3. Convert from Hartebeesthoek94/Lo{zone} to WGS84
4. Import results

---

### **Step 3: Update Backend API**

Update the control points API to return WGS84 coordinates:

**File:** `app-backend/src/routes/control-points.js`

```javascript
// In the GET / endpoint (line 97-116), update SELECT:
const dataQuery = `
  SELECT 
    id, monu_num, monu_name, type, comp_sheet, topo,
    gauss_lo, y_gauss, x_gauss, 
    lat_wgs84, lng_wgs84,  -- ADD THIS LINE
    msl_hgt, ped_hgt, pill_hgt,
    top_signal, bot_signal, last_insp, deg_sqr, remark, area_nm,
    created_at, updated_at
  FROM control_points
  ${whereClause}
  ORDER BY 
    CASE type 
      WHEN 'PRIM' THEN 1 
      WHEN 'SEC' THEN 2 
      WHEN 'TERT' THEN 3 
      WHEN 'QUART' THEN 4 
      WHEN 'TSM' THEN 5 
      ELSE 6 
    END,
    monu_num
  LIMIT $${paramIndex++} OFFSET $${paramIndex++}
`;
```

---

### **Step 4: Update Frontend Code**

Update the auto-selection routine to use WGS84 coordinates:

**File:** `app-frontend/src/views/modules/cadastral-standard/ControlPointSelectionView.vue`

**Change line 381 from:**
```typescript
distance: calculateDistance(centerLat, centerLng, point.y, point.x)
```

**To:**
```typescript
distance: calculateDistance(centerLat, centerLng, point.lat_wgs84, point.lng_wgs84)
```

**Also update line 397 for logging:**
```typescript
console.log(`  ${i + 1}. ${p.monu_num} (${p.lat_wgs84?.toFixed(4)}, ${p.lng_wgs84?.toFixed(4)}) - ${p.distance.toFixed(2)}km away`)
```

---

### **Step 5: Add Validation**

Add validation to skip control points without WGS84 coordinates:

```typescript
// In autoSelectNearbyPoints function, after line 378:
const pointsWithDistance = controlPoints.value
  .filter(point => point.lat_wgs84 && point.lng_wgs84) // Skip points without WGS84
  .map(point => ({
    ...point,
    distance: calculateDistance(centerLat, centerLng, point.lat_wgs84, point.lng_wgs84)
  }))
```

---

## 🧪 Testing

### **Test Data for Zvishavane**

Zvishavane is approximately at:
- **WGS84:** -20.33° S, 30.07° E
- **Gauss Lo31:** Y ≈ 2,250,000m, X ≈ 550,000m

**Expected Control Points Nearby:**
- Check for trig beacons within 50km
- Should find several PRIM/SEC beacons

### **Test Procedure**

1. **Verify WGS84 coordinates populated:**
   ```sql
   SELECT monu_num, monu_name, area_nm, lat_wgs84, lng_wgs84 
   FROM control_points 
   WHERE area_nm ILIKE '%zvishavane%' 
   OR deg_sqr LIKE '2030%';
   ```

2. **Test API response:**
   ```bash
   curl "http://localhost:3050/api/control-points?gauss_lo=31&limit=10"
   # Should include lat_wgs84 and lng_wgs84 fields
   ```

3. **Test auto-selection:**
   - Import CSV with survey points near Zvishavane
   - Go to Control Point Selection step
   - Set radius to 50km
   - Click "Re-run Auto-Selection"
   - Should find control points

4. **Verify distance calculations:**
   - Check console logs for distance values
   - Should show realistic distances (e.g., 10-50km)
   - Not astronomical numbers (which indicate coordinate mismatch)

---

## 📊 Expected Results

### **Before Fix:**
```
[ControlPointSelection] ⚠️ No control points found within 50km radius
```

### **After Fix:**
```
[ControlPointSelection] ✅ Auto-selected 8 control points within 50km
[ControlPointSelection] Nearest 5 points:
  1. ZW123 (Zvishavane TRIG) - 5.23km away
  2. ZW456 (Shabani SEC) - 12.45km away
  3. ZW789 (Buchwa TRIG) - 18.67km away
  4. ZW012 (Mashaba SEC) - 25.34km away
  5. ZW345 (Runde TERT) - 32.12km away
```

---

## ⚠️ Important Notes

### **Coordinate System Reference**

Zimbabwe uses **Hartebeesthoek94** datum with Gauss-Conformal projection:
- **Lo27:** EPSG:2046 (Western zone)
- **Lo29:** EPSG:2047 (West-central zone)
- **Lo31:** EPSG:2048 (East-central zone) - **Most common**
- **Lo33:** EPSG:2049 (Eastern zone)

### **Data Quality**

- Ensure coordinate transformation uses correct Lo zone
- Verify transformed coordinates are reasonable for Zimbabwe
- Zimbabwe latitude: approximately -15° to -23° S
- Zimbabwe longitude: approximately 25° to 33° E

### **Performance**

- WGS84 columns are indexed for fast queries
- Distance calculations are client-side (no database overhead)
- Consider adding spatial index if using PostGIS

---

## 🔄 Alternative Quick Fix (Temporary)

If you can't transform coordinates immediately, you can use a **temporary workaround**:

### **Use Approximate Conversion**

For Zimbabwe Lo31 zone, approximate conversion:
```typescript
// TEMPORARY - NOT ACCURATE
function gaussToWGS84Approx(y_gauss: number, x_gauss: number) {
  // Very rough approximation for Lo31 zone
  const lat = -20.0 + (y_gauss - 2250000) / 111000
  const lng = 31.0 + (x_gauss - 500000) / 111000
  return { lat, lng }
}
```

**⚠️ WARNING:** This is NOT accurate and should only be used for testing!

---

## 📝 Summary

**Problem:** Coordinate system mismatch (Gauss vs WGS84)  
**Solution:** Add WGS84 columns and transform coordinates  
**Files Changed:**
- Migration 028 (database schema)
- `control-points.js` (API response)
- `ControlPointSelectionView.vue` (distance calculation)

**Time Required:** 30-60 minutes  
**Difficulty:** Medium (requires coordinate transformation)  
**Impact:** High (fixes critical feature)

---

**Once implemented, the auto-selection will work correctly!** 🎯
