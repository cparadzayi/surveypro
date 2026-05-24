# 🔧 QGIS Parcel Import Fix

## 🎯 Problem Identified

**Root Cause:** MapLibreAreaView queries `area_parcels` table, but QGIS digitizes to `land_parcels` table.

**Two Separate Tables:**
1. **`area_parcels`** - Used by cadastral workflow (MapLibreAreaView)
2. **`land_parcels`** - Used by QGIS/Areas module workflow

**Result:** Parcels digitized in QGIS don't appear in MapLibreAreaView because they're in different tables!

---

## ✅ **Solution Options**

### **Option 1: Use Areas Module Instead** (IMMEDIATE - RECOMMENDED)

Since you digitized in QGIS, use the **Areas Module** to view your parcels:

1. Navigate to **Modules** → **Lite** → **Areas**
2. Select your project
3. Click **"Refresh Parcels"** button
4. Your QGIS parcels will appear in the list
5. Click **"Run Batch Computation"** to calculate areas

**This module is specifically designed for QGIS workflows!**

---

### **Option 2: Import QGIS Parcels to Cadastral Workflow** (REQUIRES CODE CHANGE)

Add a function to import from `land_parcels` to `area_parcels`:

#### **Backend: Add Import Endpoint**

Create `app-backend/src/routes/import-parcels.js`:

```javascript
import db from '../config/db.js'

export default async function importParcelRoutes(app) {
  // Import parcels from land_parcels to area_parcels
  app.post('/area-parcels/import-from-qgis', {
    preHandler: [app.authenticate],
    schema: {
      body: {
        type: 'object',
        required: ['project_id'],
        properties: {
          project_id: { type: 'number' }
        }
      }
    }
  }, async (request, reply) => {
    const { project_id } = request.body
    
    try {
      // Copy parcels from land_parcels to area_parcels
      const result = await db.query(`
        INSERT INTO area_parcels (
          project_id, 
          designation, 
          geom, 
          area_sqm, 
          perimeter_m, 
          closure_error, 
          closure_ratio,
          status,
          metadata
        )
        SELECT 
          project_id,
          stand as designation,
          geom,
          area_m2 as area_sqm,
          perimeter_m,
          closure_error_m as closure_error,
          CASE 
            WHEN perimeter_m > 0 THEN (closure_error_m / perimeter_m)::text
            ELSE '0'
          END as closure_ratio,
          'draft' as status,
          jsonb_build_object(
            'imported_from', 'land_parcels',
            'imported_at', NOW()
          ) as metadata
        FROM land_parcels
        WHERE project_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM area_parcels ap 
          WHERE ap.project_id = land_parcels.project_id 
          AND ap.designation = land_parcels.stand
        )
        RETURNING id, designation
      `, [project_id])
      
      return { 
        ok: true, 
        imported: result.rowCount,
        parcels: result.rows
      }
    } catch (error) {
      console.error('Import error:', error)
      return reply.code(500).send({ 
        ok: false, 
        error: error.message 
      })
    }
  })
}
```

Register in `app-backend/src/server.js`:

```javascript
import importParcelRoutes from './routes/import-parcels.js'

// ... after other routes
await app.register(importParcelRoutes, { prefix: '/api' })
```

#### **Frontend: Add Import Button**

In `MapLibreAreaView.vue`, add import function:

```typescript
import { listLandParcels } from '../../../services/spatial'

async function importFromQGIS() {
  if (!workflowState?.projectInfo?.projectId) {
    alert('No project selected')
    return
  }
  
  try {
    console.log('[MapLibre] 📥 Importing parcels from QGIS...')
    
    // Call import endpoint
    const response = await api.post('/area-parcels/import-from-qgis', {
      project_id: workflowState.projectInfo.projectId
    })
    
    console.log(`[MapLibre] ✅ Imported ${response.data.imported} parcels`)
    alert(`Successfully imported ${response.data.imported} parcels from QGIS`)
    
    // Reload parcels
    await loadParcelsFromDatabase()
    
  } catch (error) {
    console.error('[MapLibre] ❌ Import failed:', error)
    alert('Failed to import parcels from QGIS')
  }
}
```

Add button in template:

```vue
<button 
  @click="importFromQGIS"
  class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
>
  📥 Import from QGIS
</button>
```

---

### **Option 3: Unified Table Approach** (LONG-TERM)

Merge both workflows to use a single `land_parcels` table:

1. Update `MapLibreAreaView` to query `land_parcels` instead of `area_parcels`
2. Add `status` column to `land_parcels` (draft/finalized/approved)
3. Update all references to use unified table

**Migration SQL:**

```sql
-- Add status column to land_parcels
ALTER TABLE land_parcels 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'draft';

-- Migrate existing area_parcels to land_parcels
INSERT INTO land_parcels (
  project_id, stand, geom, area_m2, perimeter_m, 
  closure_error_m, status, created_at
)
SELECT 
  project_id, designation, geom, area_sqm, perimeter_m,
  closure_error, status, created_at
FROM area_parcels
WHERE NOT EXISTS (
  SELECT 1 FROM land_parcels lp
  WHERE lp.project_id = area_parcels.project_id
  AND lp.stand = area_parcels.designation
);

-- Drop area_parcels table (after backup!)
-- DROP TABLE area_parcels;
```

---

## 🎯 **Recommended Immediate Action**

**Use Option 1** - Navigate to **Areas Module**:

1. Go to **Modules** → **Lite** → **Areas**
2. Select your project from dropdown
3. Click **"Refresh Parcels"** button (or it auto-loads)
4. Your QGIS parcels will appear in the table
5. Click **"Run Batch Computation"** to calculate areas
6. View results with closure errors

**This is the correct workflow for QGIS-digitized parcels!**

---

## 📊 **Verification**

To confirm your parcels are in the database, run this SQL:

```sql
-- Check land_parcels (QGIS table)
SELECT 
  id, 
  project_id, 
  stand as designation,
  ST_AsText(ST_Centroid(geom)) as centroid,
  area_m2,
  perimeter_m,
  created_at
FROM land_parcels
WHERE project_id = YOUR_PROJECT_ID
ORDER BY stand;

-- Check area_parcels (Cadastral workflow table)
SELECT 
  id,
  project_id,
  designation,
  ST_AsText(ST_Centroid(geom)) as centroid,
  area_sqm,
  perimeter_m,
  status,
  created_at
FROM area_parcels
WHERE project_id = YOUR_PROJECT_ID
ORDER BY designation;
```

---

## 🔄 **Database Name Issue**

You mentioned `surveypro_v1` but the app might be configured for `surveypro`. Check:

1. **Backend `.env` file:**
   ```
   DATABASE_URL=postgres://postgres:password@localhost:5432/surveypro_v1
   ```

2. **QGIS Connection:**
   - Database: `surveypro_v1` (must match!)

3. **Verify Connection:**
   ```sql
   SELECT current_database();
   ```

**If databases don't match:**
- Either update `.env` to use `surveypro_v1`
- OR connect QGIS to `surveypro` (without `_v1`)

---

## ✅ **Quick Fix Summary**

**Immediate (5 minutes):**
1. ✅ Use **Areas Module** instead of MapLibreAreaView
2. ✅ Verify database names match (`surveypro` vs `surveypro_v1`)
3. ✅ Click "Refresh Parcels" in Areas module
4. ✅ Run batch computation

**Short-term (30 minutes):**
- Implement Option 2 (Import from QGIS button)

**Long-term (2-3 hours):**
- Implement Option 3 (Unified table approach)

---

## 📞 **Next Steps**

1. **Try Areas Module first** (Modules → Lite → Areas)
2. **Verify database connection** (check `.env` and QGIS)
3. **If still not working**, check console logs for errors
4. **If you need MapLibreAreaView**, implement Option 2

---

**The parcels ARE in the database, just in a different table!** 🎉
