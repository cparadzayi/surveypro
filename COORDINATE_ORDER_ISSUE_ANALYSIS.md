# Coordinate Order Issue Analysis - QGIS vs MapLibre

## Problem Statement

**Symptom:** QGIS displays imported survey points far outside Zimbabwe, while MapLibre shows them correctly in central Zimbabwe.

**Root Cause:** Coordinate order mismatch in PostGIS `ST_MakePoint()` calls.

---

## Cape Lo Coordinate Convention

**Zimbabwe Cape Lo (Gauss-Conformal) uses south-oriented axes:**

- **Y = Westing** (positive west from central meridian) - Range: ~96,000 - 98,000 meters
- **X = Southing** (positive south from equator) - Range: ~2,247,000 - 2,248,000 meters

**Your sample data:**
```
Point P2: Y=97538.004 (Westing), X=2247107.9 (Southing)
```

---

## PostGIS ST_MakePoint Convention

**PostGIS `ST_MakePoint(x, y)` expects:**
- **First parameter (x):** Longitude-like coordinate (smaller value)
- **Second parameter (y):** Latitude-like coordinate (larger value)

**For Cape Lo with south-oriented axes:**
- **First parameter should be:** Y (Westing ~97k) - the "longitude-like" value
- **Second parameter should be:** X (Southing ~2.2M) - the "latitude-like" value

**Correct call:** `ST_MakePoint(Y, X)` = `ST_MakePoint(97538.004, 2247107.9)`

---

## Current Code Analysis

### **Issue 1: csvImports.js - INCORRECT ORDER**

**File:** `app-backend/src/routes/csvImports.js`

**Lines 527-534 (Matched points update):**
```javascript
// WRONG: Comments say one thing, code does another
// Comment says: match.coordinate has: y=Southing, x=Westing
// Comment says: So we pass: ST_MakePoint(x, y) = ST_MakePoint(Westing, Southing)
await client.query(
  `UPDATE coordinate_points
   SET geom = ST_SetSRID(ST_MakePoint($1, $2), $6),
       import_id = $3, name = $4
   WHERE id = $5`,
  [match.coordinate.x, match.coordinate.y, import_id, match.newId, match.oldDbId, srid]
  // ^^^ WRONG: Passing (x, y) = (Westing, Southing)
  // This stores Westing as X ordinate, Southing as Y ordinate
);
```

**Lines 594-601 (New points insert):**
```javascript
// WRONG: Same issue
// Comment says: CSV provides: newPt.y=Southing, newPt.x=Westing
// Comment says: So we pass: ST_MakePoint(newPt.x, newPt.y) = ST_MakePoint(Westing, Southing)
const result = await client.query(
  `INSERT INTO coordinate_points 
   (project_id, name, geom, status, description, import_id)
   VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), $8), $5, $6, $7)
   RETURNING id`,
  [project_id, newPt.id, newPt.x, newPt.y, newPt.status, newPt.description, import_id, srid]
  // ^^^ WRONG: Passing (x, y) = (Westing, Southing)
);
```

**What's actually happening:**
- `ST_MakePoint(Westing, Southing)` = `ST_MakePoint(97538, 2247107)`
- PostGIS stores: X ordinate = 97538, Y ordinate = 2247107
- QGIS reads: X = 97538 (thinks it's Westing), Y = 2247107 (thinks it's Southing)
- **But the SRID definition says X should be Westing (~97k) and Y should be Southing (~2.2M)**
- **So QGIS interprets: Westing = 97538 ✓, Southing = 2247107 ✓**
- **This is CORRECT for EPSG:22291!**

Wait, let me re-analyze this...

---

## Re-Analysis: EPSG:22291 Axis Order

**EPSG:22291 Definition:**
```
AXIS["Westing", WEST],
AXIS["Southing", SOUTH]
```

**This means:**
- **First axis (X):** Westing
- **Second axis (Y):** Southing

**PostGIS storage with SRID 22291:**
- `ST_MakePoint(x, y)` where x=first axis, y=second axis
- For EPSG:22291: x=Westing, y=Southing
- **Correct call:** `ST_MakePoint(Westing, Southing)`

**Current code:**
```javascript
ST_MakePoint(newPt.x, newPt.y)
// where newPt.x = Westing, newPt.y = Southing
```

**This is CORRECT!**

---

## So Why Does QGIS Show Wrong Location?

Let me check what MapLibre is doing differently...

### **MapLibre Coordinate Retrieval**

**File:** `app-backend/src/models/coordinatePoint.js` (Lines 15-32)

```javascript
async findByProject(dbConnection = db, projectId) {
  const result = await dbConnection.query(
    `SELECT 
      id, project_id, name, geom, elevation, description, status,
      survey_date, surveyor, created_at, updated_at,
      ST_Y(geom) as y,
      ST_X(geom) as x
     FROM coordinate_points 
     WHERE project_id = $1 
     ORDER BY name`,
    [projectId]
  )
  // Cape Lo / Gauss Lo coordinate convention:
  // - Y = Westing (~97k range)
  // - X = Southing (~2.2M range)
  // ST_MakePoint(y, x) stores Y as X ordinate, X as Y ordinate
  // So ST_Y returns Y (Westing ~97k), ST_X returns X (Southing ~2.2M)
  return result.rows
}
```

**The comment is WRONG!**

If we stored with `ST_MakePoint(Westing, Southing)`:
- PostGIS X ordinate = Westing (97k)
- PostGIS Y ordinate = Southing (2.2M)

Then:
- `ST_X(geom)` returns Westing (97k)
- `ST_Y(geom)` returns Southing (2.2M)

**But the query aliases them as:**
- `ST_Y(geom) as y` → Returns Southing (2.2M) and calls it "y"
- `ST_X(geom) as x` → Returns Westing (97k) and calls it "x"

**So the API returns:**
```javascript
{
  x: 97538,      // Westing (from ST_X)
  y: 2247107     // Southing (from ST_Y)
}
```

**Then MapLibre transforms this with:**
```typescript
// coordinateTransform.ts line 89
const [lng, lat] = proj4(sourceEPSG, 'EPSG:4326', [-point.y, -point.x]);
// = proj4(EPSG:22291, EPSG:4326, [-2247107, -97538])
```

**This is treating:**
- point.y (2247107) as the first coordinate (negated to -2247107)
- point.x (97538) as the second coordinate (negated to -97538)

**For Proj4 with `+axis=wsu` (West-South-Up):**
- First coordinate should be Easting (negated Westing)
- Second coordinate should be Northing (negated Southing)

**So Proj4 receives:**
- Easting = -2247107 (WRONG! This is negated Southing)
- Northing = -97538 (WRONG! This is negated Westing)

**This should give wrong results, but MapLibre shows correctly?**

Let me check the actual Proj4 transformation...

---

## The Real Issue

**I think the problem is:**

1. **PostGIS stores:** `ST_MakePoint(Westing, Southing)` with SRID 22291
2. **QGIS reads with SRID 22291:** Expects (Westing, Southing) order
3. **QGIS displays:** Uses the coordinates as-is with EPSG:22291 definition
4. **Result:** Should be correct!

**But QGIS shows wrong location, so either:**
- A) The SRID in PostGIS is wrong
- B) The coordinate values stored are wrong
- C) QGIS is misinterpreting the SRID

**Let me check what's actually stored in the database...**

We need to run a SQL query to see:
1. What SRID is stored
2. What X and Y ordinates are stored
3. What the transformation to WGS84 gives

---

## Diagnostic SQL Query Needed

```sql
SELECT 
  name,
  ST_SRID(geom) as srid,
  ST_X(geom) as x_ordinate,
  ST_Y(geom) as y_ordinate,
  ST_AsText(geom) as wkt,
  ST_X(ST_Transform(geom, 4326)) as wgs84_lon,
  ST_Y(ST_Transform(geom, 4326)) as wgs84_lat
FROM coordinate_points
WHERE project_id = <project_id>
LIMIT 3;
```

**Expected for Point P2 if stored correctly:**
- srid: 22291
- x_ordinate: 97538.004 (Westing)
- y_ordinate: 2247107.9 (Southing)
- wgs84_lon: ~30.12°E
- wgs84_lat: ~-20.3°S

**If QGIS shows points outside Zimbabwe, we might see:**
- wgs84_lon: Wrong value (not in 25-33°E range)
- wgs84_lat: Wrong value (not in -15 to -23°S range)

This would indicate the coordinates are stored in the wrong order.

---

## Hypothesis

**I suspect the issue is that the CSV data has Y and X swapped in the variable names:**

Looking at the CSV import code comments:
```javascript
// match.coordinate has: y=Southing, x=Westing
```

**But in Cape Lo convention:**
- Y should be Westing (the "longitude-like" coordinate)
- X should be Southing (the "latitude-like" coordinate)

**The variable naming is backwards!**

If `match.coordinate.y` actually contains Southing (2.2M) and `match.coordinate.x` contains Westing (97k), then:

```javascript
ST_MakePoint(match.coordinate.x, match.coordinate.y)
= ST_MakePoint(Westing, Southing)  // CORRECT for EPSG:22291
```

**This should work!**

**But if the CSV parser is assigning them wrong, we'd have:**
- `match.coordinate.y` = Westing (97k) - WRONG variable name
- `match.coordinate.x` = Southing (2.2M) - WRONG variable name

Then:
```javascript
ST_MakePoint(match.coordinate.x, match.coordinate.y)
= ST_MakePoint(Southing, Westing)  // WRONG ORDER!
= ST_MakePoint(2247107, 97538)
```

This would store:
- X ordinate = 2247107 (Southing in X position - WRONG)
- Y ordinate = 97538 (Westing in Y position - WRONG)

QGIS would interpret with EPSG:22291:
- Westing = 2247107 (HUGE - way outside Zimbabwe)
- Southing = 97538 (TINY - way north)

**This would place the point FAR outside Zimbabwe!**

---

## Solution

We need to check the CSV parser to see how it assigns Y and X values.

**File to check:** `app-frontend/src/utils/cadastral-csv.ts`
