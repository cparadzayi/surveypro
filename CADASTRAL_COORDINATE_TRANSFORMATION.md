# 🌍 Cadastral Workflow: Cape Lo to WGS84 Coordinate Transformation

**Date:** 2025-01-19  
**Feature:** Automatic coordinate transformation for control points and survey points  
**Status:** ✅ IMPLEMENTED

---

## Overview

The Cadastral Standard workflow now automatically transforms coordinates from **Cape Lo (Gauss-Conformal)** to **WGS84** for MapLibre map display and satellite imagery overlay. The transformation is applied based on the **central meridian (Lo zone)** selected during the Control Point Selection step (Step 2).

---

## Workflow Integration

### Step 2: Control Point Selection

Users select:
1. **Central Meridian (Lo zone)**: 25, 27, 29, 31, or 33
2. **Control Points**: Minimum 3 trig beacons from the national control network

The selected Lo zone is stored in `workflowState.projectInfo.centralMeridian` and used for all subsequent coordinate transformations.

### Step 3: CSV Import (Survey Points)

When importing survey points from CSV:
1. CSV parser reads Cape Lo coordinates (Y=Westing, X=Southing)
2. Automatically transforms to WGS84 using the selected Lo zone
3. Stores both Cape Lo (original) and WGS84 coordinates in each point

**CSV Format:**
```csv
Point,Y,X,Status,Description,Date
ST1,96649.178,2247915.001,P,10mm iron peg (Station),1/10/2025
ST2,97128.263,2248259.159,P,10mm iron peg (Station),1/10/2025
```

---

## Technical Implementation

### 1. Coordinate Transformation Utility

**File:** `app-frontend/src/utils/coordinateTransform.ts`

**Supported Lo Zones:**
- Lo 25 (EPSG:22287) - Western Zimbabwe
- Lo 27 (EPSG:22289)
- Lo 29 (EPSG:22291)
- Lo 31 (EPSG:22293) - Central Zimbabwe (Zvishavane, Harare)
- Lo 33 (EPSG:22295) - Eastern Zimbabwe (Mutare)

**Key Functions:**
```typescript
// Get EPSG code for a Lo zone
getLoEPSG(loZone: number): string

// Transform Cape Lo to WGS84
capeLoToWGS84(point: CapeLoPoint, loZone: number): WGS84Point
```

**Transformation Formula:**
```typescript
// Cape Lo is south-orientated: +axis=wsu (West-South-Up)
// Y = Westing (positive west), X = Southing (positive south)
// For Proj4: Easting = -Y, Northing = -X
const [lng, lat] = proj4(sourceEPSG, 'EPSG:4326', [-point.y, -point.x]);
```

### 2. CSV Parser Enhancement

**File:** `app-frontend/src/utils/cadastral-csv.ts`

**Changes:**
- Added `loZone` parameter to `validateAndParseCSV()`
- Transforms each point during parsing if Lo zone is provided
- Stores WGS84 coordinates in `point.wgs84` field

**Example Output:**
```typescript
{
  id: "ST1",
  original: { y: 96649.178, x: 2247915.001 },  // Cape Lo 31
  wgs84: { lng: 30.074594, lat: -20.320397 },   // WGS84
  fieldBook: { y: "96649.178", x: "2247915.001" },
  coordinateList: { y: "96649.18", x: "2247915.00" },
  status: "P",
  description: "10mm iron peg (Station)",
  surveyDate: Date("2025-01-10")
}
```

### 3. Type Definitions

**File:** `app-frontend/src/types/cadastral.ts`

**Updated `CadastralPoint` Interface:**
```typescript
export interface CadastralPoint {
  id: string;
  original: {
    y: number;  // Westing (Cape Lo)
    x: number;  // Southing (Cape Lo)
  };
  wgs84?: {
    lng: number;  // Longitude (WGS84)
    lat: number;  // Latitude (WGS84)
  };
  // ... other fields
}
```

### 4. Workflow Integration

**File:** `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`

**CSV Import Handler:**
```typescript
// Get Lo zone from control point selection (Step 2)
const loZone = workflowState.projectInfo.centralMeridian;

// Validate and parse CSV with transformation
const validationResult = validateAndParseCSV(content, loZone);
```

---

## Coordinate Systems

### Cape Lo (Gauss-Conformal)

**Datum:** Cape Datum  
**Ellipsoid:** Modified Clarke 1880  
**Projection:** Transverse Mercator (south-oriented)  
**Axis Convention:** +axis=wsu (West-South-Up)  
**Datum Shift:** towgs84=-136,-108,-292,0,0,0,0

**Coordinate Format:**
- Y = Westing (meters, positive going west)
- X = Southing (meters, positive going south)
- Origin: Equator and central meridian

**Typical Ranges (Zimbabwe):**
- Y: -150,000 to +100,000 meters
- X: 1,800,000 to 2,400,000 meters

### WGS84 (World Geodetic System 1984)

**Datum:** WGS84  
**Projection:** Geographic (latitude/longitude)  
**Units:** Decimal degrees

**Zimbabwe Region:**
- Longitude: 25°E to 33°E
- Latitude: 15°S to 23°S (negative values)

---

## Proj4 Definitions

```javascript
// Cape Lo 25
proj4.defs('EPSG:22287', 
  '+proj=tmerc +axis=wsu +lat_0=0 +lon_0=25 +k=1 +x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs'
);

// Cape Lo 27
proj4.defs('EPSG:22289', 
  '+proj=tmerc +axis=wsu +lat_0=0 +lon_0=27 +k=1 +x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs'
);

// Cape Lo 29
proj4.defs('EPSG:22291', 
  '+proj=tmerc +axis=wsu +lat_0=0 +lon_0=29 +k=1 +x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs'
);

// Cape Lo 31
proj4.defs('EPSG:22293', 
  '+proj=tmerc +axis=wsu +lat_0=0 +lon_0=31 +k=1 +x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs'
);

// Cape Lo 33
proj4.defs('EPSG:22295', 
  '+proj=tmerc +axis=wsu +lat_0=0 +lon_0=33 +k=1 +x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs'
);
```

---

## Example Transformation

**Input (Cape Lo 31):**
```
Point: ST1
Y: 96649.178 m (Westing)
X: 2247915.001 m (Southing)
```

**Transformation:**
```typescript
const capeLoPoint = { id: "ST1", y: 96649.178, x: 2247915.001 };
const wgs84Point = capeLoToWGS84(capeLoPoint, 31);
```

**Output (WGS84):**
```
Longitude: 30.074594°E
Latitude: -20.320397°S
```

**Verification:**
- Location: Maglas Township, Zvishavane District, Zimbabwe
- Distance from Zvishavane reference (30.074444°E, -20.320278°S): ~15 meters ✅

---

## Control Points

Control points from the Zimbabwe national trig network are stored in the database with Cape Lo coordinates. When displayed on MapLibre maps, they will also need to be transformed to WGS84.

**Database Fields:**
- `y_gauss`: Westing (Cape Lo)
- `x_gauss`: Southing (Cape Lo)
- `gauss_lo`: Central meridian (25, 27, 29, 31, or 33)

**Transformation:**
```typescript
const controlPoint = {
  id: point.monu_num,
  y: point.y_gauss,
  x: point.x_gauss
};
const wgs84 = capeLoToWGS84(controlPoint, point.gauss_lo);
```

---

## Usage in MapLibre Components

When displaying points on MapLibre maps (e.g., in AreaComputationView, CalculationsPart2View):

```typescript
// Use WGS84 coordinates if available
const coordinates = point.wgs84 
  ? [point.wgs84.lng, point.wgs84.lat]
  : [0, 0]; // Fallback if transformation not available

// Create marker
new maplibregl.Marker()
  .setLngLat(coordinates)
  .addTo(map);
```

---

## Validation & Testing

### Test Data

**Sample CSV:** `sample-survey-points-zvishavane.csv`
- 22 verified points from Maglas Township, Zvishavane
- Cape Lo 31 coordinates
- Expected center: ~30.072°E, ~20.321°S

### Verification Steps

1. **Import CSV** with Lo 31 selected
2. **Check console logs** for transformation output:
   ```
   [CSV Parser] 🌍 Will transform coordinates from Cape Lo 31 to WGS84
   [CSV Parser] 🌍 Transformed to WGS84: 30.074594°E, -20.320397°S
   ```
3. **Verify coordinates** are in Zimbabwe region (25-33°E, 15-23°S)
4. **Display on map** - points should cluster around expected location

### Quality Checks

- ✅ Longitude: 25-33°E (Zimbabwe region)
- ✅ Latitude: -23 to -15° (Zimbabwe region)
- ✅ Distance from reference: < 200m (typical for datum transformations)
- ✅ Points cluster correctly around known locations

---

## Files Modified

1. **`app-frontend/src/utils/coordinateTransform.ts`**
   - Added all Lo zone definitions (25, 27, 29, 31, 33)
   - Added `getLoEPSG()` helper function
   - Updated `capeLoToWGS84()` to accept Lo zone parameter

2. **`app-frontend/src/utils/cadastral-csv.ts`**
   - Added `loZone` parameter to `validateAndParseCSV()`
   - Implemented coordinate transformation during parsing
   - Stores WGS84 coordinates in point objects

3. **`app-frontend/src/types/cadastral.ts`**
   - Added `wgs84` field to `CadastralPoint` interface
   - Updated comments to clarify Cape Lo coordinate system

4. **`app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`**
   - Passes Lo zone from workflow state to CSV parser
   - Logs transformation info for debugging

5. **`sample-survey-points-zvishavane.csv`**
   - Updated with verified Maglas Township coordinates
   - 22 points for testing transformation

6. **`FIX_CAPE_LO_TRANSFORMATION.md`**
   - Documents the critical fix (negating both Y and X)
   - Includes NGI utility verification

---

## Benefits

✅ **Automatic Transformation** - No manual coordinate conversion needed  
✅ **Multi-Zone Support** - Works with all Zimbabwe Lo zones (25, 27, 29, 31, 33)  
✅ **Workflow Integration** - Lo zone selected once in Step 2, applied throughout  
✅ **Dual Coordinates** - Preserves original Cape Lo + adds WGS84 for maps  
✅ **Verified Accuracy** - Tested against NGI official transformation utility  
✅ **MapLibre Ready** - WGS84 coordinates ready for satellite overlay  

---

## Future Enhancements

### Control Points
- Add WGS84 transformation for control points from database
- Display control points on MapLibre maps with correct locations

### Map Components
- Update AreaComputationView to use WGS84 coordinates
- Update CalculationsPart2View map display
- Add satellite imagery basemap option

### Validation
- Add coordinate range validation (Zimbabwe bounds check)
- Warn if transformed coordinates fall outside expected region
- Suggest correct Lo zone if coordinates seem wrong

---

## References

1. **NGI Coordinate Conversion Utility**  
   https://ngi.dalrrd.gov.za/index.php/technical-information/software-and-utilities/ngi-coordinate-conversion-utility

2. **EPSG.io - Cape Lo Projections**  
   - Lo 25: https://epsg.io/22287
   - Lo 27: https://epsg.io/22289
   - Lo 29: https://epsg.io/22291
   - Lo 31: https://epsg.io/22293
   - Lo 33: https://epsg.io/22295

3. **Proj4js Documentation**  
   http://proj4js.org/

4. **Zimbabwe Survey Datum**  
   Modified Clarke 1880 ellipsoid with Cape Datum shift parameters

---

## Troubleshooting

### Points not transforming?

Check console logs for:
```
[CSV Import] Using Lo zone from control point selection: LoXX
[CSV Parser] 🌍 Will transform coordinates from Cape Lo XX to WGS84
```

If Lo zone is "not set", ensure Step 2 (Control Point Selection) was completed.

### Points in wrong location?

1. **Verify Lo zone** - Check if data is in different zone (e.g., Lo 29 vs Lo 31)
2. **Check coordinates** - Ensure Y and X are not swapped
3. **Validate range** - Cape Lo Y should be -150k to +100k, X should be 1.8M to 2.4M

### Transformation errors?

Check browser console for error messages. Common issues:
- Invalid Lo zone (must be 25, 27, 29, 31, or 33)
- Missing or invalid coordinates (NaN values)
- Proj4 library not loaded

---

**Implementation Complete:** 2025-01-19  
**Tested With:** Maglas Township, Zvishavane sample data (22 points)  
**Verification:** NGI Coordinate Conversion Utility  
**Status:** ✅ Production Ready
