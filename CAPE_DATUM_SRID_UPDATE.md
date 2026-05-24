# Cape Datum SRID Update

## Overview
Updated all SRID mappings to use **Cape datum** projections with **Clarke 1880 Modified ellipsoid** as defined in QGIS, instead of the previous Zimbabwe-specific EPSG codes.

---

## Changes Made

### **EPSG Code Mapping**

**Before** (Zimbabwe-specific):
| Central Meridian | Old EPSG | Name |
|------------------|----------|------|
| Lo25 | 20135 | Zimbabwe Lo25 |
| Lo27 | 20137 | Zimbabwe Lo27 |
| Lo29 | 20139 | Zimbabwe Lo29 |
| Lo31 | 20141 | Zimbabwe Lo31 |
| Lo33 | 20143 | Zimbabwe Lo33 |

**After** (Cape datum - QGIS standard):
| Central Meridian | New EPSG | Full Name |
|------------------|----------|-----------|
| Lo25 | 22285 | Cape / Lo25 |
| Lo27 | 22287 | Cape / Lo27 |
| Lo29 | 22289 | Cape / Lo29 |
| Lo31 | 22291 | Cape / Lo31 |
| Lo33 | 22293 | Cape / Lo33 |

---

## Technical Specifications

### **Datum: Cape**
- **Ellipsoid**: Clarke 1880 (modified for southern Africa)
- **Semi-major axis (a)**: 6,378,249.145 meters
- **Inverse flattening (1/f)**: 293.465

### **Projection: Gauss Conform (Transverse Mercator)**
- **Projection Method**: Transverse Mercator (Gauss-Schreiber variant)
- **False Easting**: 0 meters
- **False Northing**: 0 meters
- **Scale Factor**: 1.0 at central meridian
- **Units**: Meters
- **Hemisphere**: Southern Hemisphere
- **Coordinate Convention**: Zimbabwe P(Y,X)
  - **Y**: Westing (positive westward from central meridian)
  - **X**: Southing (positive southward from equator)
  - **Origin**: Equator at central meridian
  - **Bearing Reference**: South (0° = South, 90° = West, 180° = North, 270° = East)

### **Central Meridians**
- **Lo25**: 25°E longitude
- **Lo27**: 27°E longitude
- **Lo29**: 29°E longitude (default for Harare, Bulawayo)
- **Lo31**: 31°E longitude
- **Lo33**: 33°E longitude

---

## Southern Hemisphere Considerations

### **Coordinate System Orientation**

The Cape datum projections (EPSG:22285-22293) are specifically designed for **Southern Hemisphere** cadastral surveys with the following conventions:

#### **1. Y-Axis (Westing)**
- **Direction**: Positive westward from central meridian
- **Zero Point**: Central meridian (25°E, 27°E, 29°E, 31°E, or 33°E)
- **Sign Convention**: 
  - Positive (+) west of central meridian
  - Negative (-) east of central meridian

#### **2. X-Axis (Southing)**
- **Direction**: Positive southward from equator
- **Zero Point**: Equator (0° latitude)
- **Sign Convention**: 
  - Positive (+) south of equator (all of Zimbabwe)
  - Negative (-) north of equator (not applicable for Zimbabwe)

#### **3. Bearing Convention**
- **Reference Direction**: South (not North!)
- **0°**: South
- **90°**: West
- **180°**: North
- **270°**: East
- **Rotation**: Clockwise from South

This is the **standard cadastral convention** for southern Africa, ensuring consistency with historical survey records.

### **Why South-Oriented Bearings?**

In the Southern Hemisphere, using south as the reference direction (0°) has several advantages:

1. **Historical Continuity**: Matches all legacy cadastral surveys in Zimbabwe
2. **Astronomical Alignment**: South celestial pole is the reference for southern surveys
3. **Practical Field Work**: Sun transits through north, making south a stable reference
4. **Regional Standard**: Consistent across South Africa, Botswana, Namibia, Zimbabwe

### **EPSG Definition Verification**

The EPSG codes 22285-22293 are correctly defined for Southern Hemisphere:

```
PROJCS["Cape / Lo29",
    GEOGCS["Cape",
        DATUM["Cape",
            SPHEROID["Clarke 1880 (modified)",6378249.145,293.465]],
        PRIMEM["Greenwich",0]],
    PROJECTION["Transverse_Mercator"],
    PARAMETER["latitude_of_origin",0],        ← Equator (Southern Hemisphere)
    PARAMETER["central_meridian",29],         ← 29°E longitude
    PARAMETER["scale_factor",1],
    PARAMETER["false_easting",0],
    PARAMETER["false_northing",0],            ← No false northing needed
    UNIT["metre",1]]
```

**Key Points**:
- `latitude_of_origin = 0`: Equator (appropriate for Southern Hemisphere)
- `false_northing = 0`: No offset needed (coordinates naturally positive south of equator)
- Projection works correctly in both hemispheres; sign of coordinates indicates hemisphere

---

## Files Updated

### **1. Service: `projectPoints.ts`**
**Location**: `app-frontend/src/services/projectPoints.ts`

**Change**:
```typescript
// Before
const sridMap: Record<number, number> = {
  25: 20135, // Zimbabwe Lo25
  27: 20137, // Zimbabwe Lo27
  29: 20139, // Zimbabwe Lo29
  31: 20141, // Zimbabwe Lo31
  33: 20143  // Zimbabwe Lo33
}

// After
const sridMap: Record<number, number> = {
  25: 22285, // Cape / Lo25 (EPSG:22285) - Clarke 1880 Modified
  27: 22287, // Cape / Lo27 (EPSG:22287) - Clarke 1880 Modified
  29: 22289, // Cape / Lo29 (EPSG:22289) - Clarke 1880 Modified
  31: 22291, // Cape / Lo31 (EPSG:22291) - Clarke 1880 Modified
  33: 22293  // Cape / Lo33 (EPSG:22293) - Clarke 1880 Modified
}
```

### **2. Component: `LayerSelect.vue`**
**Location**: `app-frontend/src/components/inputs/LayerSelect.vue`

**Status**: ✅ Already using correct EPSG codes (22285-22293)

**UI Display**:
```vue
<option value="Lo25">Lo25 (22285)</option>
<option value="Lo27">Lo27 (22287)</option>
<option value="Lo29">Lo29 (22289)</option>
<option value="Lo31">Lo31 (22291)</option>
<option value="Lo33">Lo33 (22293)</option>
```

### **3. Documentation Updates**

Updated all documentation files:
- ✅ `PROJECT_POINTS_LAYER_IMPLEMENTATION.md`
- ✅ `LAYER_STRUCTURE_DOCUMENTATION.md`
- ✅ All example JSON snippets
- ✅ All SRID references in comments

---

## Why Cape Datum?

### **Historical Context**
The Cape datum was the official geodetic datum for southern Africa (including Zimbabwe, South Africa, Botswana, Namibia) from the late 1800s until the adoption of WGS84/Hartebeesthoek94.

### **Advantages**
1. **QGIS Compatibility**: Standard EPSG codes recognized by QGIS
2. **Regional Standard**: Used across southern Africa
3. **Historical Continuity**: Matches legacy survey data
4. **Transformation Support**: Well-defined transformations to modern datums

### **QGIS Integration**
In QGIS, these projections are defined as:
```
EPSG:22285 - Cape / Lo25
EPSG:22287 - Cape / Lo27
EPSG:22289 - Cape / Lo29
EPSG:22291 - Cape / Lo31
EPSG:22293 - Cape / Lo33
```

Each uses:
- **Datum**: Cape
- **Ellipsoid**: Clarke 1880 (modified)
- **Projection**: Transverse Mercator

---

## Database Impact

### **Existing Data**
If you have existing layers with old EPSG codes (20135-20143):

**Option 1: Update SRID**
```sql
UPDATE layers 
SET srid = 22289 
WHERE srid = 20139;  -- Update Lo29

UPDATE layers 
SET srid = 22285 
WHERE srid = 20135;  -- Update Lo25

-- Repeat for other meridians
```

**Option 2: Keep Both**
Old and new layers can coexist. The system will use 22285-22293 for new layers.

### **New Layers**
All new layers created via "Generate Coordinate List" will automatically use Cape datum EPSG codes (22285-22293).

---

## Testing

### **Test 1: New Layer Creation**
1. Generate Coordinate List for Lo29 project
2. Check layer SRID in database
3. **Expected**: `srid = 22289` (Cape / Lo29)

### **Test 2: QGIS Import**
1. Export layer as GeoJSON or Shapefile
2. Import into QGIS
3. **Expected**: QGIS recognizes EPSG:22289 automatically
4. **Expected**: Coordinates display correctly

### **Test 3: Coordinate Transformation**
1. Load Cape/Lo29 layer in QGIS
2. Reproject to WGS84 (EPSG:4326)
3. **Expected**: Coordinates transform correctly
4. **Expected**: Points appear in correct geographic location

### **Test 4: Layer Selector**
1. Navigate to Areas v2
2. Create new layer without SRID
3. Use SRID selector dropdown
4. **Expected**: Options show "Lo25 (22285)", "Lo27 (22287)", etc.
5. Select "Lo29 (22289)" and apply
6. **Expected**: Layer SRID updated to 22289

---

## Coordinate Transformation

### **Cape to WGS84**
QGIS and PostGIS support direct transformation:

```sql
-- PostGIS example
SELECT ST_Transform(
  ST_SetSRID(ST_MakePoint(96751.29, -2247626.76), 22289),  -- Cape/Lo29
  4326  -- WGS84
) AS wgs84_point;
```

### **Transformation Parameters**
Standard Helmert transformation parameters are available in EPSG database for:
- Cape → WGS84
- Cape → Hartebeesthoek94
- Cape → other modern datums

---

## Migration Guide

### **For Existing Projects**

If you have existing survey data with old EPSG codes:

1. **Identify affected layers**:
```sql
SELECT id, name, srid 
FROM layers 
WHERE srid IN (20135, 20137, 20139, 20141, 20143);
```

2. **Update to Cape datum**:
```sql
UPDATE layers SET srid = 22285 WHERE srid = 20135;  -- Lo25
UPDATE layers SET srid = 22287 WHERE srid = 20137;  -- Lo27
UPDATE layers SET srid = 22289 WHERE srid = 20139;  -- Lo29
UPDATE layers SET srid = 22291 WHERE srid = 20141;  -- Lo31
UPDATE layers SET srid = 22293 WHERE srid = 20143;  -- Lo33
```

3. **Verify in QGIS**:
- Export updated layer
- Import to QGIS
- Check CRS is recognized as "Cape / LoXX"

### **For New Projects**

No action needed! The system automatically uses Cape datum EPSG codes.

---

## QGIS WKT Definition

For reference, the QGIS WKT (Well-Known Text) for Cape / Lo29:

```
PROJCS["Cape / Lo29",
    GEOGCS["Cape",
        DATUM["Cape",
            SPHEROID["Clarke 1880 (modified)",6378249.145,293.465,
                AUTHORITY["EPSG","7055"]],
            AUTHORITY["EPSG","6222"]],
        PRIMEM["Greenwich",0,
            AUTHORITY["EPSG","8901"]],
        UNIT["degree",0.0174532925199433,
            AUTHORITY["EPSG","9122"]],
        AUTHORITY["EPSG","4222"]],
    PROJECTION["Transverse_Mercator"],
    PARAMETER["latitude_of_origin",0],
    PARAMETER["central_meridian",29],
    PARAMETER["scale_factor",1],
    PARAMETER["false_easting",0],
    PARAMETER["false_northing",0],
    UNIT["metre",1,
        AUTHORITY["EPSG","9001"]],
    AUTHORITY["EPSG","22289"]]
```

---

## Benefits

✅ **QGIS Compatible**: Standard EPSG codes recognized by QGIS  
✅ **Regionally Standard**: Used across southern Africa  
✅ **Well-Documented**: Extensive transformation parameters available  
✅ **Historical Accuracy**: Matches legacy cadastral survey data  
✅ **Transformation Support**: Easy conversion to modern datums  
✅ **Professional**: Industry-standard coordinate reference system  

---

## References

- **EPSG Registry**: https://epsg.io/22289 (Cape / Lo29 example)
- **QGIS CRS Database**: Built-in support for EPSG:22285-22293
- **PostGIS**: Full support via spatial_ref_sys table
- **OGC Standards**: WKT and PROJ.4 definitions available

---

## Summary

All SRID mappings have been updated from Zimbabwe-specific codes (20135-20143) to Cape datum codes (22285-22293) using the Clarke 1880 Modified ellipsoid, ensuring compatibility with QGIS and other GIS software while maintaining historical accuracy for southern African cadastral surveys.

**Default SRID**: 22289 (Cape / Lo29) for central Zimbabwe (Harare, Bulawayo region)
