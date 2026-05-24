# 🗺️ WGS84 Conversion - All Zimbabwe Lo Zones

**Complete solution for converting ALL control points to WGS84**

---

## 📊 Zimbabwe Lo Zones

Your database contains control points in **5 different Lo zones**:

| Lo Zone | EPSG Code | Coverage Area | Common Locations |
|---------|-----------|---------------|------------------|
| **Lo25** | EPSG:2045 | Far Western | Victoria Falls area (rare) |
| **Lo27** | EPSG:2046 | Western | Bulawayo, Hwange |
| **Lo29** | EPSG:2047 | West-Central | Gweru, Kwekwe |
| **Lo31** | EPSG:2048 | East-Central | **Harare, Zvishavane, Masvingo** |
| **Lo33** | EPSG:2049 | Eastern | Mutare, Chipinge |

**Most common:** Lo31 (covers Harare, Zvishavane, and central Zimbabwe)

---

## ⚡ Quick Start (RECOMMENDED)

### **Option 1: Automated Script (Easiest)**

```bash
cd app-backend
scripts\populate-wgs84-all-zones.bat
```

This script will:
- ✅ Check PostGIS installation
- ✅ Convert ALL Lo zones automatically
- ✅ Show statistics by zone
- ✅ Validate coordinates
- ✅ Display summary

**Time:** 2-5 minutes  
**Requires:** PostGIS installed

---

### **Option 2: Manual SQL (If script fails)**

```bash
cd app-backend
psql -h localhost -U postgres -d surveypro_app -f scripts/populate-wgs84-all-zones.sql
```

---

## 🔧 Detailed Steps

### **Step 1: Install PostGIS (If Not Installed)**

#### **Check if PostGIS is installed:**

```sql
psql -h localhost -U postgres -d surveypro_v1

SELECT PostGIS_Version();
```

**If you see an error**, PostGIS is not installed.

#### **Install PostGIS:**

**Windows:**
1. Download from: https://postgis.net/windows_downloads/
2. Or use PostgreSQL Stack Builder (comes with PostgreSQL)
3. Select PostGIS for your PostgreSQL version
4. Install with default settings

**Verify installation:**
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
SELECT PostGIS_Version();
```

Should show something like: `3.3 USE_GEOS=1 USE_PROJ=1`

---

### **Step 2: Check Current Control Points**

```sql
-- Connect to database
psql -h localhost -U postgres -d surveypro_v1

-- Check distribution by Lo zone
SELECT 
  gauss_lo,
  COUNT(*) as total_points,
  COUNT(lat_wgs84) as already_converted
FROM control_points
GROUP BY gauss_lo
ORDER BY gauss_lo;
```

**Expected output:**
```
 gauss_lo | total_points | already_converted 
----------+--------------+-------------------
       25 |           15 |                 0
       27 |          250 |                 0
       29 |          380 |                 0
       31 |          520 |                 0
       33 |          185 |                 0
```

---

### **Step 3: Run Conversion Script**

```bash
# From app-backend directory
psql -h localhost -U postgres -d surveypro_v1 -f scripts/populate-wgs84-all-zones.sql
```

**What it does:**

1. **Installs PostGIS** (if needed)
2. **Adds geometry columns** to control_points table
3. **Converts each Lo zone** with correct EPSG code:
   - Lo25 → EPSG:2045
   - Lo27 → EPSG:2046
   - Lo29 → EPSG:2047
   - Lo31 → EPSG:2048
   - Lo33 → EPSG:2049
4. **Transforms to WGS84** (EPSG:4326)
5. **Extracts lat/lng** to dedicated columns
6. **Validates** coordinates are in Zimbabwe range
7. **Shows statistics** by zone

---

### **Step 4: Verify Results**

```sql
-- Check conversion coverage
SELECT 
  gauss_lo,
  COUNT(*) as total_points,
  COUNT(lat_wgs84) as with_wgs84,
  ROUND(100.0 * COUNT(lat_wgs84) / COUNT(*), 2) as coverage_percent
FROM control_points
GROUP BY gauss_lo
ORDER BY gauss_lo;
```

**Expected output:**
```
 gauss_lo | total_points | with_wgs84 | coverage_percent 
----------+--------------+------------+------------------
       25 |           15 |         15 |           100.00
       27 |          250 |        250 |           100.00
       29 |          380 |        380 |           100.00
       31 |          520 |        520 |           100.00
       33 |          185 |        185 |           100.00
```

---

### **Step 5: Validate Coordinates**

```sql
-- Check sample coordinates from each zone
SELECT 
  gauss_lo,
  monu_num,
  monu_name,
  ROUND(lat_wgs84::numeric, 4) as lat,
  ROUND(lng_wgs84::numeric, 4) as lng,
  area_nm
FROM control_points
WHERE lat_wgs84 IS NOT NULL
ORDER BY gauss_lo, monu_num
LIMIT 25;
```

**Expected ranges for Zimbabwe:**
- **Latitude:** -15° to -23° (South)
- **Longitude:** 25° to 34° (East)

**Sample expected values:**

| Location | Lo Zone | Lat (approx) | Lng (approx) |
|----------|---------|--------------|--------------|
| Victoria Falls | 25 | -17.93° | 25.86° |
| Bulawayo | 27 | -20.15° | 28.58° |
| Gweru | 29 | -19.45° | 29.82° |
| Zvishavane | 31 | -20.33° | 30.07° |
| Harare | 31 | -17.83° | 31.05° |
| Mutare | 33 | -18.97° | 32.67° |

---

### **Step 6: Check for Invalid Coordinates**

```sql
-- Find any points outside Zimbabwe
SELECT 
  monu_num,
  monu_name,
  gauss_lo,
  lat_wgs84,
  lng_wgs84,
  area_nm
FROM control_points
WHERE lat_wgs84 IS NOT NULL
  AND (lat_wgs84 NOT BETWEEN -23 AND -15 OR lng_wgs84 NOT BETWEEN 25 AND 34);
```

**Should return 0 rows** if all conversions are correct.

If you see any rows, check:
- Original Gauss coordinates are correct
- Correct EPSG code used for that Lo zone
- No data entry errors

---

## 📊 Expected Statistics

After successful conversion:

```
============================================
WGS84 Coordinate Conversion Complete!
============================================
Total control points: 1350
Converted to WGS84: 1350
Coverage: 100.00%
============================================

By Lo Zone:
 gauss_lo | total | with_wgs84 | coverage_% 
----------+-------+------------+------------
       25 |    15 |         15 |     100.00
       27 |   250 |        250 |     100.00
       29 |   380 |        380 |     100.00
       31 |   520 |        520 |     100.00
       33 |   185 |        185 |     100.00
```

---

## ✅ Test Auto-Selection

### **1. Restart Backend**

```bash
cd app-backend
npm start
```

### **2. Test API**

```bash
# Test Lo31 (Zvishavane area)
curl "http://localhost:3050/api/control-points?gauss_lo=31&limit=5"

# Should see lat_wgs84 and lng_wgs84 in response
```

### **3. Test Frontend**

1. Start frontend: `npm run dev`
2. Go to Control Point Selection step
3. Import CSV with points near Zvishavane
4. Set radius to 50km
5. Click "Re-run Auto-Selection"

**Expected console output:**
```
[ControlPointSelection] Total control points available: 520
[ControlPointSelection] Points with WGS84 coordinates: 520
[ControlPointSelection] ✅ Auto-selected 12 control points within 50km
[ControlPointSelection] Nearest 5 points:
  1. ZW123 (-20.3300°, 30.0700°) - 5.23km away
  2. ZW456 (-20.2500°, 30.1500°) - 12.45km away
  3. ZW789 (-20.4100°, 30.2200°) - 18.67km away
  ...
```

---

## 🔄 Re-running Conversion

The script is **idempotent** - safe to run multiple times:

```sql
-- It only updates NULL values:
WHERE geom_gauss IS NULL
WHERE geom_wgs84 IS NULL
WHERE lat_wgs84 IS NULL OR lng_wgs84 IS NULL
```

If you add new control points later, just re-run the script:

```bash
scripts\populate-wgs84-all-zones.bat
```

---

## 🆘 Troubleshooting

### **PostGIS Not Found**

```
ERROR: function postgis_version() does not exist
```

**Solution:**
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

If this fails, PostGIS is not installed. Download from https://postgis.net/

---

### **Permission Denied**

```
ERROR: permission denied to create extension "postgis"
```

**Solution:** Connect as superuser:
```bash
psql -h localhost -U postgres -d surveypro_app
```

---

### **Wrong SRID**

```
ERROR: transform: couldn't project point
```

**Solution:** Check your Lo zone values:
```sql
SELECT DISTINCT gauss_lo FROM control_points ORDER BY gauss_lo;
```

Make sure they are: 25, 27, 29, 31, or 33

---

### **Coordinates Look Wrong**

```sql
-- Check a specific point
SELECT 
  monu_num,
  gauss_lo,
  y_gauss,
  x_gauss,
  lat_wgs84,
  lng_wgs84,
  ST_AsText(geom_wgs84) as wgs84_point
FROM control_points
WHERE monu_num = 'YOUR_POINT_ID';
```

**Verify:**
- Lat is negative (South)
- Lng is positive (East)
- Both in decimal degrees, not meters
- Within Zimbabwe range

---

### **Some Points Not Converting**

```sql
-- Find points with missing Gauss coordinates
SELECT 
  monu_num,
  monu_name,
  gauss_lo,
  y_gauss,
  x_gauss
FROM control_points
WHERE (y_gauss IS NULL OR x_gauss IS NULL)
  AND gauss_lo IS NOT NULL;
```

These points cannot be converted without Gauss coordinates.

---

## 📈 Performance

**Conversion speed** (approximate):

| Points | Time |
|--------|------|
| 100 | 5 seconds |
| 500 | 15 seconds |
| 1000 | 30 seconds |
| 5000 | 2 minutes |

**Database size increase:**
- Geometry columns add ~50 bytes per point
- For 1000 points: ~50KB additional storage

---

## 🎯 Success Criteria

✅ **All checks should pass:**

1. **PostGIS installed**
   ```sql
   SELECT PostGIS_Version();
   ```

2. **All zones converted**
   ```sql
   SELECT gauss_lo, COUNT(*) as total, COUNT(lat_wgs84) as converted
   FROM control_points
   GROUP BY gauss_lo;
   -- All zones should show 100% conversion
   ```

3. **Coordinates valid**
   ```sql
   SELECT COUNT(*) FROM control_points
   WHERE lat_wgs84 BETWEEN -23 AND -15
     AND lng_wgs84 BETWEEN 25 AND 34;
   -- Should equal total points
   ```

4. **Auto-selection works**
   - Frontend shows control points found
   - Console shows WGS84 coordinates
   - Distances are realistic (not astronomical)

---

## 📝 Summary

**What this solution does:**

✅ Converts **ALL Lo zones** (25, 27, 29, 31, 33)  
✅ Uses **correct EPSG code** for each zone  
✅ Transforms to **WGS84** (EPSG:4326)  
✅ Validates coordinates are in **Zimbabwe range**  
✅ Shows **statistics by zone**  
✅ **Idempotent** - safe to re-run  
✅ **Fast** - processes thousands of points in seconds  

**Files created:**
- `scripts/populate-wgs84-all-zones.sql` - SQL conversion script
- `scripts/populate-wgs84-all-zones.bat` - Windows batch wrapper

**Time required:** 5-10 minutes  
**Difficulty:** Easy (automated)  
**Impact:** Fixes control point selection for ALL zones

---

**Run the script and your control point auto-selection will work across all of Zimbabwe!** 🇿🇼
