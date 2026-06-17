# Normalized Schema Implementation Status

## ✅ COMPLETED (Backend)

### 1. Database Schema
- ✅ Migration 017 created and applied successfully
- ✅ `coordinate_points` table with PostGIS Point geometry
- ✅ `land_parcels` table with PostGIS Polygon geometry
- ✅ Generated columns: `area_m2`, `area_ha`, `perimeter_m` (auto-calculated)
- ✅ Spatial indexes (GIST)
- ✅ Views: `land_parcels_full`, `coordinate_points_full`
- ✅ Auto-update triggers
- ✅ Data imported from old `land_parcels` table (4 polygons)

### 2. Backend Models
- ✅ `coordinatePoint.js` - CRUD operations
- ✅ `landParcel.js` - CRUD operations
- ✅ ES6 module exports with correct imports

### 3. Backend API
- ✅ New endpoint: `POST /compute/area/batch/v2`
- ✅ Uses `project_id` instead of layer IDs
- ✅ Queries normalized tables directly
- ✅ Legacy endpoint preserved: `POST /compute/area/batch` (v1)

---

## ❌ NOT IMPLEMENTED (Frontend)

### 1. Frontend Services
**File:** `app-frontend/src/services/spatial.ts`

**Missing:**
- ❌ `listCoordinatePoints(projectId)` - Get coordinate points
- ❌ `createCoordinatePoint(projectId, data)` - Add coordinate point
- ❌ `batchCreateCoordinatePoints(projectId, points[])` - Batch import
- ❌ `listLandParcels(projectId)` - Get land parcels
- ❌ `getLandParcel(id)` - Get single parcel
- ❌ `createLandParcel(projectId, data)` - Add parcel
- ❌ `updateLandParcel(id, data)` - Update parcel
- ❌ `deleteLandParcel(id)` - Delete parcel

**File:** `app-frontend/src/services/compute.ts`

**Missing:**
- ❌ `batchAreaComputeV2(payload)` - New batch computation
- ❌ Update `BatchAreaComputeRequest` interface for v2

### 2. Frontend UI (AreasView.vue)
**File:** `app-frontend/src/views/modules/lite/areas/AreasView.vue`

**Current State:**
- ✅ Has "Export to Database" button (exports to `features` table)
- ✅ Has layer selection dropdowns
- ✅ Has batch computation (uses v1 endpoint with layers)

**Needs:**
- ❌ Switch from layer-based to project-based workflow
- ❌ Remove layer selection dropdowns
- ❌ Add project selection dropdown
- ❌ Update "Export to Database" to use `coordinate_points` table
- ❌ Update batch computation to use v2 endpoint
- ❌ Display results from `land_parcels` table

### 3. Backend API Endpoints (Missing)
**File:** `app-backend/src/routes/spatial.js`

**Needs:**
- ❌ `GET /spatial/coordinate-points?project_id=X` - List points
- ❌ `POST /spatial/coordinate-points` - Create point
- ❌ `POST /spatial/coordinate-points/batch` - Batch create
- ❌ `GET /spatial/land-parcels?project_id=X` - List parcels
- ❌ `GET /spatial/land-parcels/:id` - Get parcel
- ❌ `POST /spatial/land-parcels` - Create parcel
- ❌ `PUT /spatial/land-parcels/:id` - Update parcel
- ❌ `DELETE /spatial/land-parcels/:id` - Delete parcel

---

## 📋 IMPLEMENTATION PLAN

### Phase 1: Backend API Endpoints (30 min)
Create REST endpoints for coordinate_points and land_parcels tables.

**Tasks:**
1. Create `app-backend/src/routes/coordinatePoints.js`
2. Create `app-backend/src/routes/landParcels.js`
3. Register routes in `app-backend/src/server.js`

### Phase 2: Frontend Services (20 min)
Add service functions to interact with new endpoints.

**Tasks:**
1. Update `app-frontend/src/services/spatial.ts`
2. Update `app-frontend/src/services/compute.ts`
3. Add TypeScript interfaces

### Phase 3: Frontend UI Updates (40 min)
Refactor AreasView.vue to use normalized tables.

**Tasks:**
1. Add project selection dropdown
2. Remove layer selection dropdowns
3. Update "Export to Database" functionality
4. Update batch computation to use v2 endpoint
5. Update results display

### Phase 4: Testing (20 min)
Verify end-to-end workflow.

**Tasks:**
1. Test coordinate point export
2. Test QGIS digitization workflow
3. Test batch computation
4. Verify area calculations

---

## CURRENT WORKFLOW (Not Implemented)

### ❌ What Should Work (But Doesn't)
1. User selects project in AreasView
2. User adds coordinate points (A, B, C, D...)
3. User clicks "Export to Database"
   - Should save to `coordinate_points` table
   - Currently saves to `features` table
4. User opens QGIS, connects to database
5. User digitizes polygons using coordinate points
6. User saves polygons to `land_parcels` table
7. User returns to AreasView
8. User clicks "Compute All Areas"
   - Should call `/compute/area/batch/v2`
   - Currently calls `/compute/area/batch` (v1)
9. Results displayed with auto-calculated areas

### ✅ What Currently Works
- Database schema is ready
- Backend models work
- V2 endpoint exists and works
- Old workflow (layer-based) still functional

---

## RECOMMENDATION

**Option 1: Full Implementation (2 hours)**
- Complete all phases above
- Modern, normalized architecture
- Better performance and maintainability
- Industry best practices

**Option 2: Quick Fix (30 min)**
- Keep existing UI (layer-based)
- Just add a migration to sync `features` → `coordinate_points`
- Add a migration to sync polygon features → `land_parcels`
- Update batch computation to check both v1 and v2 tables

**Option 3: Hybrid (1 hour)**
- Add new "Normalized Mode" toggle in AreasView
- Keep old layer-based workflow
- Add new project-based workflow alongside
- Let user choose which to use

---

## NEXT STEPS

**Which option do you prefer?**

1. **Full Implementation** - Complete refactor to normalized schema
2. **Quick Fix** - Sync existing data, minimal UI changes
3. **Hybrid** - Both workflows available

Let me know and I'll implement it!
