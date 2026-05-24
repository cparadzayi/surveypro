# PostGIS Export Schema Issue - Analysis & Fix

## 🔴 CRITICAL ISSUE FOUND

**The "Export to PostGIS Database" button is exporting to `public.coordinate_points` instead of surveyor-specific schemas like `surveyor_elon_paradza.coordinate_points`**

## Problem Analysis

### Current Flow

1. **Frontend** (`QGISExportView.vue`):
   - Calls `batchCreateCoordinatePoints(projectId, points)`
   
2. **API Service** (`spatial.ts`):
   - Sends `POST /coordinate-points/batch` with project_id and points array
   
3. **Backend Route** (`coordinatePoints.js` line 67-95):
   ```javascript
   app.post('/coordinate-points/batch', {
     preHandler: [app.authenticate],  // ❌ Only JWT auth, NO schema context
   }, async (request, reply) => {
     const { project_id, points } = request.body
     const created = await CoordinatePoint.batchCreate(project_id, points)
     return { ok: true, data: created, count: created.length }
   })
   ```
   
4. **Model** (`coordinatePoint.js` line 48-72):
   ```javascript
   async batchCreate(projectId, points) {
     // ...
     const sql = `
       INSERT INTO coordinate_points (project_id, name, geom, elevation, description)
       VALUES ${values.join(', ')}
       ON CONFLICT (project_id, name) 
       DO UPDATE SET geom = EXCLUDED.geom, ...
     `
     const result = await db.query(sql, params)  // ❌ Uses default pool = public schema
     return result.rows
   }
   ```

### Why It Fails

- **Route uses `app.authenticate`** which only verifies JWT token
- **Route does NOT use `authenticateWithSchema`** middleware
- **Model uses default `db`** pool which defaults to `search_path = public`
- **No schema context** is passed to the model

### Schema-Aware Infrastructure EXISTS

The infrastructure for surveyor-specific schemas already exists:

1. **Migration 040** (`040_schema_per_surveyor.sql`):
   - Adds `schema_name` column to `surveyor_profiles` table
   - Creates `create_surveyor_schema()` function
   - Creates separate schemas: `surveyor_john_doe`, `surveyor_jane_smith`, etc.

2. **Schema Auth Middleware** (`utils/schemaAuth.js`):
   ```javascript
   export async function authenticateWithSchema(request, reply) {
     const profile = await SurveyorProfile.findByUserId(user.id)
     
     request.surveyorSchema = profile.schema_name  // e.g., "surveyor_elon_paradza"
     request.surveyorProfile = profile
     request.db = getSurveyorPool(profile.schema_name)  // ✅ Schema-aware pool
   }
   ```

3. **Schema-Aware Pool** (`config/db.js`):
   ```javascript
   function getSurveyorPool(schemaName) {
     return {
       async query(sql, params) {
         await client.query(`SET search_path = ${schemaName}, public`)
         const result = await client.query(sql, params)
         return result
       }
     }
   }
   ```

## 🎯 THE FIX

### Option 1: Update Route to Use Schema-Aware Middleware (RECOMMENDED)

**File:** `app-backend/src/routes/coordinatePoints.js`

```javascript
import CoordinatePoint from '../models/coordinatePoint.js'
import { authenticateWithSchema } from '../utils/schemaAuth.js'  // ADD THIS

export default async function coordinatePointRoutes(app) {
  // Batch create coordinate points
  app.post('/coordinate-points/batch', {
    preHandler: [app.authenticate, authenticateWithSchema],  // ADD authenticateWithSchema
    schema: { /* ... */ }
  }, async (request, reply) => {
    const { project_id, points } = request.body
    
    // Use schema-aware DB connection
    const created = await CoordinatePoint.batchCreateWithDb(
      request.db,          // ✅ Schema-aware pool
      project_id, 
      points
    )
    
    return { ok: true, data: created, count: created.length }
  })
  
  // Update other routes similarly...
}
```

**File:** `app-backend/src/models/coordinatePoint.js`

```javascript
export default {
  // Existing method (uses default pool)
  async batchCreate(projectId, points) {
    // ... existing code ...
    const result = await db.query(sql, params)
    return result.rows
  },
  
  // NEW: Schema-aware method
  async batchCreateWithDb(dbConnection, projectId, points) {
    const values = []
    const params = []
    let paramIndex = 1

    for (const pt of points) {
      values.push(`($${paramIndex}, $${paramIndex+1}, ST_SetSRID(ST_MakePoint($${paramIndex+2}, $${paramIndex+3}), 22291), $${paramIndex+4}, $${paramIndex+5})`)
      params.push(projectId, pt.name, pt.y, pt.x, pt.elevation || null, pt.description || null)
      paramIndex += 6
    }

    const sql = `
      INSERT INTO coordinate_points (project_id, name, geom, elevation, description)
      VALUES ${values.join(', ')}
      ON CONFLICT (project_id, name) 
      DO UPDATE SET 
        geom = EXCLUDED.geom,
        elevation = EXCLUDED.elevation,
        description = EXCLUDED.description,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `
    
    const result = await dbConnection.query(sql, params)  // ✅ Uses schema-aware pool
    return result.rows
  }
}
```

### Option 2: Make All Routes Schema-Aware (COMPREHENSIVE)

Apply the same pattern to ALL coordinate-points and land-parcels routes:

- `POST /coordinate-points` → Add `authenticateWithSchema`, use `request.db`
- `GET /coordinate-points` → Add `authenticateWithSchema`, use `request.db`
- `DELETE /coordinate-points/:id` → Add `authenticateWithSchema`, use `request.db`
- `POST /land-parcels` → Add `authenticateWithSchema`, use `request.db`
- `GET /land-parcels` → Add `authenticateWithSchema`, use `request.db`
- etc.

## Testing the Fix

### Before Fix (Current Behavior)

```sql
-- User: elon_paradza@example.com exports 540 points
-- Points go to public schema ❌
SELECT COUNT(*) FROM public.coordinate_points WHERE project_id = 2;
-- Result: 540 points

SELECT COUNT(*) FROM surveyor_elon_paradza.coordinate_points WHERE project_id = 2;
-- Result: 0 points (empty!) ❌
```

### After Fix (Expected Behavior)

```sql
-- User: elon_paradza@example.com exports 540 points
-- Points go to surveyor schema ✅
SELECT COUNT(*) FROM public.coordinate_points WHERE project_id = 2;
-- Result: 0 points (empty)

SELECT COUNT(*) FROM surveyor_elon_paradza.coordinate_points WHERE project_id = 2;
-- Result: 540 points ✅
```

### QGIS Connection

After the fix, QGIS should connect to the surveyor's schema:

```
Connection URI: 
postgresql://surveyor_app@localhost:5432/surveypro_v1?schema=surveyor_elon_paradza
```

## Migration Status Check

### Check if Migration 040 Has Been Run

```sql
-- Check if schema_name column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'surveyor_profiles' 
  AND column_name = 'schema_name';

-- Check if surveyor schemas exist
SELECT nspname 
FROM pg_namespace 
WHERE nspname LIKE 'surveyor_%';

-- Check if current surveyors have schema_name populated
SELECT id, name, email, schema_name 
FROM surveyor_profiles;
```

### If Migration 040 Not Run

```bash
# Run migration
cd app-backend
npm run migrate

# Or manually apply
psql -U surveyor_app -d surveypro_v1 -f migrations/040_schema_per_surveyor.sql
```

### Create Schemas for Existing Surveyors

```sql
-- For each existing surveyor, create their schema
SELECT create_surveyor_schema('elon_paradza');  -- Returns: surveyor_elon_paradza

-- Update surveyor_profiles table
UPDATE surveyor_profiles 
SET schema_name = 'surveyor_elon_paradza' 
WHERE email = 'elon.paradza@example.com';
```

## Implementation Checklist

- [ ] Verify migration 040 has been run (`schema_name` column exists)
- [ ] Create schemas for existing surveyors
- [ ] Update `surveyor_profiles.schema_name` for all existing surveyors
- [ ] Import `authenticateWithSchema` in `coordinatePoints.js`
- [ ] Add `authenticateWithSchema` to preHandler array for all routes
- [ ] Create `batchCreateWithDb()` method in CoordinatePoint model
- [ ] Update route handler to use `request.db`
- [ ] Test with user "elon_paradza" exporting 540 points
- [ ] Verify points appear in `surveyor_elon_paradza.coordinate_points`
- [ ] Verify QGIS can connect to surveyor schema
- [ ] Apply same pattern to `landParcel.js` routes and model
- [ ] Update QGIS connection info endpoint to return surveyor schema

## Files to Modify

1. `app-backend/src/routes/coordinatePoints.js` (add middleware, use request.db)
2. `app-backend/src/models/coordinatePoint.js` (add schema-aware methods)
3. `app-backend/src/routes/landParcels.js` (same pattern)
4. `app-backend/src/models/landParcel.js` (same pattern)
5. `app-backend/src/routes/spatial.js` (update db-connection endpoint to return schema)

## Impact on QGIS Workflow

### Current (Broken)

- User exports → Points go to `public.coordinate_points`
- QGIS connects to `public` schema
- User digitizes parcels → Parcels go to `public.land_parcels`
- ❌ All surveyors share the same tables (no isolation)

### After Fix (Correct)

- User exports → Points go to `surveyor_xxx.coordinate_points`
- QGIS connects to `surveyor_xxx` schema
- User digitizes parcels → Parcels go to `surveyor_xxx.land_parcels`
- ✅ Each surveyor has isolated data (proper multi-tenancy)

## Priority

🔴 **CRITICAL** - This is a data isolation issue. All surveyors are currently sharing the same `public.coordinate_points` table, which breaks the multi-tenancy architecture.

---

**Status:** Issue identified, fix documented, awaiting implementation
**Date:** December 5, 2025
**Reporter:** Cascade AI Analysis
