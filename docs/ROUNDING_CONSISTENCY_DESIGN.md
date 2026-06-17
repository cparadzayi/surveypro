# Rounding Consistency Design: Database ↔ PDF

## Problem
Database trigger was using different rounding logic than PDF generation, causing inconsistencies between stored metadata and displayed values.

## Solution
Align database trigger with existing backend `zim-geo.js` implementation to ensure single source of truth.

## Backend Implementation (zim-geo.js)

### Banker's Rounding Function
```javascript
export function bankersRound(value, decimals = 0) {
  const factor = Math.pow(10, decimals)
  const n = value * factor
  const f = Math.floor(n)
  const r = n - f
  if (Math.abs(r - 0.5) < 1e-12) {
    // exactly half: round to even
    return (f % 2 === 0 ? f : f + 1) / factor
  }
  return Math.round(n) / factor
}
```

### Edge Metrics Function
```javascript
export function edgeMetricsYX(a, b) {
  const dy = b.y - a.y
  const dx = b.x - a.x
  const distance = Math.hypot(dy, dx)
  const bearingDeg = bearingSouthBetween(a, b)
  
  // SI 727 Rounding rules:
  const distRounded = bankersRound(distance, 2)  // 0.01m precision
  const secRes = distance < 6000 ? 10 : 1        // 10" or 1" based on distance
  const bearingRoundedDeg = roundBearingSouth(bearingDeg, secRes)
  
  return { dy, dx, distance, bearingDeg, distRounded, bearingRoundedDeg, secondsResolution: secRes }
}
```

## Database Implementation (PostgreSQL Trigger)

### Matching Logic
```sql
-- Store in metadata:
{
  "distance": bankers_round(distance, 2),  -- Rounded to 0.01m
  "bearingDeg": bearing,                   -- Full precision
  "dy": dy,                                -- Full precision
  "dx": dx                                 -- Full precision
}
```

### Display-Time Rounding
- **Distance**: Already rounded in database (2dp)
- **Bearing**: Rounded in PDF based on distance (<6000m=10", ≥6000m=1")
- **dy/dx**: Rounded in PDF to 2dp for residuals display

## Consistency Rules

| Value | Storage | Display | Rounding Method |
|-------|---------|---------|-----------------|
| Distance | 2dp | 2dp | Banker's (database) |
| Bearing | Full precision | 10" or 1" | Banker's (PDF) |
| dy | Full precision | 2dp | Banker's (PDF) |
| dx | Full precision | 2dp | Banker's (PDF) |
| Coordinates | Full precision | 2dp | Banker's (PDF) |

## Benefits

1. **Single Source of Truth**: Database stores same values PDF uses
2. **Consistency**: No discrepancies between UI and PDF
3. **Flexibility**: Full precision stored, rounded at display time
4. **SI 727 Compliance**: Banker's rounding throughout
5. **Maintainability**: One rounding implementation to maintain

## Implementation Files

- **Backend Logic**: `app-backend/src/utils/zim-geo.js`
- **Database Trigger**: `APPLY_CONSISTENT_BANKERS_ROUNDING.sql`
- **Migration**: `app-backend/migrations/061_trigger_with_bankers_rounding.sql`

## Testing

```sql
-- Verify consistency
SELECT 
  stand,
  (metadata->'residuals'->'edges'->0->>'distance')::numeric as db_distance,
  (metadata->'residuals'->'edges'->0->>'bearingDeg')::numeric as db_bearing
FROM land_parcels WHERE stand = '2474';
```

Compare with PDF output - values should match exactly after display-time rounding is applied.
