# Calculations Part 2 - Template Format Update

## Overview
Updated the PDF output to match the official cadastral survey template format with proper table structure and bearing information.

## Template Format

### Header Format
```
Stand/Erf: Outside Figure Data GP 02
```
(Instead of numbered list format)

### Table Structure

The boundary points table now includes all required columns:

| Column | Description | Format | Example |
|--------|-------------|--------|---------|
| **Beacon Name** | Point identifier | String | 531a, 536b, ZT3 |
| **Y** | Westing coordinate | 2 decimals | 96988.81 |
| **X** | Southing coordinate | 2 decimals | 2251544.61 |
| **Distance (m)** | Distance to next point | 2 decimals | 161.85 |
| **Direction (° ' ")** | Bearing in DMS format | Deg°Min'Sec" | 305°05'30" |
| **dy** | Y difference (residual) | 2 decimals | 0.00 |
| **dx** | X difference (residual) | 2 decimals | 0.00 |

### Visual Styling

**Header Row:**
- Background: Blue (#2980B9)
- Text: White, bold
- Font size: 8pt

**Data Rows:**
- Alternating backgrounds (white/light gray)
- Font size: 8pt
- Black text

**First Point:**
- Has coordinates (Y, X)
- No distance, direction, dy, dx (empty cells)

**Subsequent Points:**
- All columns populated
- Distance calculated from previous point
- Direction shows bearing to next point
- dy/dx show coordinate differences

## Implementation Details

### Bearing Conversion

Decimal degrees are converted to Degrees-Minutes-Seconds format:

```typescript
function formatBearing(decimalDegrees: number): string {
  const degrees = Math.floor(decimalDegrees);
  const minutesDecimal = (decimalDegrees - degrees) * 60;
  const minutes = Math.floor(minutesDecimal);
  const seconds = Math.round((minutesDecimal - minutes) * 60);
  
  return `${degrees}°${minutes.toString().padStart(2, '0')}'${seconds.toString().padStart(2, '0')}"`;
}
```

**Example Conversions:**
- 305.0917° → 305°05'30"
- 288.7278° → 288°43'40"
- 274.3722° → 274°22'20"

### Data Source

All data comes from the `areaResult.residuals.edges` array:

```typescript
interface Edge {
  index: number;
  from: { y: number; x: number; };
  to: { y: number; x: number; };
  dy: number;           // Y difference
  dx: number;           // X difference
  distance: number;     // Distance in meters
  bearingDeg: number;   // Bearing in decimal degrees
  // ... other properties
}
```

### Column Widths (in mm)

```typescript
const colBeacon = margin + 5;      // 25mm
const colY = colBeacon + 22;       // 47mm
const colX = colY + 28;            // 75mm
const colDistance = colX + 28;     // 103mm
const colDirection = colDistance + 22; // 125mm
const colDy = colDirection + 28;   // 153mm
const colDx = colDy + 18;          // 171mm
```

## PDF Output Example

```
CALCULATIONS PART 2
AREA COMPUTATIONS

Coordinate System: Lo 29° (EPSG:20937)
Date Generated: 10/27/2025
Total Parcels: 1

Stand/Erf: Outside Figure Data GP 02

Area: 12,345.67 m²
Centroid: Y = 96900.50, X = 2251700.25
Consistency: ΣdY = 0.00 m, ΣdX = 0.00 m

Boundary Points:

┌──────────────┬──────────┬────────────┬──────────────┬──────────────────┬──────┬──────┐
│ Beacon Name  │    Y     │     X      │ Distance (m) │ Direction (°'")  │  dy  │  dx  │
├──────────────┼──────────┼────────────┼──────────────┼──────────────────┼──────┼──────┤
│ 531a         │ 96988.81 │ 2251544.61 │              │                  │      │      │
│ 536b         │ 96856.38 │ 2251637.65 │    161.85    │   305°05'30"     │ 0.00 │ 0.00 │
│ 607a         │ 96842.28 │ 2251642.43 │     14.89    │   288°43'40"     │ 0.00 │ 0.00 │
│ 600b         │ 96792.72 │ 2251646.22 │     49.70    │   274°22'20"     │ 0.00 │ 0.00 │
│ 600c         │ 96779.41 │ 2251656.67 │     16.92    │   308°08'10"     │ 0.00 │ 0.00 │
│ 598a         │ 96769.08 │ 2251662.87 │     12.05    │   300°58'20"     │ 0.00 │ 0.00 │
│ ...          │ ...      │ ...        │     ...      │   ...            │ ...  │ ...  │
└──────────────┴──────────┴────────────┴──────────────┴──────────────────┴──────┴──────┘
```

## Key Features

1. **Professional Appearance**
   - Matches official cadastral survey format
   - Blue header with white text
   - Alternating row colors for readability

2. **Complete Information**
   - All required survey data in one table
   - Bearing information in standard DMS format
   - Residuals (dy, dx) for quality control

3. **Accurate Calculations**
   - Distance between consecutive points
   - Bearing from point to point
   - Coordinate differences

4. **First Point Handling**
   - Shows coordinates only
   - Empty cells for distance/direction/residuals
   - Consistent with surveying conventions

## Comparison with Previous Format

### Before (Simple Format)
- 4 columns: Point, Y, X, Distance
- No bearing information
- No residuals
- Plain styling

### After (Template Format)
- 7 columns: Beacon Name, Y, X, Distance, Direction, dy, dx
- Complete bearing information in DMS
- Residuals for quality control
- Professional blue header
- Alternating row colors

## Benefits

1. **Standards Compliance**: Matches official cadastral survey format
2. **Complete Documentation**: All required information in one table
3. **Professional Output**: Suitable for submission to authorities
4. **Quality Control**: Residuals visible for verification
5. **Navigation Aid**: Bearings help with field verification

## Usage

The template format is automatically applied when generating the PDF:

1. Define parcels with boundary points
2. Compute areas
3. Click "📄 Download Areas - PDF"
4. PDF generated with template format

No additional configuration required - the format is built into the PDF generator.

## Notes

- Bearing convention: Azimuth from north (0°-360°)
- Coordinate convention: Zimbabwe P(Y,X) system
- Distance precision: 2 decimal places (centimeter accuracy)
- Coordinate precision: 2 decimal places (centimeter accuracy)
- Residuals typically 0.00 for computed coordinates
- First point has no previous point, hence empty distance/direction
