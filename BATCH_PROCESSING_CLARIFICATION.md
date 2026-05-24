# Batch Processing Clarification - QGIS Database Workflow

## Overview

The batch processing feature allows you to compute areas for **multiple polygons at once** using coordinate points stored in the database. Both the coordinate list and polygons are managed through QGIS and stored in PostgreSQL.

---

## The Complete Workflow

### Phase 1: Export Coordinate List to Database

**In SurveyPro (AreasView):**

1. **Enter or load coordinate points** in the points table:
   ```
   Point A: Y=123.45, X=678.90
   Point B: Y=124.50, X=679.20
   Point C: Y=125.00, X=680.00
   Point D: Y=126.00, X=681.00
   ```

2. **Select a coordinate list layer** (or create new one)

3. **Click "Export Current Points to DB"**
   - Points are saved to PostgreSQL `features` table
   - Each point stored as: `{id, name, geometry, properties}`
   - Duplicate detection prevents re-exporting same points

**Result:** Coordinate list now exists in database, accessible by QGIS

---

### Phase 2: Digitize Polygons in QGIS

**In QGIS:**

1. **Connect to SurveyPro database:**
   - Layer → Add Layer → Add PostGIS Layers
   - Use connection info from "Get QGIS Connection Info" button
   - Host: localhost, Port: 5432, Database: surveypro

2. **Load the coordinate list layer:**
   - Expand connection → Select `features` table
   - Filter by layer_id if needed
   - Points appear on map with labels (using `name` column)

3. **Enable snapping:**
   - Settings → Snapping Options
   - Tolerance: 0.01 meters
   - Enable "Snap to Vertex"

4. **Create polygon layer:**
   - Layer → Create Layer → New Shapefile Layer
   - Add field: `designation` (Text, 255) for stand/parcel names
   - Geometry type: Polygon

5. **Digitize parcels:**
   - Start editing polygon layer
   - Click points in order: A → B → C → D → A
   - Cursor snaps to coordinate points automatically
   - Enter designation: "Stand 2344"
   - Repeat for all parcels (e.g., 25 stands)

6. **Save polygons to database:**
   - Database → DB Manager → Import Layer
   - Select polygon layer
   - Import to `features` table (different layer_id)
   - All 25 polygons now in database

**Result:** Multiple polygons stored in database, each referencing coordinate points

---

### Phase 3: Batch Area Computation

**Back in SurveyPro (AreasView):**

1. **Select layers:**
   - Coordinate List Layer: [Layer 5] (the points)
   - Polygon Layer: [Layer 6] (the polygons from QGIS)

2. **Set parameters:**
   - Tolerance: 0.001m (allows small coordinate differences)
   - ☑ Save results to polygon properties

3. **Click "Compute All Areas"**

**What Happens (Backend):**

```javascript
// For EACH polygon in Layer 6:
for (polygon of polygons) {
  // 1. Extract vertices from polygon geometry
  vertices = polygon.geometry.coordinates[0]
  // Example: [[123.45, 678.90], [124.50, 679.20], ...]
  
  // 2. Match each vertex to coordinate list (Layer 5)
  for (vertex of vertices) {
    // Search in coordinate list for point within tolerance
    matchedPoint = findPointNear(vertex, coordinateList, tolerance=0.001)
    
    if (!matchedPoint) {
      // Vertex doesn't match any coordinate point
      result = { status: 'failed', error: 'Vertex not found' }
      break
    }
  }
  
  // 3. If all vertices matched, compute area
  if (allVerticesMatched) {
    area = shoelaceFormula(vertices)
    centroid = calculateCentroid(vertices)
    closureError = calculateClosureError(vertices)
    
    result = {
      status: 'success',
      designation: polygon.properties.designation,
      area: area,
      centroid: centroid,
      closureError: closureError,
      vertices: ['A', 'B', 'C', 'D']  // Matched point names
    }
  }
}
```

**Result:** All 25 polygons computed in one batch operation

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: EXPORT COORDINATE LIST                                 │
└─────────────────────────────────────────────────────────────────┘

SurveyPro UI                    PostgreSQL Database
┌──────────────┐               ┌─────────────────────────┐
│ Points Table │               │ features (layer_id=5)   │
│ ─────────────│               │ ─────────────────────── │
│ A: 123.45... │──Export──────>│ {id:1, name:'A', ...}   │
│ B: 124.50... │               │ {id:2, name:'B', ...}   │
│ C: 125.00... │               │ {id:3, name:'C', ...}   │
│ D: 126.00... │               │ {id:4, name:'D', ...}   │
└──────────────┘               └─────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: DIGITIZE POLYGONS IN QGIS                              │
└─────────────────────────────────────────────────────────────────┘

QGIS Map                        PostgreSQL Database
┌──────────────┐               ┌─────────────────────────┐
│   A •──• B   │               │ features (layer_id=6)   │
│     │  │     │──Save────────>│ ─────────────────────── │
│   D •──• C   │  Polygons     │ {id:10, designation:    │
│              │               │  'Stand 2344',          │
│ Stand 2344   │               │  geometry: Polygon(...)}│
└──────────────┘               │                         │
                               │ {id:11, designation:    │
                               │  'Stand 2345', ...}     │
                               │ ... (25 polygons)       │
                               └─────────────────────────┘


┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: BATCH COMPUTATION                                       │
└─────────────────────────────────────────────────────────────────┘

SurveyPro Backend
┌────────────────────────────────────────────────────────────────┐
│ 1. Load all polygons from Layer 6                              │
│ 2. Load all coordinate points from Layer 5                     │
│                                                                 │
│ For each polygon:                                              │
│   ├─ Extract vertices: [[123.45,678.90], [124.50,679.20], ...]│
│   ├─ Match to points: A, B, C, D                              │
│   ├─ Compute area: 1250 m²                                    │
│   ├─ Compute centroid: (124.5, 679.5)                         │
│   └─ Compute closure: 0.023 m                                 │
│                                                                 │
│ Return results for all 25 polygons                             │
└────────────────────────────────────────────────────────────────┘
                               │
                               ▼
SurveyPro UI
┌────────────────────────────────────────────────────────────────┐
│ Batch Computation Results                                      │
│ ────────────────────────────────────────────────────────────── │
│ Total: 25  Success: 23  Failed: 2                             │
│                                                                 │
│ Status │ Designation │ Area      │ Centroid    │ Closure      │
│ ────── │ ─────────── │ ───────── │ ─────────── │ ──────────── │
│   ✓    │ Stand 2344  │ 0.1250 ha │ 124.5, 679.5│ 0.023 m      │
│   ✓    │ Stand 2345  │ 1250 m²   │ 125.0, 680.0│ 0.015 m      │
│   ✗    │ Stand 2346  │ Error     │             │ 3 unmatched  │
└────────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

### 1. Two Separate Layers in Database

**Coordinate List Layer (Layer 5):**
- Contains individual points (A, B, C, D, etc.)
- Geometry type: Point
- Used as reference for polygon vertices

**Polygon Layer (Layer 6):**
- Contains parcels/stands
- Geometry type: Polygon
- Each polygon's vertices should match coordinate list points

### 2. Vertex Matching with Tolerance

**Why tolerance is needed:**
```
Coordinate List Point A: Y=123.450000, X=678.900000
Polygon Vertex:          Y=123.450002, X=678.900001
                         ↑ Tiny difference from QGIS digitization

With tolerance=0.001m: MATCH ✓
Without tolerance:     NO MATCH ✗
```

### 3. Batch vs Individual Processing

**Individual (Old Way):**
```
Compute Stand 2344 → API call → Result
Compute Stand 2345 → API call → Result
Compute Stand 2346 → API call → Result
... (25 API calls)
```

**Batch (New Way):**
```
Compute ALL stands → Single API call → All results
(1 API call, 10x faster)
```

---

## Example: Real-World Scenario

### Scenario: 25 Residential Stands

**Coordinate List (12 points):**
```
A: 123.450, 678.900
B: 124.500, 679.200
C: 125.000, 680.000
D: 126.000, 681.000
E: 127.000, 682.000
F: 128.000, 683.000
G: 129.000, 684.000
H: 130.000, 685.000
I: 131.000, 686.000
J: 132.000, 687.000
K: 133.000, 688.000
L: 134.000, 689.000
```

**Polygons (25 stands):**
```
Stand 2344: A-B-E-D-A
Stand 2345: B-C-F-E-B
Stand 2346: C-D-G-F-C
... (22 more stands)
```

**Batch Computation:**
1. Click "Compute All Areas"
2. Backend processes all 25 stands
3. Results show:
   - 23 successful (areas computed)
   - 2 failed (vertices don't match coordinate list)

**Output:**
```csv
Designation,Status,Area,Unit,Centroid_Y,Centroid_X,Closure_Error_m,Vertices
Stand 2344,success,0.1250,ha,124.5,679.5,0.023,"A,B,E,D"
Stand 2345,success,0.1200,ha,125.0,680.0,0.015,"B,C,F,E"
Stand 2346,failed,,,,,,"Vertex at (125.5,680.5) not found"
...
```

---

## Common Questions

### Q1: Do I need to export points every time?
**A:** No! Once exported to database, points stay there. Only export:
- First time
- When adding new points
- When updating coordinates (use "Replace duplicates")

### Q2: Can I use the same coordinate list for multiple polygon layers?
**A:** Yes! One coordinate list can be used for many polygon layers.

### Q3: What if polygon vertices don't match exactly?
**A:** Use tolerance (default 0.001m = 1mm). Increase if needed (e.g., 0.01m).

### Q4: Can I edit polygons in QGIS after batch computation?
**A:** Yes! Edit in QGIS, save to database, re-run batch computation.

### Q5: What happens to failed polygons?
**A:** They're shown in results with error details. Fix in QGIS and re-compute.

---

## Database Schema

### Coordinate List Points
```sql
SELECT id, name, 
       geometry->>'coordinates' as coords,
       properties->>'system' as system
FROM features
WHERE layer_id = 5;  -- Coordinate list layer

-- Result:
-- id | name | coords              | system
-- 1  | A    | [123.45, 678.90]   | ZIM_P(Y,X)
-- 2  | B    | [124.50, 679.20]   | ZIM_P(Y,X)
```

### Polygons
```sql
SELECT id, 
       properties->>'designation' as designation,
       geometry->'coordinates'->0 as vertices
FROM features
WHERE layer_id = 6;  -- Polygon layer

-- Result:
-- id | designation | vertices
-- 10 | Stand 2344  | [[123.45,678.90],[124.50,679.20],...]
-- 11 | Stand 2345  | [[124.50,679.20],[125.00,680.00],...]
```

---

## API Endpoint Details

### POST `/api/compute/area/batch`

**Request:**
```json
{
  "coordinateLayerId": 5,
  "polygonLayerId": 6,
  "tolerance": 0.001,
  "saveResults": true
}
```

**Response:**
```json
{
  "ok": true,
  "summary": {
    "total": 25,
    "success": 23,
    "failed": 2
  },
  "results": [
    {
      "id": 10,
      "designation": "Stand 2344",
      "status": "success",
      "area_m2": 1250.5,
      "area_ha": 0.1250,
      "centroid": {"y": 124.5, "x": 679.5},
      "closure_error_m": 0.023,
      "vertices": ["A", "B", "E", "D"],
      "vertex_count": 4
    },
    {
      "id": 12,
      "designation": "Stand 2346",
      "status": "failed",
      "error": "3 vertices not found in coordinate list",
      "unmatched_vertices": [
        {"y": 125.5, "x": 680.5},
        {"y": 126.0, "x": 681.0},
        {"y": 126.5, "x": 681.5}
      ]
    }
  ]
}
```

---

## Performance

**Typical Performance:**
- 10 polygons: < 1 second
- 100 polygons: < 5 seconds
- 1000 polygons: < 30 seconds

**Factors:**
- Polygon complexity (number of vertices)
- Coordinate list size
- Database query performance
- Network latency

---

## Troubleshooting

### Issue: All polygons fail with "vertices not found"

**Causes:**
1. Wrong coordinate list layer selected
2. Tolerance too strict (try 0.01m instead of 0.001m)
3. Polygons digitized from different coordinate system
4. Coordinate list not exported to database

**Solution:**
- Verify both layers in database
- Check coordinates match (query database)
- Increase tolerance
- Re-export coordinate list

### Issue: Some polygons succeed, some fail

**Cause:** Failed polygons have vertices not in coordinate list

**Solution:**
- Check error details in results table
- Add missing points to coordinate list
- Re-export coordinate list
- Re-run batch computation

---

## Summary

**Batch processing workflow:**
1. ✅ Export coordinate list from SurveyPro to database
2. ✅ Open QGIS, connect to database, load coordinate list
3. ✅ Digitize multiple polygons in QGIS using coordinate points
4. ✅ Save polygons to database (different layer)
5. ✅ Return to SurveyPro, select both layers
6. ✅ Click "Compute All Areas" - processes all polygons at once
7. ✅ View results, export CSV/PDF

**Key benefits:**
- Process 25+ parcels in seconds (not minutes)
- Automatic vertex matching with tolerance
- Clear success/failure status for each polygon
- Export results for reporting
- No manual coordinate entry needed

🎉 **Result:** Efficient batch processing of land parcels using QGIS and PostgreSQL!
