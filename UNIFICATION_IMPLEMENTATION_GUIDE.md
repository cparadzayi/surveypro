# 🚀 Parcel Unification - Implementation Guide

## 📋 **Quick Summary**

**Problem:** Two separate parcel systems causing duplication  
**Solution:** Consolidate to single `land_parcels` table  
**Benefit:** Single source of truth, MapLibre as primary UI  
**Time:** 2-3 hours implementation

---

## ✅ **Step-by-Step Implementation**

### **Step 1: Backup Database** (5 minutes)

```bash
# Navigate to backend
cd app-backend

# Backup database
pg_dump -U postgres -d surveypro_v1 > backup_before_unification_$(date +%Y%m%d).sql

# Or use your database name
pg_dump -U postgres -d surveypro > backup_before_unification_$(date +%Y%m%d).sql
```

---

### **Step 2: Run Migration** (2 minutes)

```bash
# Option A: Using psql directly
psql -U postgres -d surveypro_v1 -f migrations/029.do.sql

# Option B: Using npm script (if configured)
npm run migrate up 029

# Check migration output
# Should see: "Migration 029 Complete!" with statistics
```

**Expected Output:**
```
========================================
Migration 029 Complete!
========================================
Total parcels: 160
  - Draft: 160
  - Finalized: 0
  - Approved: 0
========================================
New columns added:
  - status (draft/finalized/approved)
  - digitized_by (user tracking)
  - finalized_at (timestamp)
  - metadata (JSONB)
  - designation (modern naming)
  - updated_at (auto-updated)
========================================
Indexes created: 5
Triggers created: 1
Views created: 1 (area_parcels)
========================================
Single source of truth: land_parcels ✅
========================================
```

---

### **Step 3: Verify Migration** (3 minutes)

```sql
-- Check new columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'land_parcels'
AND column_name IN ('status', 'metadata', 'designation', 'digitized_by', 'finalized_at');

-- Check data migrated
SELECT 
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'draft') as draft,
  COUNT(*) FILTER (WHERE status = 'finalized') as finalized,
  COUNT(*) FILTER (WHERE designation IS NOT NULL) as has_designation
FROM land_parcels;

-- Check view created
SELECT * FROM area_parcels LIMIT 5;

-- Check parcels table renamed
SELECT table_name 
FROM information_schema.tables 
WHERE table_name LIKE 'parcels%';
-- Should show: parcels_deprecated_backup_029 (if parcels table existed)
```

---

### **Step 4: Update Backend API** (30 minutes)

#### **4.1: Update landParcels.js routes**

Edit `app-backend/src/routes/landParcels.js`:

```javascript
// Add to existing GET /land-parcels
app.get('/land-parcels', {
  preHandler: [app.authenticate],
  schema: {
    querystring: {
      type: 'object',
      required: ['project_id'],
      properties: {
        project_id: { type: 'number' },
        status: { type: 'string', enum: ['draft', 'finalized', 'approved'] }
      }
    }
  }
}, async (request, reply) => {
  const { project_id, status } = request.query
  
  let query = `
    SELECT 
      id, project_id, stand, designation,
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
  
  const parcels = await LandParcel.query(query, params)
  return { ok: true, data: parcels }
})

// Add PATCH /land-parcels/finalize endpoint
app.patch('/land-parcels/finalize', {
  preHandler: [app.authenticate],
  schema: {
    body: {
      type: 'object',
      required: ['parcel_ids'],
      properties: {
        parcel_ids: { 
          type: 'array',
          items: { type: 'number' }
        }
      }
    }
  }
}, async (request, reply) => {
  const { parcel_ids } = request.body
  
  const result = await db.query(`
    UPDATE land_parcels
    SET status = 'finalized', finalized_at = NOW()
    WHERE id = ANY($1)
    RETURNING id, designation, status, finalized_at
  `, [parcel_ids])
  
  return { ok: true, data: result.rows }
})
```

#### **4.2: Update landParcel.js model**

Add to `app-backend/src/models/landParcel.js`:

```javascript
async findByStatus(projectId, status) {
  const result = await db.query(
    `SELECT * FROM land_parcels 
     WHERE project_id = $1 AND status = $2 
     ORDER BY stand`,
    [projectId, status]
  )
  return result.rows
},

async updateStatus(id, status) {
  const result = await db.query(
    `UPDATE land_parcels 
     SET status = $1, 
         finalized_at = CASE WHEN $1 = 'finalized' THEN NOW() ELSE finalized_at END,
         updated_at = NOW()
     WHERE id = $2 
     RETURNING *`,
    [status, id]
  )
  return result.rows[0]
},

async batchFinalize(parcelIds) {
  const result = await db.query(
    `UPDATE land_parcels
     SET status = 'finalized', finalized_at = NOW(), updated_at = NOW()
     WHERE id = ANY($1)
     RETURNING id, designation, status, finalized_at`,
    [parcelIds]
  )
  return result.rows
}
```

---

### **Step 5: Update Frontend Service** (15 minutes)

#### **5.1: Update spatial.ts**

Edit `app-frontend/src/services/spatial.ts`:

```typescript
// Update LandParcel interface
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
  status: 'draft' | 'finalized' | 'approved'  // NEW
  digitized_by?: number  // NEW
  finalized_at?: string  // NEW
  metadata: Record<string, any>  // NEW
  created_at: string
  updated_at: string  // NEW
}

// Update listLandParcels to support status filter
export async function listLandParcels(
  projectId: number,
  status?: 'draft' | 'finalized' | 'approved'
): Promise<LandParcel[]> {
  const params: any = { project_id: projectId }
  if (status) params.status = status
  
  const r = await api.get<{ ok: boolean; data: LandParcel[] }>('/land-parcels', { params })
  return r.data.data
}

// Add finalize function
export async function finalizeLandParcels(parcelIds: number[]): Promise<LandParcel[]> {
  const r = await api.patch<{ ok: boolean; data: LandParcel[] }>(
    '/land-parcels/finalize',
    { parcel_ids: parcelIds }
  )
  return r.data.data
}

// Add update function
export async function updateLandParcel(
  id: number,
  updates: Partial<LandParcel>
): Promise<LandParcel> {
  const r = await api.put<{ ok: boolean; data: LandParcel }>(
    `/land-parcels/${id}`,
    updates
  )
  return r.data.data
}
```

---

### **Step 6: Update MapLibreAreaView** (30 minutes)

Edit `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`:

```typescript
// Change imports
// OLD:
// import { fetchParcels, createParcel, updateParcel, deleteParcel } from '../../../services/areaParcels'

// NEW:
import { 
  listLandParcels, 
  createLandParcel, 
  updateLandParcel, 
  deleteLandParcel,
  finalizeLandParcels
} from '../../../services/spatial'

// Update loadParcelsFromDatabase function
async function loadParcelsFromDatabase() {
  if (!workflowState?.projectInfo?.projectId) {
    console.log('[MapLibre] 📦 No project ID - skipping parcel load');
    return;
  }
  
  try {
    console.log('[MapLibre] 📦 Loading existing parcels from database...');
    
    // NEW: Use listLandParcels instead of fetchParcels
    const existingParcels = await listLandParcels(
      workflowState.projectInfo.projectId
    );
    
    if (existingParcels.length === 0) {
      console.log('[MapLibre] 📝 No existing parcels found - starting fresh');
      return;
    }
    
    console.log(`[MapLibre] ✅ Found ${existingParcels.length} existing parcels`);
    
    // Convert database parcels to UI parcels format
    for (const dbParcel of existingParcels) {
      // Reconstruct Cape Lo points from metadata
      const capeLoPoints = dbParcel.metadata?.cape_lo_points || [];
      
      const parcel: Parcel = {
        designation: dbParcel.designation || dbParcel.stand,
        points: capeLoPoints,
        areaResult: {
          ok: true,
          area: {
            signed_m2: dbParcel.area_m2,
            abs_m2: Math.abs(dbParcel.area_m2),
            display: Math.abs(dbParcel.area_m2) >= 10000 
              ? { hectares: Math.abs(dbParcel.area_m2) / 10000, unit: 'ha' as const }
              : { square_meters: Math.abs(dbParcel.area_m2), unit: 'm2' as const }
          },
          // ... rest of conversion
        },
        status: dbParcel.status,  // NEW
        id: dbParcel.id
      };
      
      parcels.value.push(parcel);
    }
    
    console.log('[MapLibre] ✅ Loaded parcels into UI');
  } catch (error) {
    console.error('[MapLibre] ❌ Failed to load parcels:', error);
  }
}

// Update saveParcel function
async function saveParcel(parcel: Parcel) {
  try {
    // NEW: Use createLandParcel instead of createParcel
    const saved = await createLandParcel({
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
    });
    
    parcel.id = saved.id;
    console.log('[MapLibre] ✅ Parcel saved:', saved.id);
  } catch (error) {
    console.error('[MapLibre] ❌ Failed to save parcel:', error);
    throw error;
  }
}

// Add finalize function
async function finalizeParcels() {
  const parcelIds = parcels.value
    .filter(p => p.status === 'draft' && p.id)
    .map(p => p.id!);
  
  if (parcelIds.length === 0) {
    alert('No draft parcels to finalize');
    return;
  }
  
  try {
    const finalized = await finalizeLandParcels(parcelIds);
    console.log(`[MapLibre] ✅ Finalized ${finalized.length} parcels`);
    
    // Update UI
    parcels.value.forEach(p => {
      if (parcelIds.includes(p.id!)) {
        p.status = 'finalized';
      }
    });
    
    alert(`Successfully finalized ${finalized.length} parcels`);
  } catch (error) {
    console.error('[MapLibre] ❌ Failed to finalize:', error);
    alert('Failed to finalize parcels');
  }
}
```

---

### **Step 7: Test Both Workflows** (30 minutes)

#### **7.1: Test QGIS Workflow**

1. ✅ Open AreasView (Modules → Lite → Areas)
2. ✅ Select project
3. ✅ Click "Refresh Parcels"
4. ✅ Verify parcels load with new `status` field
5. ✅ Check console for no errors

#### **7.2: Test MapLibre Workflow**

1. ✅ Open MapLibreAreaView (Cadastral → Workflow)
2. ✅ Load survey points
3. ✅ Digitize a test parcel
4. ✅ Verify auto-save works
5. ✅ Check status shows "draft"
6. ✅ Test finalize button
7. ✅ Verify status changes to "finalized"

#### **7.3: Test Cross-Workflow**

1. ✅ Digitize parcel in QGIS → Save to database
2. ✅ Open MapLibreAreaView → Verify parcel appears
3. ✅ Digitize parcel in MapLibre → Auto-save
4. ✅ Open AreasView → Verify parcel appears
5. ✅ Finalize in MapLibre → Check status in AreasView

---

### **Step 8: Cleanup** (10 minutes)

#### **8.1: Remove deprecated service (optional)**

```bash
# After confirming everything works
rm app-frontend/src/services/areaParcels.ts

# Update any remaining imports (search codebase)
grep -r "areaParcels" app-frontend/src/
```

#### **8.2: Drop deprecated table (after 30 days)**

```sql
-- Only after confirming no issues for 30 days
DROP TABLE IF EXISTS parcels_deprecated_backup_029;
```

---

## 🎯 **Success Checklist**

- [ ] Database backup created
- [ ] Migration 029 ran successfully
- [ ] New columns exist in land_parcels
- [ ] Indexes and triggers created
- [ ] Backend API updated (finalize endpoint)
- [ ] Frontend service updated (spatial.ts)
- [ ] MapLibreAreaView updated (new imports)
- [ ] QGIS workflow tested (AreasView)
- [ ] MapLibre workflow tested (digitize + finalize)
- [ ] Cross-workflow tested (QGIS ↔ MapLibre)
- [ ] No console errors
- [ ] Data integrity verified

---

## 🔄 **Rollback Plan**

If issues arise:

```bash
# Stop application
npm stop

# Rollback migration
psql -U postgres -d surveypro_v1 -f migrations/029.undo.sql

# Restore backup
psql -U postgres -d surveypro_v1 < backup_before_unification_YYYYMMDD.sql

# Restart application
npm run dev
```

---

## 📊 **Expected Results**

### **Before Unification:**
- ❌ Two tables: `land_parcels` + `parcels`
- ❌ Two APIs: `/land-parcels` + `/area-parcels`
- ❌ Two services: `spatial.ts` + `areaParcels.ts`
- ❌ Data duplication
- ❌ Inconsistent CRS

### **After Unification:**
- ✅ One table: `land_parcels`
- ✅ One API: `/land-parcels`
- ✅ One service: `spatial.ts`
- ✅ Single source of truth
- ✅ Consistent CRS (EPSG:22291)
- ✅ Status tracking (draft/finalized/approved)
- ✅ Metadata storage (JSONB)
- ✅ Both workflows work seamlessly

---

## 🎉 **Benefits Achieved**

1. ✅ **Single source of truth** - No more confusion
2. ✅ **Correct CRS** - EPSG:22291 (Cape Lo 31)
3. ✅ **Modern features** - Status, metadata, finalization
4. ✅ **Backward compatible** - View for old API
5. ✅ **MapLibre primary** - Better UX
6. ✅ **QGIS optional** - Still supported
7. ✅ **Zero duplication** - Clean architecture
8. ✅ **Future-proof** - Extensible metadata

---

## 📞 **Support**

If you encounter issues:

1. Check console logs (browser + backend)
2. Verify migration output
3. Check database with verification queries
4. Test with small dataset first
5. Rollback if needed (migration 029.undo.sql)

---

**Ready to unify? Let's do this! 🚀**

**Estimated Time:** 2-3 hours  
**Risk Level:** Low (backward compatible view)  
**Rollback Time:** < 5 minutes
