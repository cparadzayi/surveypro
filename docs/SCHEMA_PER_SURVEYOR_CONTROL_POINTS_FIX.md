# Schema-Per-Surveyor: Control Points Access Fix

**Date:** December 5, 2025  
**Issue:** Control points not accessible after implementing schema-per-surveyor architecture

---

## Problem

After migrating to the **schema-per-surveyor** architecture:
- Each surveyor has their own schema: `schema_surveyor_kuziva`, `schema_surveyor_john`, etc.
- Shared data (control_points, districts, etc.) remains in the `public` schema
- The `control-points.js` API route was creating its own database pool without setting `search_path`
- Result: Queries couldn't find `control_points` table (looking in surveyor schema instead of public)

## Root Cause

The control points API route (`app-backend/src/routes/control-points.js`) was:

```javascript
// OLD - WRONG
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'surveypro_v1',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password'
});
```

This pool:
- ❌ Doesn't set `search_path`
- ❌ Defaults to `$user, public` search path (where `$user` = `postgres`)
- ❌ When called from surveyor context, can't access `public.control_points`

## Solution

### 1. Use Shared Base Pool

Changed to import the base pool from `db.js`:

```javascript
// NEW - CORRECT
import pool from '../config/db.js';
```

This pool doesn't set surveyor-specific search_path, so it searches in `public` schema by default.

### 2. Explicit Schema Qualification

Added `public.` prefix to ALL control_points queries:

```sql
-- Before
SELECT * FROM control_points WHERE gauss_lo = $1

-- After
SELECT * FROM public.control_points WHERE gauss_lo = $1
```

This ensures queries work regardless of current `search_path`.

## Files Modified

**File:** `app-backend/src/routes/control-points.js`

### Changes:
1. ✅ Import pool from `../config/db.js` instead of creating new pool
2. ✅ Added explicit `public.control_points` to ALL queries:
   - `SELECT ... FROM public.control_points`
   - `INSERT INTO public.control_points`
   - `UPDATE public.control_points`
   - `DELETE FROM public.control_points`

### Query Patterns Fixed:

- GET `/api/control-points` (paginated list)
- GET `/api/control-points/nearby` (radius search)
- GET `/api/control-points/stats` (statistics)
- GET `/api/control-points/:id` (single point)
- GET `/api/control-points/monument/:monu_num` (by monument number)
- POST `/api/control-points` (create)
- PUT `/api/control-points/:id` (update)
- DELETE `/api/control-points/:id` (delete)
- POST `/api/control-points/bulk-import` (bulk create)

## Why This Approach

### Option A: Use Base Pool + Explicit Schema ✅ (CHOSEN)
- Simple and explicit
- Works for all shared tables
- No search_path complexity
- Clear intent in SQL

### Option B: Set search_path in Each Query ❌
```javascript
await pool.query('SET search_path = public')
await pool.query('SELECT * FROM control_points...')
```
- Requires 2 queries per request
- Search path is session-scoped, could leak

### Option C: Use getSurveyorPool() ❌
```javascript
const surveyorPool = getSurveyorPool('schema_surveyor_kuziva')
```
- Wrong: Control points are NOT surveyor-specific
- They're shared across all surveyors

## Schema-Per-Surveyor Architecture

```
surveypro_db
├── public schema (SHARED DATA)
│   ├── control_points ← All surveyors access this
│   ├── districts
│   ├── users
│   └── surveyor_profiles
│
├── schema_surveyor_kuziva (SURVEYOR-SPECIFIC)
│   ├── survey_projects
│   ├── coordinate_points
│   ├── land_parcels
│   └── documents
│
└── schema_surveyor_john (SURVEYOR-SPECIFIC)
    ├── survey_projects
    ├── coordinate_points
    └── ...
```

**Search Path Pattern:**
- Surveyor-specific queries: `SET search_path = schema_surveyor_X, public`
- Shared data queries: Use base pool + `public.table_name`

## Testing

1. **Restart backend server** (changes require reload)
   ```bash
   cd app-backend
   npm run dev
   ```

2. **Test control points API:**
   ```bash
   # Should return all control points for Lo 31
   curl "http://localhost:3050/api/control-points?gauss_lo=31&limit=10"
   ```

3. **Test in frontend:**
   - Navigate to Cadastral Standard workflow
   - Go to Control Point Selection step
   - Should see ALL control points for selected Lo zone
   - Check browser console for debug output

4. **Expected console output:**
   ```
   [ControlPointSelection] ✅ Loaded 487 control points for Lo31
   [ControlPointSelection] DEBUG - Gauss Y (primary): 18862.52
   [ControlPointSelection] DEBUG - Gauss X (primary): 2268555.01
   [ControlPointSelection] DEBUG - WGS84 lat (display): -20.312456
   [ControlPointSelection] DEBUG - WGS84 lng (display): 30.067812
   ```

## Related Files

- `app-backend/src/config/db.js` - Base pool and schema helpers
- `app-backend/src/routes/control-points.js` - Fixed in this update
- `app-frontend/src/views/modules/cadastral-standard/ControlPointSelectionView.vue` - Consumer

## Impact

✅ **Fixed:** Control points now accessible from any surveyor schema  
✅ **Fixed:** 20km radius search returns all nearby points  
✅ **Maintained:** Multi-tenancy isolation for surveyor data  
✅ **Improved:** Explicit schema qualification prevents future issues  

## Prevention

For future shared tables in `public` schema:
1. Use base pool from `db.js`
2. Explicitly qualify with `public.table_name`
3. Document which tables are shared vs. surveyor-specific

---

**Status:** Fixed. Control points now accessible across all surveyor schemas.
