# QGIS Parcel Import - Coordinate Order Analysis

## Problem Statement
Parcels digitized from QGIS and saved into the database show swapped Y/X coordinates, while parcels digitized from the frontend show correct coordinates.

## Cape Lo 31 (EPSG:22291) Coordinate Convention
- **X = Southing** (~2,247,000m range)
- **Y = Westing** (~97,000m range)
- **GeoJSON Standard**: `[X, Y]` = `[Southing, Westing]`

## PostGIS Functions for EPSG:22291
```sql
-- ST_MakePoint(first_ordinate, second_ordinate)
-- For EPSG:22291 (Cape Lo 31):
--   first_ordinate = Y (Westing ~97k)
--   second_ordinate = X (Southing ~2.2M)

ST_MakePoint(y, x)  -- Correct for Cape Lo 31

-- Extraction:
ST_X(geom) → Returns first ordinate → Y (Westing ~97k)
ST_Y(geom) → Returns second ordinate → X (Southing ~2.2M)
```

## Current Implementation

### Frontend Digitization (✅ CORRECT)
**File**: `MapLibreAreaView.vue:2506`
```javascript
const coordinates = parcel.points.map(p => [p.x, p.y]);
// p.x = Southing (~2.2M)
// p.y = Westing (~97k)
// GeoJSON: [X, Y] = [Southing, Westing] ✅
```

**Backend Storage**: `landParcel.js:41`
```javascript
ST_SetSRID(ST_GeomFromGeoJSON($4), 22291)
// GeoJSON is parsed correctly by PostGIS
// PostGIS stores as ST_MakePoint(Y, X) internally
```

### QGIS Digitization (❓ NEEDS VERIFICATION)
When QGIS digitizes directly into PostGIS with SRID 22291:
1. **Question**: Does QGIS use `ST_MakePoint(X, Y)` or `ST_MakePoint(Y, X)`?
2. **Question**: Does QGIS follow GeoJSON `[X, Y]` order or PostGIS `[Y, X]` order?

### Backend Retrieval
**File**: `landParcel.js:155-156`
```javascript
ST_Y(ST_Centroid(lp.geom)) as centroid_y,  // Returns X (Southing) → centroid_y
ST_X(ST_Centroid(lp.geom)) as centroid_x   // Returns Y (Westing) → centroid_x
```

**This mapping is CORRECT** because:
- `ST_Y()` returns second ordinate (X/Southing) → mapped to `centroid_y` ✅
- `ST_X()` returns first ordinate (Y/Westing) → mapped to `centroid_x` ✅

## Hypothesis: QGIS Uses Wrong Coordinate Order

### Scenario 1: QGIS Uses GeoJSON Order (Likely Issue)
If QGIS digitizes using GeoJSON `[X, Y]` order but PostGIS expects `[Y, X]`:

**QGIS digitizes point at**: Southing=2247742, Westing=97580
**QGIS sends to PostGIS**: `ST_MakePoint(2247742, 97580)`
**PostGIS interprets as**: Y=2247742, X=97580 ❌ SWAPPED!

**When retrieved**:
- `ST_X(geom)` → 2247742 (should be ~97k) ❌
- `ST_Y(geom)` → 97580 (should be ~2.2M) ❌

### Scenario 2: QGIS Layer Configuration Issue
QGIS might have incorrect axis order configuration for SRID 22291.

## Solution Options

### Option 1: Fix QGIS Layer Configuration
Configure QGIS to use correct axis order for EPSG:22291:
- Set axis order to "Y, X" (Westing, Southing)
- Or use "Traditional GIS order" setting

### Option 2: Create Database Trigger to Swap Coordinates
Create a trigger that detects and fixes swapped coordinates on INSERT:
```sql
CREATE OR REPLACE FUNCTION fix_qgis_coordinate_swap()
RETURNS TRIGGER AS $$
DECLARE
  centroid_point GEOMETRY;
  x_val NUMERIC;
  y_val NUMERIC;
BEGIN
  -- Extract centroid coordinates
  centroid_point := ST_Centroid(NEW.geom);
  x_val := ST_X(centroid_point);  -- Should be Y (Westing ~97k)
  y_val := ST_Y(centroid_point);  -- Should be X (Southing ~2.2M)
  
  -- Check if coordinates are swapped (X > 1M indicates it's actually Southing)
  IF x_val > 1000000 AND y_val < 200000 THEN
    -- Coordinates are swapped! Fix by swapping ordinates
    RAISE NOTICE 'Detected swapped coordinates for parcel %. Fixing...', NEW.stand;
    
    -- Swap the coordinates by reconstructing geometry
    NEW.geom := ST_Transform(
      ST_FlipCoordinates(NEW.geom),
      22291
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Option 3: Import Pipeline with Coordinate Swap Detection
Add middleware in the API that detects and fixes swapped coordinates before saving.

### Option 4: Use GeoJSON Import Instead of Direct PostGIS
Export from QGIS as GeoJSON, then import via frontend API which handles coordinates correctly.

## Recommended Approach

1. **Verify the issue**: Check actual QGIS-digitized parcel coordinates in database
2. **Identify root cause**: Determine if QGIS is using wrong coordinate order
3. **Fix at source**: Configure QGIS correctly (preferred)
4. **Add safeguard**: Implement coordinate swap detection trigger (backup)

## Testing Steps

1. Digitize a test parcel in QGIS at known coordinates
2. Query database directly:
   ```sql
   SELECT 
     stand,
     ST_X(ST_Centroid(geom)) as first_ordinate,
     ST_Y(ST_Centroid(geom)) as second_ordinate,
     ST_AsText(ST_Centroid(geom)) as wkt
   FROM land_parcels
   WHERE stand = 'TEST_PARCEL';
   ```
3. Compare with expected values:
   - first_ordinate should be ~97k (Westing)
   - second_ordinate should be ~2.2M (Southing)
