# QGIS Coordinate Display Fix

## Problem

QGIS displays imported survey points far outside Zimbabwe, while MapLibre shows them correctly in central Zimbabwe.

## Root Cause Analysis

The issue is a **coordinate order mismatch** between PostGIS storage and EPSG:22291 axis definition.

### EPSG:22291 Axis Definition

```
AXIS["Westing", WEST],   ← First axis (X ordinate)
AXIS["Southing", SOUTH]  ← Second axis (Y ordinate)
```

**This means in PostGIS with SRID 22291:**
- **X ordinate = Westing** (~97,000 meters)
- **Y ordinate = Southing** (~2,247,000 meters)

### Current Storage (WRONG)

**CSV Import Code:** `app-backend/src/routes/csvImports.js`

```javascript
// Line 601: New points insert
ST_MakePoint(newPt.x, newPt.y)
// where newPt.x = Westing (97k), newPt.y = Southing (2.2M)
```

**This stores:**
- X ordinate = Westing (97k) ✓
- Y ordinate = Southing (2.2M) ✓

**Wait, this looks correct!**

Let me check what the CSV parser is actually sending...

### CSV Parser Analysis

**File:** `app-frontend/src/utils/cadastral-csv.ts`

**Lines 212-213:**
```typescript
const yValue = getColumnValue(record, ['y', 'y (westing)', ...]);
const xValue = getColumnValue(record, ['x', 'x (northing)', 'x (southing)', ...]);
```

**CSV columns:**
- Y column: 97538.004 (Westing)
- X column: 2247107.9 (Southing)

**Parser assigns:**
- `originalY = 97538.004` (from Y column = Westing)
- `originalX = 2247107.9` (from X column = Southing)

**Point object created (Line 284-288):**
```typescript
const point: CadastralPoint = {
  id: record['point'] || '',
  original: {
    y: originalY,  // 97538 (Westing)
    x: originalX   // 2247107 (Southing)
  },
  ...
}
```

**Sent to backend (CadastralStandardView.vue Line 2394-2398):**
```typescript
new_points: analysis.newPoints.map(p => ({
  id: p.id,
  y: p.coordinate.y,  // 97538 (Westing)
  x: p.coordinate.x   // 2247107 (Southing)
}))
```

**Backend receives:**
- `newPt.y = 97538` (Westing)
- `newPt.x = 2247107` (Southing)

**Backend stores (csvImports.js Line 599-601):**
```javascript
ST_MakePoint(newPt.x, newPt.y)
= ST_MakePoint(2247107, 97538)
```

**This stores:**
- X ordinate = 2247107 (Southing) ✗ WRONG!
- Y ordinate = 97538 (Westing) ✗ WRONG!

**QGIS interprets with EPSG:22291:**
- Westing (X ordinate) = 2,247,107 meters ← HUGE! Way outside Zimbabwe
- Southing (Y ordinate) = 97,538 meters ← TINY! Way north

**This places the point FAR outside Zimbabwe!**

---

## The Fix

We need to swap the coordinate order in `ST_MakePoint()` calls.

### Fix 1: csvImports.js - Execute Merge Endpoint

**File:** `app-backend/src/routes/csvImports.js`

**Line 530 (Matched points update):**
```javascript
// BEFORE (WRONG):
ST_SetSRID(ST_MakePoint($1, $2), $6)
[match.coordinate.x, match.coordinate.y, ...]
// Stores: X=Southing, Y=Westing (WRONG!)

// AFTER (CORRECT):
ST_SetSRID(ST_MakePoint($1, $2), $6)
[match.coordinate.y, match.coordinate.x, ...]
// Stores: X=Westing, Y=Southing (CORRECT!)
```

**Line 599 (New points insert):**
```javascript
// BEFORE (WRONG):
ST_SetSRID(ST_MakePoint($3, $4), $8)
[project_id, newPt.id, newPt.x, newPt.y, ...]
// Stores: X=Southing, Y=Westing (WRONG!)

// AFTER (CORRECT):
ST_SetSRID(ST_MakePoint($3, $4), $8)
[project_id, newPt.id, newPt.y, newPt.x, ...]
// Stores: X=Westing, Y=Southing (CORRECT!)
```

### Fix 2: coordinatePoint.js - Model Create Methods

**File:** `app-backend/src/models/coordinatePoint.js`

**Line 61 (Single point create):**
```javascript
// BEFORE (WRONG):
ST_SetSRID(ST_MakePoint($3, $4), $9)
[projectId, name, x, y, ...]
// Stores: X=Southing, Y=Westing (WRONG!)

// AFTER (CORRECT):
ST_SetSRID(ST_MakePoint($3, $4), $9)
[projectId, name, y, x, ...]
// Stores: X=Westing, Y=Southing (CORRECT!)
```

**Line 85 (Batch create):**
```javascript
// BEFORE (WRONG):
ST_SetSRID(ST_MakePoint($${paramIndex+2}, $${paramIndex+3}), $${paramIndex+4})
params.push(projectId, pt.name, pt.x, pt.y, srid, ...)
// Stores: X=Southing, Y=Westing (WRONG!)

// AFTER (CORRECT):
ST_SetSRID(ST_MakePoint($${paramIndex+2}, $${paramIndex+3}), $${paramIndex+4})
params.push(projectId, pt.name, pt.y, pt.x, srid, ...)
// Stores: X=Westing, Y=Southing (CORRECT!)
```

**Line 130 (Point update):**
```javascript
// BEFORE (WRONG):
ST_SetSRID(ST_MakePoint($2, $3), $9)
// Called with: update(db, id, { name, x, y, ... })
// Stores: X=Southing, Y=Westing (WRONG!)

// AFTER (CORRECT):
ST_SetSRID(ST_MakePoint($2, $3), $9)
// Need to swap the parameter order in the query
// Or swap when calling: update(db, id, { name, x: y, y: x, ... })
```

### Fix 3: Update Comments

All comments saying "X=Southing, Y=Westing" should be updated to "X=Westing, Y=Southing" to match EPSG:22291 axis definition.

---

## Why MapLibre Works

MapLibre retrieves coordinates with:
```javascript
ST_Y(geom) as y,  // Returns Y ordinate (currently Westing due to bug)
ST_X(geom) as x   // Returns X ordinate (currently Southing due to bug)
```

**Current (buggy) storage:**
- X ordinate = Southing (2.2M)
- Y ordinate = Westing (97k)

**API returns:**
- `y = ST_Y(geom) = 97k` (Westing)
- `x = ST_X(geom) = 2.2M` (Southing)

**MapLibre transforms:**
```typescript
proj4(EPSG:22291, EPSG:4326, [-point.y, -point.x])
= proj4(EPSG:22291, EPSG:4326, [-97k, -2.2M])
```

**Proj4 with `+axis=wsu` expects:** [Easting, Northing]
- Easting = -Westing = -97k ✓
- Northing = -Southing = -2.2M ✓

**This happens to work because:**
1. PostGIS stores coordinates swapped
2. API retrieves them swapped back
3. MapLibre negates them in the right order for Proj4

**It's a double-negative that cancels out!**

But QGIS reads directly from PostGIS with the SRID definition, so it sees the swapped coordinates and displays them wrong.

---

## Migration Required

After fixing the code, existing data in the database will still be wrong. You'll need to:

**Option 1: Re-import all CSV data**
- Delete existing coordinate points
- Re-import with fixed code

**Option 2: Run SQL migration to swap coordinates**
```sql
-- BACKUP FIRST!
-- This swaps X and Y ordinates for all points

UPDATE coordinate_points
SET geom = ST_SetSRID(
  ST_MakePoint(ST_Y(geom), ST_X(geom)),
  ST_SRID(geom)
)
WHERE project_id = <project_id>;
```

**Verification query:**
```sql
SELECT 
  name,
  ST_X(geom) as x_westing,
  ST_Y(geom) as y_southing,
  ST_X(ST_Transform(geom, 4326)) as wgs84_lon,
  ST_Y(ST_Transform(geom, 4326)) as wgs84_lat
FROM coordinate_points
WHERE project_id = <project_id>
LIMIT 5;

-- Expected after fix:
-- x_westing: ~97,000 (Westing)
-- y_southing: ~2,247,000 (Southing)
-- wgs84_lon: ~30.12 (in Zimbabwe)
-- wgs84_lat: ~-20.3 (in Zimbabwe)
```

---

## Summary

**Problem:** Coordinates stored in wrong order in PostGIS
- Previously: X=Southing, Y=Westing (WRONG)
- Now fixed: X=Westing, Y=Southing (per EPSG:22291)

**Why QGIS failed:** Reads coordinates with SRID definition, saw swapped values

**Why MapLibre worked:** Double-swap canceled out (storage swap + retrieval swap)

**Fix Applied:** ✅ Swapped parameter order in all `ST_MakePoint()` calls

**Files Fixed:**
1. ✅ `app-backend/src/routes/csvImports.js` (Lines 534, 601)
2. ✅ `app-backend/src/models/coordinatePoint.js` (Lines 62, 85, 137)

**Next Steps:**
1. Run `fix_coordinate_order_migration.sql` to fix existing data
2. Verify in QGIS that points now appear in Zimbabwe
3. Re-import CSV data (optional alternative to migration)
