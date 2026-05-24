# 🗺️ Control Point WGS84 Setup Guide

**Quick guide to add WGS84 coordinates to control points**

---

## ⚡ Quick Start

### **Step 1: Run Migration**

The migration has been created. Just restart your backend:

```bash
cd app-backend
npm start
```

Watch for:
```
[INFO] Migration 028.do.sql - SUCCESS
```

This adds `lat_wgs84` and `lng_wgs84` columns to the `control_points` table.

---

### **Step 2: Check Current Data**

```sql
-- Connect to database
psql -h localhost -U postgres -d surveypro_v1

-- Check how many control points you have
SELECT COUNT(*) FROM control_points;

-- Check if any have WGS84 coordinates already
SELECT COUNT(*) FROM control_points WHERE lat_wgs84 IS NOT NULL;

-- View sample control points
SELECT monu_num, monu_name, gauss_lo, y_gauss, x_gauss, lat_wgs84, lng_wgs84 
FROM control_points 
LIMIT 10;
```

---

## 🔧 Option 1: Use PostGIS (RECOMMENDED)

If you have PostGIS installed, this is the easiest method:

```sql
-- Install PostGIS extension (if not already installed)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geometry columns
ALTER TABLE control_points 
  ADD COLUMN IF NOT EXISTS geom_gauss GEOMETRY(Point, 2048),
  ADD COLUMN IF NOT EXISTS geom_wgs84 GEOMETRY(Point, 4326);

-- Populate Gauss geometry for Lo31 (EPSG:2048)
-- Note: Adjust SRID based on your Lo zone:
-- Lo27 = EPSG:2046, Lo29 = EPSG:2047, Lo31 = EPSG:2048, Lo33 = EPSG:2049
UPDATE control_points
SET geom_gauss = ST_SetSRID(ST_MakePoint(x_gauss, y_gauss), 2048)
WHERE gauss_lo = 31 AND x_gauss IS NOT NULL AND y_gauss IS NOT NULL;

-- Transform to WGS84
UPDATE control_points
SET geom_wgs84 = ST_Transform(geom_gauss, 4326)
WHERE geom_gauss IS NOT NULL;

-- Extract lat/lng to dedicated columns
UPDATE control_points
SET 
  lat_wgs84 = ST_Y(geom_wgs84),
  lng_wgs84 = ST_X(geom_wgs84)
WHERE geom_wgs84 IS NOT NULL;

-- Verify results
SELECT 
  monu_num, 
  gauss_lo,
  y_gauss, 
  x_gauss, 
  lat_wgs84, 
  lng_wgs84,
  ST_AsText(geom_wgs84) as wgs84_point
FROM control_points 
WHERE lat_wgs84 IS NOT NULL
LIMIT 10;

-- Check counts
SELECT 
  gauss_lo,
  COUNT(*) as total,
  COUNT(lat_wgs84) as with_wgs84
FROM control_points
GROUP BY gauss_lo
ORDER BY gauss_lo;
```

**Expected Results:**
- Zvishavane area: lat ≈ -20.33°, lng ≈ 30.07°
- Zimbabwe range: lat -15° to -23°, lng 25° to 33°

---

## 🔧 Option 2: Use QGIS

If you don't have PostGIS, use QGIS:

### **A. Export Control Points**

```sql
-- Export to CSV
COPY (
  SELECT id, monu_num, monu_name, gauss_lo, y_gauss, x_gauss 
  FROM control_points 
  WHERE y_gauss IS NOT NULL AND x_gauss IS NOT NULL
) TO 'C:/temp/control_points_gauss.csv' WITH CSV HEADER;
```

### **B. Transform in QGIS**

1. **Open QGIS**

2. **Add CSV Layer:**
   - Layer → Add Layer → Add Delimited Text Layer
   - File: `C:/temp/control_points_gauss.csv`
   - Geometry Definition: Point coordinates
   - X field: `x_gauss`
   - Y field: `y_gauss`
   - Geometry CRS: **Hartebeesthoek94 / Lo31** (EPSG:2048)
   - Click Add

3. **Reproject to WGS84:**
   - Right-click layer → Export → Save Features As
   - Format: CSV
   - File name: `C:/temp/control_points_wgs84.csv`
   - CRS: **EPSG:4326 (WGS84)**
   - Geometry: AS_XY
   - Layer Options → GEOMETRY: AS_XY
   - Click OK

4. **Import WGS84 Coordinates:**

```sql
-- Create temp table
CREATE TEMP TABLE temp_wgs84 (
  id INTEGER,
  monu_num VARCHAR(20),
  monu_name VARCHAR(100),
  gauss_lo INTEGER,
  y_gauss NUMERIC,
  x_gauss NUMERIC,
  lng_wgs84 NUMERIC(10, 7),
  lat_wgs84 NUMERIC(10, 7)
);

-- Import CSV (QGIS exports as lng, lat order)
COPY temp_wgs84 FROM 'C:/temp/control_points_wgs84.csv' WITH CSV HEADER;

-- Update control_points table
UPDATE control_points cp
SET 
  lat_wgs84 = t.lat_wgs84,
  lng_wgs84 = t.lng_wgs84
FROM temp_wgs84 t
WHERE cp.id = t.id;

-- Verify
SELECT COUNT(*) FROM control_points WHERE lat_wgs84 IS NOT NULL;

-- Check sample
SELECT monu_num, lat_wgs84, lng_wgs84 FROM control_points LIMIT 10;
```

---

## 🔧 Option 3: Manual Sample Data (For Testing)

If you just want to test with a few points near Zvishavane:

```sql
-- Add sample WGS84 coordinates for testing
-- These are approximate values for demonstration

-- Example: Zvishavane area control points
UPDATE control_points
SET 
  lat_wgs84 = -20.33,
  lng_wgs84 = 30.07
WHERE monu_num = 'ZW123' OR area_nm ILIKE '%zvishavane%';

-- Example: Shabani area
UPDATE control_points
SET 
  lat_wgs84 = -20.25,
  lng_wgs84 = 30.15
WHERE area_nm ILIKE '%shabani%';

-- Verify
SELECT monu_num, monu_name, area_nm, lat_wgs84, lng_wgs84 
FROM control_points 
WHERE lat_wgs84 IS NOT NULL;
```

**⚠️ Note:** These are approximate values for testing only. Use PostGIS or QGIS for accurate coordinates.

---

## ✅ Verification

After populating WGS84 coordinates:

### **1. Database Check**

```sql
-- Check coverage
SELECT 
  COUNT(*) as total_points,
  COUNT(lat_wgs84) as points_with_wgs84,
  ROUND(100.0 * COUNT(lat_wgs84) / COUNT(*), 2) as coverage_percent
FROM control_points;

-- Check by zone
SELECT 
  gauss_lo,
  COUNT(*) as total,
  COUNT(lat_wgs84) as with_wgs84
FROM control_points
GROUP BY gauss_lo
ORDER BY gauss_lo;

-- Check Zvishavane area
SELECT 
  monu_num, 
  monu_name, 
  area_nm,
  lat_wgs84, 
  lng_wgs84
FROM control_points 
WHERE 
  lat_wgs84 BETWEEN -21 AND -20 
  AND lng_wgs84 BETWEEN 29.5 AND 30.5
ORDER BY monu_num;
```

### **2. API Test**

```bash
# Test API returns WGS84 coordinates
curl "http://localhost:3050/api/control-points?gauss_lo=31&limit=5"

# Should see lat_wgs84 and lng_wgs84 in response
```

### **3. Frontend Test**

1. Start backend and frontend
2. Go to Control Point Selection step
3. Open browser console
4. Click "Re-run Auto-Selection"
5. Check console logs:

**Expected:**
```
[ControlPointSelection] Total control points available: 150
[ControlPointSelection] Points with WGS84 coordinates: 150
[ControlPointSelection] ✅ Auto-selected 8 control points within 50km
[ControlPointSelection] Nearest 5 points:
  1. ZW123 (-20.3300°, 30.0700°) - 5.23km away
  2. ZW456 (-20.2500°, 30.1500°) - 12.45km away
  ...
```

**If you see:**
```
[ControlPointSelection] ⚠️ 150 control points skipped (missing WGS84 coordinates)
[ControlPointSelection] Points with WGS84 coordinates: 0
```

Then WGS84 coordinates are not populated yet.

---

## 🎯 Expected Coordinates for Zimbabwe

### **Major Cities (WGS84)**

| Location | Latitude | Longitude | Lo Zone |
|----------|----------|-----------|---------|
| Harare | -17.83° | 31.05° | Lo31 |
| Bulawayo | -20.15° | 28.58° | Lo29 |
| Zvishavane | -20.33° | 30.07° | Lo31 |
| Gweru | -19.45° | 29.82° | Lo29 |
| Mutare | -18.97° | 32.67° | Lo33 |
| Masvingo | -20.07° | 30.83° | Lo31 |

### **Validation Ranges**

- **Latitude:** -15° to -23° (South)
- **Longitude:** 25° to 33° (East)

If your coordinates are outside these ranges, something is wrong!

---

## 🆘 Troubleshooting

### **PostGIS Not Installed**

```bash
# Install PostGIS (Windows with PostgreSQL)
# Download from: https://postgis.net/windows_downloads/
# Or use Stack Builder (comes with PostgreSQL installer)
```

### **Wrong SRID**

Make sure you use the correct SRID for your Lo zone:
- Lo27: EPSG:2046
- Lo29: EPSG:2047
- Lo31: EPSG:2048 (most common)
- Lo33: EPSG:2049

### **Coordinates Look Wrong**

```sql
-- Check a sample point
SELECT 
  monu_num,
  gauss_lo,
  y_gauss,
  x_gauss,
  lat_wgs84,
  lng_wgs84
FROM control_points
WHERE monu_num = 'YOUR_POINT_ID';

-- Lat should be negative (South)
-- Lng should be positive (East)
-- Both should be in decimal degrees, not meters
```

---

## 📝 Summary

1. ✅ Migration 028 adds WGS84 columns
2. ✅ Use PostGIS for automatic transformation (recommended)
3. ✅ Or use QGIS for manual transformation
4. ✅ Verify coordinates are in valid Zimbabwe range
5. ✅ Test auto-selection in frontend

**Time Required:** 10-30 minutes  
**Difficulty:** Medium  
**Impact:** Fixes control point auto-selection

---

**Once WGS84 coordinates are populated, auto-selection will work!** 🎯
