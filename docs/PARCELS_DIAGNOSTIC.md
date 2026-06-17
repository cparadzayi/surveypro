# Parcels Persistence - Deep Dive Analysis & Fixes

## Issues Found & Fixed

### 🔴 **Critical Issue #1: Incomplete Data Saving**
**Location:** `app-backend/src/routes/parcels.js` - POST route (line 61)

**Problem:** The POST route was only saving `boundary_points` and `status`, but NOT:
- ❌ `area_sqm`
- ❌ `area_hectares`  
- ❌ `area_acres`
- ❌ `geometry_geojson`

**Fix:** ✅ Updated INSERT query to accept and save all fields:
```sql
INSERT INTO land_parcels 
  (project_id, parcel_number, parcel_name, boundary_points, 
   area_sqm, area_hectares, area_acres, status, geometry_geojson)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
```

### 🔴 **Critical Issue #2: Missing Error Handling**
**Location:** `app-frontend/src/stores/parcels.ts`

**Problem:** Store methods didn't check response status or handle errors:
- `createParcel()` - No error checking
- `checkDuplicate()` - No error checking
- Silent failures when database table doesn't exist

**Fix:** ✅ Added comprehensive error handling:
```typescript
if (!response.ok) {
  const errorData = await response.json();
  throw new Error(errorData.message || `HTTP ${response.status}`);
}
```

### 🔴 **Critical Issue #3: Database Pool Not Registered**
**Location:** `app-backend/src/server.js`

**Problem:** Routes couldn't access `fastify.pg` because pool wasn't registered

**Fix:** ✅ Added:
```javascript
import pool from './config/db.js'
app.decorate('pg', pool)
```

### 🟡 **Issue #4: No Visual Feedback During Selection**
**Location:** `app-frontend/src/views/modules/cadastral-standard/CalculationsPart2View.vue`

**Problem:** No polygon drawn as user selects points

**Fix:** ✅ Added `updateDraftPolygon()` function:
- Shows **yellow dashed polygon** after 3+ points selected
- Updates in real-time as points added/removed
- Removed when parcel saved

## Complete Data Flow

### 1. **Point Selection → Draft Polygon**
```
User clicks point
  ↓
addPointToCurrentParcel(point)
  ↓
currentParcelPoints.value.push(point)
  ↓
updateDraftPolygon()
  ↓
generatePolygon(pointIds, adjustedCoordinates)
  ↓
🟡 Yellow dashed polygon appears on map
```

### 2. **Save Parcel → Area Calculation**
```
User clicks "Save Parcel"
  ↓
saveCurrentParcel()
  ↓
parcels.value.push(newParcel)
  ↓
clearCurrentParcel() → removes draft polygon
  ↓
computeParcelAreaByIndex(index)
  ↓
areaCompute API call → returns area + residuals
  ↓
parcel.areaResult = result
  ↓
saveParcelToDatabase(parcel, index)
```

### 3. **Database Save → Persistence**
```
saveParcelToDatabase()
  ↓
generatePolygon() → calculate area using Shoelace formula
  ↓
checkDuplicate() → verify parcel number unique
  ↓
parcelsStore.createParcel({
  project_id,
  parcel_number,
  boundary_points: ['2404A', '2403A', '2402B', '2403B'],
  area_sqm: 503.00,
  area_hectares: 0.0503,
  area_acres: 0.1243,
  status: 'calculated',
  geometry_geojson: {...}
})
  ↓
POST /api/parcels
  ↓
INSERT INTO land_parcels (...)
  ↓
✅ Saved to PostgreSQL database
  ↓
addParcelPolygonToMap(savedParcel)
  ↓
🟢 Lime green solid polygon appears
```

### 4. **Page Refresh → Load Parcels**
```
Component mounted
  ↓
parcelsStore.loadParcels(projectId)
  ↓
GET /api/parcels/:projectId
  ↓
SELECT * FROM land_parcels WHERE project_id = ?
  ↓
parcels.value = data.data
  ↓
initializeMap()
  ↓
addExistingParcelsToMap()
  ↓
forEach parcel → addParcelPolygonToMap()
  ↓
🟢 All saved parcels appear on map
```

## Why It Wasn't Persisting Before

1. **Database table didn't exist** → 500 errors on save
2. **Backend couldn't access database** → `fastify.pg` undefined
3. **POST route missing fields** → Only boundary_points saved, no area
4. **No error handling** → Failures were silent
5. **No visual feedback** → User didn't know if save worked

## Setup Checklist

### ✅ Backend Setup
- [x] Database pool imported and registered
- [x] POST route accepts all fields
- [x] Error handling in routes
- [ ] **Migration run** → Creates `land_parcels` table

### ✅ Frontend Setup  
- [x] Parcels store with error handling
- [x] Geometry composable for polygon generation
- [x] Draft polygon visualization
- [x] Auto-save after area calculation
- [x] Load parcels on mount

### ⚠️ **Required: Run Migration**

**The table MUST be created before parcels can persist!**

```bash
# Option 1: Run migration script
cd app-backend
node scripts/migrate.js

# Option 2: Manual SQL
psql -d surveypro -f app-backend/create-parcels-table.sql
```

## Testing Persistence

### Test 1: Basic Save & Reload
1. Select 4 points (e.g., 2404A, 2403A, 2402B, 2403B)
2. See yellow dashed polygon
3. Enter parcel number "2402"
4. Click "Save Parcel"
5. Area calculates → polygon turns lime green
6. **Refresh page (F5)**
7. ✅ Polygon should reappear

### Test 2: Cross-Browser Persistence
1. Save parcel in Chrome
2. Open same project in Edge
3. ✅ Parcel should appear

### Test 3: Cross-Session Persistence
1. Save parcel
2. Close browser completely
3. Reopen app next day
4. ✅ Parcel should still be there

## Console Logs to Watch

### Successful Flow:
```
[Parcels] Loading parcels for project: 11
[Parcels] Loaded 0 parcels
[Draft Polygon] Updated with 3 points
[Draft Polygon] Updated with 4 points
⏱️ Computing area for 2402... (4 points)
✓ Area computed for 2402 in 0.33s: 503.00 m²
[Parcels Store] Creating parcel: 2402
[Parcels Store] Parcel created successfully: 42
[Parcels] Saved parcel to database: 2402
[Parcels] Added polygon for 2402 - Status: calculated
```

### After Refresh:
```
[Parcels] Loading parcels for project: 11
[Parcels] Loaded 1 parcels
[Parcels] Adding 1 existing parcels to map
[Parcels] Added polygon for 2402 - Status: calculated
```

## If Still Not Persisting

### Check 1: Database Table Exists
```sql
SELECT * FROM land_parcels;
-- Should NOT error
```

### Check 2: Backend Logs
Look for:
- ✅ "Database connection error" → DB not running
- ✅ "relation 'land_parcels' does not exist" → Migration not run
- ✅ "fastify.pg is undefined" → Pool not registered

### Check 3: Network Tab
- POST `/api/parcels` → Should return 200, not 500
- GET `/api/parcels/:projectId` → Should return parcels array

### Check 4: Console Errors
- "Failed to save parcel to database" → Backend issue
- "Cannot generate polygon" → Missing adjusted coordinates
- "No project ID available" → Workflow state issue

## Summary

**Before fixes:**
- ❌ No database connection
- ❌ Incomplete data saving
- ❌ Silent errors
- ❌ No visual feedback

**After fixes:**
- ✅ Database pool registered
- ✅ All fields saved (area, geometry, etc.)
- ✅ Comprehensive error handling
- ✅ Real-time polygon visualization
- ✅ Full persistence across browsers/sessions

**Next step:** **Run the migration!** 🚀
