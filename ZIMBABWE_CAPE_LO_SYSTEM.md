# Zimbabwe Cape Lo Coordinate System

## Overview
Zimbabwe uses the Cape Lo Transverse Mercator projection system based on the Clarke 1880 (modified) ellipsoid. This is a legacy system from the Rhodesian era.

## Coordinate Convention

### Cadastral Survey Notation: P(Y, X)
- **Y**: Easting/Westing (perpendicular distance from central meridian, **-200,000m to +200,000m**)
  - **Negative Y**: West of central meridian
  - **Positive Y**: East of central meridian
- **X**: Northing (distance from false origin along meridian, 0 to 3,000,000m)

### Example from Sample Data
```
Point ST1: Y=96649.178, X=2247915
Point ST2: Y=97128.263, X=2248259.2
```

## Cape Lo Zones for Zimbabwe

| Zone | SRID | Central Meridian | Typical Y Range | Typical X Range |
|------|------|------------------|-----------------|------------------|
| Lo25 | 22285 | 25°E | -200,000m to +200,000m | 0 - 3,000,000m |
| Lo27 | 22287 | 27°E | -200,000m to +200,000m | 0 - 3,000,000m |
| Lo29 | 22289 | 29°E | -200,000m to +200,000m | 0 - 3,000,000m |
| Lo31 | 22291 | 31°E | -200,000m to +200,000m | 0 - 3,000,000m |
| Lo33 | 22293 | 33°E | -200,000m to +200,000m | 0 - 3,000,000m |

## Proj4 Definition
```
+proj=tmerc +lat_0=0 +lon_0=[CM] +k=1 +x_0=0 +y_0=0 +ellps=clrk80 +towgs84=-136,-108,-292,0,0,0,0 +units=m +no_defs
```
Where [CM] is the central meridian (25, 27, 29, 31, or 33 degrees East).

## Coordinate Transformation for Leaflet/Proj4

### From Zimbabwe P(Y, X) to Proj4Leaflet [Easting, Northing]:

**CRITICAL**: Proj4 expects [Easting, Northing] format, but Zimbabwe uses P(Y, X) where:
- Y is perpendicular to meridian (like Easting, but called "Westing")
- X is along meridian (like Northing)

**Transformation**:
```typescript
// Zimbabwe data: { x: Southing/Northing, y: Westing }
// Proj4 expects: [Easting, Northing] = [-Y, X] or [Y, X] depending on interpretation

// For Zimbabwe Cape Lo:
const proj4Coords = [point.y, point.x] // [Y (westing), X (northing)]
```

## False Origins
Zimbabwe Cape Lo uses:
- **False Easting**: 0m at central meridian
- **False Northing**: 0m at equator

## Datum
- **Ellipsoid**: Clarke 1880 (Modified)
- **Datum Transformation**: Helmert (7-parameter)
  - dX: -136m
  - dY: -108m
  - dZ: -292m

## References
- Survey Act (Zimbabwe)
- Cadastral Survey regulations
- EPSG Registry: 22285-22293
