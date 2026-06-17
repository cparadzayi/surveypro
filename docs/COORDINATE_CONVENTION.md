# SurveyPro Coordinate Convention

## Official Standard: GeoJSON [X, Y] Order

**All coordinate storage and retrieval MUST use GeoJSON standard `[X, Y]` order.**

### Cape Lo / Gauss Lo Coordinate System

- **Y = Westing** (~97,000 range)
- **X = Southing** (~2,200,000 range)

### GeoJSON Coordinate Order

```typescript
// ✅ CORRECT - GeoJSON standard [X, Y]
const coordinates = [x, y];  // [2247967.61, 97538.88]

// ❌ WRONG - Do NOT use [Y, X]
const coordinates = [y, x];  // [97538.88, 2247967.61]
```

## Implementation Across Stack

### 1. Database (PostGIS)

**Storage:**
```sql
-- ST_MakePoint expects (X, Y) in standard order
ST_SetSRID(ST_MakePoint(x_value, y_value), 22291)
```

**Retrieval:**
```sql
-- ST_X returns X coordinate (Southing)
-- ST_Y returns Y coordinate (Westing)
ST_X(geom) as x,  -- Returns ~2.2M (Southing)
ST_Y(geom) as y   -- Returns ~97k (Westing)
```

**GeoJSON Output:**
```sql
-- ST_AsGeoJSON produces standard [X, Y] order
ST_AsGeoJSON(geom)::jsonb
-- Result: {"type":"Point","coordinates":[2247967.61, 97538.88]}
```

### 2. Backend (Node.js/Fastify)

All GeoJSON returned from API endpoints uses standard `[X, Y]` order.

**Example:**
```javascript
{
  type: 'Point',
  coordinates: [2247967.61, 97538.88]  // [X, Y]
}
```

### 3. Frontend (Vue.js/TypeScript)

**When SAVING to database:**
```typescript
// Create GeoJSON with standard [X, Y] order
const coordinates = parcel.points.map(p => [p.x, p.y]);

const geometry = {
  type: 'Polygon',
  coordinates: [coordinates]
};
```

**When READING from database:**
```typescript
// GeoJSON coordinates are [X, Y]
const vertexX = coords[i][0];  // X = Southing (~2.2M)
const vertexY = coords[i][1];  // Y = Westing (~97k)
```

**Display to User:**
```vue
<td>{{ point.y }}</td>  <!-- Y column shows ~97k (Westing) -->
<td>{{ point.x }}</td>  <!-- X column shows ~2.2M (Southing) -->
```

### 4. QGIS Integration

QGIS stores and retrieves geometries using standard GeoJSON `[X, Y]` order.

**When digitizing:**
- QGIS saves polygons with coordinates in `[X, Y]` order
- PostGIS stores them as-is (no conversion needed)

**When loading:**
- QGIS reads coordinates in `[X, Y]` order
- Displays correctly on map

## Files Updated (Dec 27, 2024)

### Frontend Files Fixed:
1. `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`
   - Line 2483: Changed `[p.y, p.x]` → `[p.x, p.y]` (parcel saving)
   - Line 2275-2276: Changed coordinate extraction order (parcel loading)

2. `app-frontend/src/views/modules/lite/areas2/Areas2View.vue`
   - Line 372: Changed `[p.y, p.x]` → `[p.x, p.y]` (point display)
   - Line 1046: Changed `[p.y, p.x]` → `[p.x, p.y]` (polygon creation)

3. `app-frontend/src/services/projectPoints.ts`
   - Line 154: Changed `[coord.y, coord.x]` → `[coord.x, coord.y]`

4. `app-frontend/src/composables/useParcelGeometry.ts`
   - Line 184: Changed `[c.y, c.x]` → `[c.x, c.y]`

5. `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`
   - Line 3524: Changed `[edge.y, edge.x]` → `[edge.x, edge.y]` (fallback)

### Backend Files (Already Correct):
- `app-backend/src/models/coordinatePoint.js` ✅
- `app-backend/src/models/landParcel.js` ✅
- `app-backend/src/routes/surveyPlanPreview.js` ✅
- `app-backend/src/routes/csvImports.js` ✅

## Testing Checklist

After applying fixes, verify:

1. **Create New Parcel:**
   - [ ] Digitize parcel in MapLibreAreaView
   - [ ] Save to database
   - [ ] Reload page
   - [ ] Verify Y column shows ~97k (Westing)
   - [ ] Verify X column shows ~2.2M (Southing)

2. **QGIS Integration:**
   - [ ] Digitize parcel in QGIS
   - [ ] Save to `land_parcels` table
   - [ ] Load in SurveyPro frontend
   - [ ] Verify coordinates display correctly

3. **Area & Consistency:**
   - [ ] Generate area computation
   - [ ] Check "Stand area and consistencies" table
   - [ ] Verify Y and X values are not swapped

4. **PDF Output:**
   - [ ] Generate GeoPDF
   - [ ] Verify coordinate values in PDF tables
   - [ ] Confirm Y and X columns match frontend

## Common Mistakes to Avoid

❌ **DO NOT** use `[Y, X]` order anywhere in the codebase
❌ **DO NOT** swap coordinates when reading from GeoJSON
❌ **DO NOT** assume "Zimbabwe notation P(Y,X)" means GeoJSON uses `[Y, X]`

✅ **ALWAYS** use GeoJSON standard `[X, Y]` order
✅ **ALWAYS** extract as `x = coords[0], y = coords[1]`
✅ **ALWAYS** create as `[x, y]` when building GeoJSON

## Why This Matters

**Consistency = Correctness**

Using standard GeoJSON `[X, Y]` order everywhere ensures:
- Database ↔ Frontend consistency
- QGIS ↔ SurveyPro compatibility
- PDF output matches frontend display
- No coordinate swaps in calculations
- Professional, maintainable codebase

---

**Last Updated:** December 27, 2024
**Status:** ✅ All coordinate handling standardized to GeoJSON [X, Y] order
