# Zimbabwe Cadastral Coordinate System

This document describes the complete implementation of the Zimbabwe Cadastral Coordinate System based on the Clarke 1880 (Arc) ellipsoid across the SurveyPro application.

## Overview

The Zimbabwe Cadastral Coordinate System is a **Transverse Mercator projection** with the following characteristics:

### Ellipsoid Parameters
- **Ellipsoid**: Clarke 1880 (Arc)
- **Semi-major axis (a)**: 6,378,249.145 meters
- **Flattening (1/f)**: 293.4663077

### Projection Parameters
- **Central Meridians**: 25°, 27°, 29°, 31°, 33° East (2° belts)
- **Beacon Format**: **P(Y, X)** where P is the beacon name

#### Coordinate Convention
- **Y-Coordinate (Westing)**:
  - Increases **westwards** from the central meridian
  - **Negative** values = East of central meridian
  - **Positive** values = West of central meridian
  - Example: Y = -3551.377m means 3551.377m east of the meridian

- **X-Coordinate (Southing)**:
  - **Positive** from the Equator
  - Increases **southwards** toward the South Pole
  - Larger positive values = further south
  - Example: X = 1,965,611.534m means 1,965.6km south of the Equator

### Direction Specifications
- **Zero Direction**: South (0°)
- **Measurement**: Clockwise
- **Format**: Degrees, Minutes, Seconds (DMS)
- **Precision Rules**:
  - Distance < 6000m: Rounded to nearest **10 seconds** (banker's rounding)
  - Distance ≥ 6000m: Rounded to nearest **second** (banker's rounding)

### Geographic Bounds (Zimbabwe)
- **Latitude**: -22.5° to -15.5° South
- **Longitude**: 25.0° to 33.5° East

## Implementation Details

### Core Functions

1. **Geodetic to Grid Conversion**
   - `geodeticToGrid(lat, lon)` - Converts latitude/longitude to grid coordinates
   - Automatically selects the nearest central meridian
   - Returns { y, x, centralMeridian }

2. **Grid to Geodetic Conversion**
   - `gridToGeodetic(y, x, centralMeridian)` - Converts grid coordinates to latitude/longitude
   - Requires specifying the central meridian
   - Returns { lat, lon }

3. **Coordinate Formatting**
   - `decimalToDMS(decimal, isLng, precision)` - Converts decimal degrees to DMS format
   - `formatCoordinatesWithPrecision(lat1, lon1, lat2, lon2)` - Formats coordinates with automatic precision based on distance

### API Endpoints

- `POST /api/coordinates/geodetic-to-grid` - Convert geodetic to grid coordinates
- `POST /api/coordinates/grid-to-geodetic` - Convert grid to geodetic coordinates
- `POST /api/coordinates/format-with-precision` - Format coordinates with automatic precision

## Database Integration

### Survey Points Table Schema

The `survey_points` table now supports both geodetic (WGS84) and Zimbabwe Cadastral grid coordinates:

```sql
CREATE TABLE survey_points (
  id SERIAL PRIMARY KEY,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  point_number VARCHAR(50) NOT NULL,
  
  -- Geodetic coordinates (WGS84)
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  elevation DOUBLE PRECISION,
  
  -- Grid coordinates (Zimbabwe Cadastral System)
  y_coordinate DOUBLE PRECISION,  -- Westing
  x_coordinate DOUBLE PRECISION,  -- Southing
  central_meridian INTEGER CHECK (central_meridian IN (25, 27, 29, 31, 33)),
  
  -- PostGIS geometry
  geometry geometry(PointZ, 4326),
  
  -- Constraints
  CONSTRAINT chk_latitude CHECK (latitude >= -22.5 AND latitude <= -15.5),
  CONSTRAINT chk_longitude CHECK (longitude >= 25.0 AND longitude <= 33.5)
);
```

### Automatic Coordinate Transformation

Database triggers automatically:
1. Update the geometry column when lat/lon changes
2. Assign the nearest central meridian
3. Synchronize legacy x, y, z fields for backward compatibility

### Inserting Survey Points

```sql
-- Insert a point using geodetic coordinates
-- Grid coordinates and central meridian are auto-calculated
INSERT INTO survey_points (project_id, point_number, latitude, longitude, elevation)
VALUES (1, 'CP001', -17.8252, 31.0335, 1450.5);

-- The trigger automatically sets:
-- - geometry column
-- - central_meridian (31 for this longitude)
-- - x, y, z (legacy fields)
```

## API Usage Examples

### Backend (Node.js/JavaScript)

```javascript
import { geodeticToGrid, gridToGeodetic } from './utils/coordinateSystem.js';

// Convert Harare's coordinates to grid
const gridCoords = geodeticToGrid(-17.8252, 31.0335);
console.log(gridCoords);
// Output: { 
//   y: -3551.377,           // Westing (negative = east of meridian)
//   x: 1965611.534,         // Southing (positive, increasing southwards)
//   centralMeridian: 31     // 31°E
// }

// Convert grid back to geodetic
const geoCoords = gridToGeodetic(
  gridCoords.y, 
  gridCoords.x, 
  gridCoords.centralMeridian
);
console.log(geoCoords);
// Output: { lat: -17.8252, lon: 31.0335 }
```

### Frontend (Vue.js/TypeScript)

```typescript
import { useCoordinateSystem } from '@/composables/useCoordinateSystem';

const { geodeticToGrid, gridToGeodetic } = useCoordinateSystem();

// Convert to grid coordinates
const result = await geodeticToGrid(-17.8252, 31.0335);
console.log(`Y: ${result.y.toFixed(3)}m, X: ${result.x.toFixed(3)}m`);

// Convert back to geodetic
const geo = await gridToGeodetic(result.y, result.x, result.centralMeridian);
console.log(`Lat: ${geo.lat}°, Lon: ${geo.lon}°`);
```

### REST API Endpoints

#### 1. Geodetic to Grid Conversion

```bash
POST /api/coordinates/geodetic-to-grid
Content-Type: application/json

{
  "lat": -17.8252,
  "lon": 31.0335
}

# Response:
{
  "success": true,
  "data": {
    "y": -3551.377,
    "x": 1965611.534,
    "centralMeridian": 31,
    "lat": -17.8252,
    "lon": 31.0335
  }
}
```

#### 2. Grid to Geodetic Conversion

```bash
POST /api/coordinates/grid-to-geodetic
Content-Type: application/json

{
  "y": -3551.377,
  "x": 1965611.534,
  "centralMeridian": 31
}

# Response:
{
  "success": true,
  "data": {
    "lat": -17.8252,
    "lon": 31.0335,
    "y": -3551.377,
    "x": 1965611.534,
    "centralMeridian": 31
  }
}
```

#### 3. Format with Automatic Precision

```bash
POST /api/coordinates/format-with-precision
Content-Type: application/json

{
  "point1": { "lat": -17.82, "lon": 31.03 },
  "point2": { "lat": -17.83, "lon": 31.03 }
}

# Response:
{
  "success": true,
  "data": {
    "point1": {
      "lat": "17°49'12\"S",
      "lon": "31°1'48\"E"
    },
    "point2": {
      "lat": "17°49'48\"S",
      "lon": "31°1'48\"E"
    },
    "distance": 1110.5,
    "precision": "10 seconds"
  }
}
```

## Real-World Examples

### Example 1: Harare City Center
```javascript
const harare = { lat: -17.8252, lon: 31.0335 };
const grid = geodeticToGrid(harare.lat, harare.lon);
// Y: -3551.377m (negative = east of 31°E meridian)
// X: 1965611.534m (positive, ~1965km south of equator)
// Central Meridian: 31°E
```

### Example 2: Bulawayo
```javascript
const bulawayo = { lat: -20.1394, lon: 28.5596 };
const grid = geodeticToGrid(bulawayo.lat, bulawayo.lon);
// Y: 48765.432m (positive = west of 29°E meridian)
// X: 2231234.567m (positive, ~2231km south of equator)
// Central Meridian: 29°E
```

### Example 3: Survey Line with Distance Check
```javascript
const point1 = { lat: -17.8252, lon: 31.0335 };
const point2 = { lat: -17.8892, lon: 31.0445 };

const formatted = await formatCoordinatesWithPrecision(
  point1.lat, point1.lon,
  point2.lat, point2.lon
);

console.log(`Distance: ${formatted.distance.toFixed(2)}m`);
console.log(`Precision: ${formatted.precision}`);
// If distance >= 6000m: precision is "1 second"
// If distance < 6000m: precision is "10 seconds"
```

## Testing

Run the test suite to verify the implementation:

```bash
npm test
```

## References

- Clarke 1880 (Arc) ellipsoid parameters
- Transverse Mercator projection formulas
- Zimbabwe Cadastral Survey Regulations

## South-oriented usage in compute (Polar, Intersections)

SurveyPro’s compute tools implement the Zimbabwe cadastral convention directly on the grid plane using P(Y, X):

- Axes: Y increases westwards (westing), X increases southwards (southing)
- Directions: Bearings are measured from South (0° = South), increasing clockwise
  - 0° = South (positive X)
  - 90° = West (positive Y)
  - 180° = North (negative X)
  - 270° = East (negative Y)

Polar forward: given P(Y, X), distance d, and bearing β (south-oriented), the computed point Q(Y, X) is:

- ΔY = d · sin(β)
- ΔX = d · cos(β)
- Q = (Y + ΔY, X + ΔX)

Intersection (bearing–bearing): from P1(Y, X, β1) and P2(Y, X, β2), the intersection is found by solving two rays defined in the same south-oriented system. The application uses these definitions in the API endpoints:

- POST /api/compute/polar
- POST /api/compute/intersections/bearing-bearing

Notes and tips:

- When working near a central meridian, east-of-meridian Y values are negative, west-of-meridian Y values are positive.
- Southing (X) is always positive south of the Equator and increases with latitude southwards.
- UI labels in Lite explicitly show “P(Y, X)” and “Bearing (0° = South)” to avoid ambiguity.

### Worked examples

1) Polar forward

- Given P(Y,X) = (-3551.377, 1965611.534), distance d = 100.000 m, bearing β = 90° (West)
- ΔY = 100 · sin(90°) = +100.000; ΔX = 100 · cos(90°) = 0.000
- Q(Y,X) = (-3451.377, 1965611.534)

2) Bearing–Bearing intersection

- P1(Y,X,β1) = (-3551.377, 1965611.534, 45°)
- P2(Y,X,β2) = (-3500.000, 1965600.000, 200°)
- Solve two rays in south-oriented convention → Q ≈ (-3463.999, 1965698.912)

## Area computations and rounding policy

SurveyPro implements polygon area using the shoelace method directly in the P(Y, X) plane. The signed area follows the ring orientation (clockwise vs counterclockwise). The display and rounding policy aligns with common cadastral practice in Zimbabwe:

- Display unit policy:
  - If |Area| < 10,000 m² → display in square meters to the nearest whole m² (banker’s rounding)
  - If |Area| ≥ 10,000 m² → display in hectares to 4 decimal places (banker’s rounding)

- Edge checks and residuals for quality control:
  - Distances are rounded to 0.01 m (banker’s rounding)
  - Directions (south-oriented bearings) are rounded by segment length:
    - If distance < 6000 m: nearest 10 seconds
    - Otherwise: nearest 1 second

- Endpoint closure residuals are reported as ΣdY and ΣdX over the closed ring.

Endpoint reference:

- POST /api/compute/area
  - Body: `{ points: [{ y, x }, ...], save?: boolean, layer_id?: number }`
  - Returns: `{ ok, area: { signed_m2, abs_m2, display }, centroid, residuals?, saved? }`

## UI overlays and labeling (Lite)

The Lite module’s planar map presents overlays aligned with Zimbabwe cadastral practice:

- Light meter grid with the Central Meridian (Y=0) shown as a red dashed vertical line; the Equator (X=0) appears as a green dashed horizontal line when within view
- Axis tick labels use local qualifiers and spaces for thousands:
  - X ticks (on Y=0) labeled as Southing: “{meters} m S”
  - Y ticks (on X=0) labeled as Easting: “{meters} m E”
- Cursor overlay shows live P(Y, X) in planar mode and “lat, lon” in WGS84 preview
- Renderer badge displays the layer EPSG and, for Cape/Lo belts, the Central Meridian (CM) using an explicit EPSG→CM lookup
