# Southern Hemisphere Coordinate System - Zimbabwe P(Y,X)

## Overview
SurveyPro uses the **Zimbabwe P(Y,X) coordinate convention** with **south-oriented bearings**, which is the standard cadastral system for southern Africa. This is fully compatible with Cape datum (EPSG:22285-22293) projections.

---

## Coordinate System Conventions

### **P(Y,X) Notation**

In Zimbabwe cadastral surveys, coordinates are written as **P(Y,X)** where:

- **P**: Point identifier (e.g., "2342C")
- **Y**: Westing coordinate (distance west from central meridian)
- **X**: Southing coordinate (distance south from equator)

**Example**: `P(96751.29, -2247626.76)`
- Point at 96,751.29 meters west of Lo29 (29°E)
- Point at 2,247,626.76 meters south of equator

---

## Y-Axis: Westing

### **Direction**
- **Positive (+)**: West of central meridian
- **Negative (-)**: East of central meridian
- **Zero (0)**: On the central meridian

### **Central Meridians (Zimbabwe)**
| Meridian | Longitude | Coverage |
|----------|-----------|----------|
| Lo25 | 25°E | Western Zimbabwe |
| Lo27 | 27°E | |
| Lo29 | 29°E | Central (Harare, Bulawayo) |
| Lo31 | 31°E | Eastern Zimbabwe |
| Lo33 | 33°E | Far Eastern |

### **Example Values**
```
Y = +100,000 m  → 100 km west of central meridian
Y = 0 m         → On central meridian
Y = -50,000 m   → 50 km east of central meridian
```

---

## X-Axis: Southing

### **Direction**
- **Positive (+)**: South of equator (all of Zimbabwe)
- **Negative (-)**: North of equator (not applicable in Zimbabwe)
- **Zero (0)**: On the equator

### **Zimbabwe Location**
Zimbabwe is entirely in the Southern Hemisphere:
- **Latitude Range**: ~15°S to ~22°S
- **X Coordinate Range**: ~1,650,000 m to ~2,450,000 m (south of equator)

### **Example Values**
```
X = +1,650,000 m  → ~15°S (northern Zimbabwe)
X = +2,000,000 m  → ~18°S (Harare region)
X = +2,450,000 m  → ~22°S (southern Zimbabwe)
```

**Note**: All X values in Zimbabwe are positive (south of equator)

---

## Bearing Convention: South-Oriented

### **Reference Direction**
In Southern Hemisphere cadastral surveys, bearings are measured from **South** (not North):

```
        180° (North)
             ↑
             |
270° (East) ← + → 90° (West)
             |
             ↓
          0° (South)
```

### **Bearing Values**
| Bearing | Direction | Cardinal |
|---------|-----------|----------|
| 0° | South | S |
| 45° | South-West | SW |
| 90° | West | W |
| 135° | North-West | NW |
| 180° | North | N |
| 225° | North-East | NE |
| 270° | East | E |
| 315° | South-East | SE |

### **Rotation**
- **Clockwise** from South
- Same rotation direction as Northern Hemisphere (from North)

---

## Why South-Oriented?

### **1. Historical Continuity**
All legacy cadastral surveys in Zimbabwe, South Africa, Botswana, and Namibia use south-oriented bearings. Changing this would break compatibility with:
- Historical survey records
- Existing cadastral plans
- Legal property descriptions
- Survey monument records

### **2. Astronomical Alignment**
In the Southern Hemisphere:
- **South Celestial Pole** is the reference for astronomical observations
- Stars rotate around the south celestial pole
- Surveyors traditionally oriented instruments to south

### **3. Practical Field Work**
- **Sun Path**: In Southern Hemisphere, sun transits through **north** at solar noon
- **Shadow Direction**: Shadows point south at noon
- **South is Stable**: Using south as reference avoids confusion with sun position

### **4. Regional Standard**
Consistent with:
- South African cadastral system
- Botswana survey regulations
- Namibian cadastral standards
- Historical British colonial survey practices in southern Africa

---

## Cape Datum Compatibility

### **EPSG Codes**
The Cape datum projections are correctly defined for Southern Hemisphere:

| EPSG | Name | Hemisphere | Origin |
|------|------|------------|--------|
| 22285 | Cape / Lo25 | Southern | Equator @ 25°E |
| 22287 | Cape / Lo27 | Southern | Equator @ 27°E |
| 22289 | Cape / Lo29 | Southern | Equator @ 29°E |
| 22291 | Cape / Lo31 | Southern | Equator @ 31°E |
| 22293 | Cape / Lo33 | Southern | Equator @ 33°E |

### **Projection Parameters**
```
PROJCS["Cape / Lo29",
    PARAMETER["latitude_of_origin", 0],      ← Equator (0° latitude)
    PARAMETER["central_meridian", 29],       ← 29°E longitude
    PARAMETER["false_easting", 0],           ← No offset
    PARAMETER["false_northing", 0],          ← No offset
    PARAMETER["scale_factor", 1]]            ← True scale at meridian
```

**Key Points**:
- Origin at **equator** (latitude 0°)
- No false northing/easting offsets
- Coordinates naturally positive south of equator
- Y-axis increases westward
- X-axis increases southward

---

## Coordinate Examples

### **Harare (Capital City)**
Approximate coordinates in Cape / Lo29 (EPSG:22289):

```
Latitude:  -17.8292°S
Longitude: 31.0522°E

P(Y,X) coordinates:
Y ≈ -220,000 m  (east of Lo29 central meridian)
X ≈ +1,975,000 m (south of equator)
```

### **Bulawayo (Second City)**
Approximate coordinates in Cape / Lo29 (EPSG:22289):

```
Latitude:  -20.1500°S
Longitude: 28.5833°E

P(Y,X) coordinates:
Y ≈ +45,000 m   (west of Lo29 central meridian)
X ≈ +2,230,000 m (south of equator)
```

---

## Comparison with Northern Hemisphere

### **Northern Hemisphere (e.g., UTM)**
```
Coordinate: P(X,Y) or (Easting, Northing)
X-axis: Easting (positive eastward)
Y-axis: Northing (positive northward)
Bearing: 0° = North
Origin: Equator @ central meridian
```

### **Southern Hemisphere (Zimbabwe)**
```
Coordinate: P(Y,X) or (Westing, Southing)
Y-axis: Westing (positive westward)
X-axis: Southing (positive southward)
Bearing: 0° = South
Origin: Equator @ central meridian
```

### **Key Differences**
| Aspect | Northern | Southern (Zimbabwe) |
|--------|----------|---------------------|
| Notation | P(X,Y) | P(Y,X) |
| X-axis | Easting → | ← Westing (Y) |
| Y-axis | Northing ↑ | Southing ↓ (X) |
| Bearing 0° | North | South |
| Axis Order | X, Y | Y, X |

---

## Implementation in SurveyPro

### **Coordinate Storage**
```typescript
interface AdjustedCoordinate {
  pointId: string
  y: number  // Westing (meters west of central meridian)
  x: number  // Southing (meters south of equator)
  // ... other fields
}
```

### **GeoJSON Format**
```json
{
  "type": "Point",
  "coordinates": [96751.29, -2247626.76]
}
```
**Order**: `[Y, X]` (westing, southing)

### **Database Storage**
```sql
CREATE TABLE features (
  geometry JSONB  -- {"type": "Point", "coordinates": [Y, X]}
);
```

### **Map Display**
For north-up map display using Leaflet:
```typescript
// Convert Zimbabwe P(Y,X) to Leaflet LatLng
const latlng = L.latLng(-point.x, -point.y)
// Negate both to flip: south→north, west→east
```

---

## Bearing Calculations

### **Forward Bearing (South-Oriented)**
```typescript
function calculateBearing(from: Point, to: Point): number {
  const dy = to.y - from.y  // Westing difference
  const dx = to.x - from.x  // Southing difference
  
  // atan2(dy, dx) gives angle from south (0°)
  let bearing = Math.atan2(dy, dx) * 180 / Math.PI
  
  // Normalize to 0-360°
  if (bearing < 0) bearing += 360
  
  return bearing
}
```

### **Example**
```
From: P(100000, 2000000)
To:   P(100100, 2000100)

dy = 100 m (100m west)
dx = 100 m (100m south)

bearing = atan2(100, 100) = 45°
Direction: South-West (SW)
```

---

## Validation Rules

### **Y Coordinate (Westing)**
```typescript
// Typical range for Zimbabwe
const MIN_Y = -500000  // 500 km east of meridian
const MAX_Y = +500000  // 500 km west of meridian

function isValidY(y: number): boolean {
  return y >= MIN_Y && y <= MAX_Y
}
```

### **X Coordinate (Southing)**
```typescript
// Zimbabwe latitude range: ~15°S to ~22°S
const MIN_X = 1650000  // ~15°S (northern border)
const MAX_X = 2450000  // ~22°S (southern border)

function isValidX(x: number): boolean {
  return x >= MIN_X && x <= MAX_X
}
```

### **Bearing (South-Oriented)**
```typescript
function isValidBearing(bearing: number): boolean {
  return bearing >= 0 && bearing < 360
}
```

---

## Common Mistakes to Avoid

### ❌ **Mistake 1: Using North-Oriented Bearings**
```typescript
// WRONG: Assuming 0° = North
const bearing = 0  // This is SOUTH, not North!
```

### ✅ **Correct**
```typescript
// Bearing 0° = South in Zimbabwe
const bearingToNorth = 180  // North is 180°
```

### ❌ **Mistake 2: Swapping Y and X**
```typescript
// WRONG: Using (X, Y) order
const point = { x: 96751.29, y: -2247626.76 }
```

### ✅ **Correct**
```typescript
// Correct: P(Y, X) order
const point = { y: 96751.29, x: -2247626.76 }
```

### ❌ **Mistake 3: Expecting Negative X Values**
```typescript
// WRONG: Thinking X should be negative in Southern Hemisphere
if (x < 0) { /* Zimbabwe is south of equator */ }
```

### ✅ **Correct**
```typescript
// Correct: X is positive south of equator
if (x > 0) { /* Zimbabwe is south of equator */ }
```

---

## QGIS Compatibility

### **Importing Data**
When importing Zimbabwe survey data into QGIS:

1. **Set CRS**: EPSG:22289 (or appropriate Lo meridian)
2. **Coordinate Order**: Ensure Y, X order is preserved
3. **Bearing Display**: Configure for south-oriented bearings

### **Exporting Data**
When exporting from QGIS:

```
Format: GeoJSON
CRS: EPSG:22289 (Cape / Lo29)
Coordinate Order: Y, X (westing, southing)
Precision: 2 decimal places (centimeter accuracy)
```

---

## Summary

✅ **Coordinate System**: Zimbabwe P(Y,X) with Cape datum  
✅ **Y-Axis**: Westing (positive westward from central meridian)  
✅ **X-Axis**: Southing (positive southward from equator)  
✅ **Bearing Reference**: South (0° = South, clockwise rotation)  
✅ **EPSG Codes**: 22285-22293 (Cape / Lo25-Lo33)  
✅ **Hemisphere**: Southern (all X values positive)  
✅ **Historical**: Consistent with legacy cadastral surveys  
✅ **Regional**: Standard across southern Africa  

The system is **correctly configured** for Southern Hemisphere cadastral surveys! 🌍
