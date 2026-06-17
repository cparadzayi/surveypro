# 🏗️ Unified Parcel Architecture - Consolidation Plan

## 🎯 **Current State Analysis**

You're absolutely right! We have **THREE separate parcel systems** causing duplication and inconsistency:

### **System 1: `land_parcels` (QGIS Workflow)**
- **Created:** Migration 017 (older)
- **Used by:** AreasView.vue (Lite module)
- **API:** `/api/land-parcels`
- **Geometry:** EPSG:22291 (Cape Lo 31)
- **Fields:** `stand`, `area_m2`, `area_ha`, `perimeter_m`, `closure_error_m`
- **Workflow:** QGIS digitization → Export to DB → Batch computation
- **Status:** ✅ Working, has data

### **System 2: `parcels` (Cadastral Workflow)**
- **Created:** Migration 025 (newer)
- **Used by:** MapLibreAreaView.vue (Cadastral module)
- **API:** `/api/area-parcels`
- **Geometry:** EPSG:4326 (WGS84)
- **Fields:** `designation`, `area_sqm`, `perimeter_m`, `closure_error`, `status`
- **Workflow:** MapLibre digitization → Auto-save → Finalize
- **Status:** ✅ Working, modern features (status, metadata)

### **System 3: `area_parcels` (Mentioned in code)**
- **Status:** ❓ May not exist or is an alias
- **Used by:** areaParcels.ts service
- **API:** `/api/area-parcels` (same as System 2)
- **Likely:** This is just the API route name for `parcels` table

---

## 🔍 **Key Differences**

| Feature | `land_parcels` | `parcels` |
|---------|----------------|-----------|
| **CRS** | EPSG:22291 (Cape Lo 31) | EPSG:4326 (WGS84) |
| **Area Field** | `area_m2` | `area_sqm` |
| **Stand Field** | `stand` | `designation` |
| **Status** | ❌ No | ✅ draft/finalized/approved |
| **Metadata** | ❌ No | ✅ JSONB field |
| **Closure** | `closure_error_m` | `closure_error` |
| **Workflow** | QGIS external | MapLibre internal |
| **Auto-save** | ❌ Manual | ✅ Auto-save |
| **Finalization** | ❌ No | ✅ Batch finalize |

---

## ⚠️ **Problems with Current Architecture**

### **1. Data Duplication**
- Same parcel data stored in two tables
- No synchronization between tables
- User confusion about which table to query

### **2. Inconsistent Geometry**
- `land_parcels`: Cape Lo 31 (EPSG:22291) - **Correct for Zimbabwe**
- `parcels`: WGS84 (EPSG:4326) - **Wrong for cadastral work**

### **3. API Confusion**
- `/api/land-parcels` → `land_parcels` table
- `/api/area-parcels` → `parcels` table
- Same concept, different endpoints

### **4. Feature Gaps**
- `land_parcels` lacks status tracking
- `land_parcels` lacks metadata storage
- `parcels` uses wrong CRS

### **5. UI Fragmentation**
- AreasView.vue → `land_parcels`
- MapLibreAreaView.vue → `parcels`
- No shared components

---

## ✅ **Recommended Solution: Unified Architecture**

### **🎯 Single Source of Truth: Enhanced `land_parcels`**

**Why `land_parcels` over `parcels`?**
1. ✅ **Correct CRS** (EPSG:22291 - Cape Lo 31)
2. ✅ **Already has data** (your QGIS parcels)
3. ✅ **Proper naming** (Zimbabwe cadastral standard)
4. ✅ **Established workflow** (QGIS integration)

**Enhancements needed:**
1. Add `status` column (draft/finalized/approved)
2. Add `metadata` JSONB column
3. Add `digitized_by` user tracking
4. Add `finalized_at` timestamp
5. Rename `stand` → `designation` (or keep both)

---

## 🚀 **Migration Plan**

### **Phase 1: Enhance `land_parcels` Table** ⭐

```sql
-- Add missing columns to land_parcels
ALTER TABLE land_parcels
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft' 
    CHECK (status IN ('draft', 'finalized', 'approved')),
  ADD COLUMN IF NOT EXISTS digitized_by INTEGER REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS designation VARCHAR(100);

-- Populate designation from stand (backward compatibility)
UPDATE land_parcels 
SET designation = stand 
WHERE designation IS NULL;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_land_parcels_status ON land_parcels(status);
CREATE INDEX IF NOT EXISTS idx_land_parcels_designation ON land_parcels(designation);
CREATE INDEX IF NOT EXISTS idx_land_parcels_metadata ON land_parcels USING GIN(metadata);

-- Add comments
COMMENT ON COLUMN land_parcels.status IS 'Parcel status: draft, finalized, approved';
COMMENT ON COLUMN land_parcels.metadata IS 'Additional metadata (colors, labels, user notes, Cape Lo points, etc.)';
COMMENT ON COLUMN land_parcels.designation IS 'Parcel designation/stand number (alias for stand)';
```

### **Phase 2: Migrate Data from `parcels` to `land_parcels`**

```sql
-- Migrate parcels to land_parcels (with CRS transformation)
INSERT INTO land_parcels (
  project_id,
  stand,
  designation,
  geom,
  area_m2,
  area_ha,
  perimeter_m,
  closure_error_m,
  status,
  digitized_by,
  finalized_at,
  metadata,
  created_at,
  updated_at
)
SELECT 
  project_id,
  designation as stand,
  designation,
  ST_Transform(geometry, 22291) as geom, -- Transform WGS84 → Cape Lo 31
  area_sqm as area_m2,
  area_sqm / 10000 as area_ha,
  perimeter_m,
  closure_error as closure_error_m,
  status,
  digitized_by,
  finalized_at,
  metadata,
  created_at,
  updated_at
FROM parcels
WHERE NOT EXISTS (
  SELECT 1 FROM land_parcels lp
  WHERE lp.project_id = parcels.project_id
  AND lp.stand = parcels.designation
);
```

### **Phase 3: Update API Routes**

**Consolidate to single endpoint: `/api/land-parcels`**

```javascript
// app-backend/src/routes/landParcels.js

// GET /api/land-parcels?project_id=X&status=Y
app.get('/land-parcels', async (request, reply) => {
  const { project_id, status } = request.query
  
  let query = `
    SELECT 
      id, project_id, 
      stand, designation,
      ST_AsGeoJSON(geom)::json as geometry,
      area_m2, area_ha, perimeter_m, closure_error_m,
      status, digitized_by, finalized_at,
      metadata, created_at, updated_at
    FROM land_parcels
    WHERE project_id = $1
  `
  
  const params = [project_id]
  
  if (status) {
    query += ` AND status = $2`
    params.push(status)
  }
  
  query += ` ORDER BY created_at DESC`
  
  const result = await db.query(query, params)
  return { ok: true, data: result.rows }
})

// POST /api/land-parcels (create with auto-save)
app.post('/land-parcels', async (request, reply) => {
  const { 
    project_id, 
    designation,
    geometry, // GeoJSON
    area_m2,
    perimeter_m,
    closure_error_m,
    status = 'draft',
    digitized_by,
    metadata = {}
  } = request.body
  
  // Insert with Cape Lo 31 CRS
  const result = await db.query(`
    INSERT INTO land_parcels (
      project_id, stand, designation, geom,
      area_m2, area_ha, perimeter_m, closure_error_m,
      status, digitized_by, metadata
    ) VALUES (
      $1, $2, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 22291),
      $4, $4/10000, $5, $6, $7, $8, $9
    )
    RETURNING *, ST_AsGeoJSON(geom)::json as geometry
  `, [
    project_id, designation, JSON.stringify(geometry),
    area_m2, perimeter_m, closure_error_m,
    status, digitized_by, JSON.stringify(metadata)
  ])
  
  return { ok: true, data: result.rows[0] }
})

// PATCH /api/land-parcels/finalize (batch status update)
app.patch('/land-parcels/finalize', async (request, reply) => {
  const { parcel_ids } = request.body
  
  const result = await db.query(`
    UPDATE land_parcels
    SET status = 'finalized', finalized_at = NOW()
    WHERE id = ANY($1)
    RETURNING id, designation, status
  `, [parcel_ids])
  
  return { ok: true, data: result.rows }
})
```

### **Phase 4: Update Frontend Services**

**Consolidate to single service: `spatial.ts`**

```typescript
// app-frontend/src/services/spatial.ts

export interface LandParcel {
  id: number
  project_id: number
  stand: string
  designation: string
  geometry: GeoJSON.Polygon
  area_m2: number
  area_ha: number
  perimeter_m: number
  closure_error_m: number
  status: 'draft' | 'finalized' | 'approved'
  digitized_by?: number
  finalized_at?: string
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

// List parcels with optional status filter
export async function listLandParcels(
  projectId: number,
  status?: 'draft' | 'finalized' | 'approved'
): Promise<LandParcel[]> {
  const params: any = { project_id: projectId }
  if (status) params.status = status
  
  const r = await api.get('/land-parcels', { params })
  return r.data.data
}

// Create parcel (auto-save)
export async function createLandParcel(parcel: {
  project_id: number
  designation: string
  geometry: GeoJSON.Polygon
  area_m2: number
  perimeter_m: number
  closure_error_m: number
  status?: 'draft' | 'finalized'
  digitized_by?: number
  metadata?: Record<string, any>
}): Promise<LandParcel> {
  const r = await api.post('/land-parcels', parcel)
  return r.data.data
}

// Finalize parcels (batch)
export async function finalizeParcels(parcelIds: number[]): Promise<LandParcel[]> {
  const r = await api.patch('/land-parcels/finalize', { parcel_ids: parcelIds })
  return r.data.data
}

// Update parcel
export async function updateLandParcel(
  id: number, 
  updates: Partial<LandParcel>
): Promise<LandParcel> {
  const r = await api.put(`/land-parcels/${id}`, updates)
  return r.data.data
}

// Delete parcel
export async function deleteLandParcel(id: number): Promise<void> {
  await api.delete(`/land-parcels/${id}`)
}
```

### **Phase 5: Update MapLibreAreaView**

**Change from `parcels` to `land_parcels`:**

```typescript
// app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue

// OLD:
import { fetchParcels, createParcel } from '../../../services/areaParcels'

// NEW:
import { listLandParcels, createLandParcel } from '../../../services/spatial'

// Update function calls:
async function loadParcelsFromDatabase() {
  const existingParcels = await listLandParcels(
    workflowState.projectInfo.projectId
  )
  // ... rest of code
}

async function saveParcel(parcel: Parcel) {
  await createLandParcel({
    project_id: workflowState.projectInfo.projectId,
    designation: parcel.designation,
    geometry: parcel.geometry,
    area_m2: parcel.areaResult.area.abs_m2,
    perimeter_m: parcel.perimeter,
    closure_error_m: parcel.closureError,
    status: 'draft',
    metadata: {
      cape_lo_points: parcel.points,
      color: parcel.color,
      // ... other metadata
    }
  })
}
```

### **Phase 6: Deprecate `parcels` Table**

```sql
-- After verifying all data migrated and apps working:

-- Rename for backup
ALTER TABLE parcels RENAME TO parcels_deprecated_backup;

-- Drop after 30 days if no issues
-- DROP TABLE parcels_deprecated_backup;
```

### **Phase 7: Remove Old Service**

```bash
# Delete deprecated service
rm app-frontend/src/services/areaParcels.ts

# Update imports in all files
# (Already done in Phase 5)
```

---

## 📊 **Benefits of Unified Architecture**

### **1. Single Source of Truth** ✅
- One table: `land_parcels`
- One API: `/api/land-parcels`
- One service: `spatial.ts`

### **2. Correct CRS** ✅
- EPSG:22291 (Cape Lo 31) for all parcels
- Proper cadastral coordinates for Zimbabwe

### **3. Feature Complete** ✅
- Status tracking (draft/finalized/approved)
- Metadata storage (colors, labels, Cape Lo points)
- User tracking (digitized_by)
- Finalization workflow

### **4. Backward Compatible** ✅
- Keeps `stand` field (existing data)
- Adds `designation` field (new standard)
- Migrates data from `parcels` table

### **5. Unified UI** ✅
- Both AreasView and MapLibreAreaView use same data
- Consistent user experience
- No data duplication

---

## 🎯 **Implementation Timeline**

### **Week 1: Database Migration**
- [ ] Run Phase 1 SQL (enhance land_parcels)
- [ ] Run Phase 2 SQL (migrate data)
- [ ] Verify data integrity
- [ ] Test in development

### **Week 2: Backend Updates**
- [ ] Update landParcels.js routes
- [ ] Add status/metadata support
- [ ] Add finalization endpoint
- [ ] Test API endpoints

### **Week 3: Frontend Updates**
- [ ] Update spatial.ts service
- [ ] Update MapLibreAreaView.vue
- [ ] Update AreasView.vue
- [ ] Test both workflows

### **Week 4: Testing & Cleanup**
- [ ] End-to-end testing
- [ ] User acceptance testing
- [ ] Deprecate parcels table
- [ ] Remove areaParcels.ts
- [ ] Update documentation

---

## 🧪 **Testing Checklist**

### **QGIS Workflow**
- [ ] Export coordinate points
- [ ] Digitize parcels in QGIS
- [ ] Save to land_parcels table
- [ ] Refresh in AreasView
- [ ] Run batch computation
- [ ] Verify areas and closure errors

### **MapLibre Workflow**
- [ ] Load survey points
- [ ] Digitize parcels in MapLibre
- [ ] Auto-save to land_parcels
- [ ] Verify geometry and metadata
- [ ] Finalize parcels
- [ ] Check status updates

### **Cross-Workflow**
- [ ] Digitize in QGIS → View in MapLibre
- [ ] Digitize in MapLibre → View in AreasView
- [ ] Finalize in MapLibre → Status in AreasView
- [ ] No data duplication
- [ ] Consistent CRS

---

## 📈 **Success Metrics**

✅ **Single parcel table** (`land_parcels`)  
✅ **Single API endpoint** (`/api/land-parcels`)  
✅ **Single service** (`spatial.ts`)  
✅ **Correct CRS** (EPSG:22291)  
✅ **Feature complete** (status, metadata, finalization)  
✅ **Zero data duplication**  
✅ **Both workflows working**  
✅ **User confusion eliminated**  

---

## 🎓 **Recommendation**

**YES! Consolidate to `land_parcels` with MapLibre as primary UI.**

**Why MapLibre?**
1. ✅ **Modern** - Better UX than QGIS workflow
2. ✅ **Integrated** - No external tools needed
3. ✅ **Auto-save** - No data loss
4. ✅ **Real-time** - Instant feedback
5. ✅ **Feature-rich** - Status, metadata, finalization

**Keep QGIS as optional:**
- For bulk digitization (100+ parcels)
- For complex geometries
- For users who prefer QGIS

**Both workflows → Same table → Consistent data** 🎉

---

## 🚀 **Next Steps**

1. ✅ **Review this plan** - Confirm approach
2. ✅ **Backup database** - Safety first
3. ✅ **Run Phase 1** - Enhance land_parcels
4. ✅ **Test migration** - Verify data
5. ✅ **Update backend** - Consolidate APIs
6. ✅ **Update frontend** - Use single service
7. ✅ **Test thoroughly** - Both workflows
8. ✅ **Deploy** - Single source of truth!

---

**Ready to implement? Let's consolidate! 🎯**
