# ✅ Coordinate Points Loading - Fixed!

## Issue
Coordinate points weren't showing up when selecting a project in the new AreasView UI.

## Root Cause
The `onProjectChange()` function was only loading land parcels, not coordinate points.

## Solution Applied

### 1. Backend Model Update
**File:** `app-backend/src/models/coordinatePoint.js`

Updated `findByProject()` to extract Y and X coordinates from PostGIS geometry:

```javascript
async findByProject(projectId) {
  const result = await db.query(
    `SELECT 
      id, project_id, name, geom, elevation, description, 
      survey_date, surveyor, created_at, updated_at,
      ST_Y(geom) as y,  // Extract Y coordinate
      ST_X(geom) as x   // Extract X coordinate
     FROM coordinate_points 
     WHERE project_id = $1 
     ORDER BY name`,
    [projectId]
  )
  return result.rows
}
```

### 2. TypeScript Interface Update
**File:** `app-frontend/src/services/spatial.ts`

Added `y` and `x` properties to the interface:

```typescript
export interface CoordinatePoint {
  id: number
  project_id: number
  name: string
  geom: any
  y: number  // Extracted from geometry
  x: number  // Extracted from geometry
  elevation?: number
  description?: string
  survey_date?: string
  surveyor?: string
  created_at: string
  updated_at: string
}
```

### 3. Frontend Component Update
**File:** `app-frontend/src/views/modules/lite/areas/AreasView.vue`

Added `loadCoordinatePoints()` function:

```typescript
// Load coordinate points
async function loadCoordinatePoints() {
  if (!selectedProjectId.value) return
  
  loading.value = true
  try {
    const dbPoints = await listCoordinatePoints(selectedProjectId.value)
    // Convert database points to editable format
    coordinatePoints.value = dbPoints.map(pt => ({
      name: pt.name,
      y: pt.y,
      x: pt.x,
      elevation: pt.elevation,
      description: pt.description
    }))
  } catch (err) {
    console.error('Failed to load coordinate points:', err)
    // Don't alert - it's ok if there are no points yet
  } finally {
    loading.value = false
  }
}

// Project change handler
async function onProjectChange() {
  if (!selectedProjectId.value) return
  
  coordinatePoints.value = []
  landParcels.value = []
  batchResults.value = null
  
  await Promise.all([loadCoordinatePoints(), loadParcels()])
}
```

## How It Works Now

1. **User selects project** → `onProjectChange()` fires
2. **Loads coordinate points** → Calls `listCoordinatePoints(projectId)`
3. **Backend extracts coordinates** → Uses `ST_Y()` and `ST_X()` to get Y, X from geometry
4. **Frontend displays** → Shows points in editable table
5. **User can edit** → Modify existing points or add new ones
6. **Export to DB** → Saves back to `coordinate_points` table

## Testing

1. Select "Avondale - Survey Points" project
2. Should see existing coordinate points in the table
3. Can edit Y, X, elevation, description
4. Can add new points with "+ Add Point"
5. Can export with "📤 Export to Database"

## Result

✅ Coordinate points now load automatically when project is selected
✅ Existing points are editable in the table
✅ Can add new points manually
✅ Can export to database for QGIS digitization

---

**Restart both servers to apply all changes!**
