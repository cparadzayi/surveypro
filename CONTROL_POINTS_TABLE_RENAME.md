# Control Points Table Rename: `control_points` → `zim_control_points`

**Date:** December 5, 2025  
**Reason:** User created new `zim_control_points` table in `surveypro_db`

---

## Files Modified

### 1. Backend API Routes
**File:** `app-backend/src/routes/control-points.js`

**Changes:**
- ✅ All SQL queries updated to use `public.zim_control_points`
- Routes affected:
  - `GET /api/control-points` (list with pagination)
  - `GET /api/control-points/nearby` (proximity search)
  - `GET /api/control-points/stats` (statistics)
  - `GET /api/control-points/:id` (get by ID)
  - `GET /api/control-points/monument/:monu_num` (get by monument number)
  - `POST /api/control-points` (create)
  - `PUT /api/control-points/:id` (update)
  - `DELETE /api/control-points/:id` (delete)
  - `POST /api/control-points/bulk-import` (bulk import)

**Example Change:**
```sql
-- Before:
FROM public.control_points
-- After:
FROM public.zim_control_points
```

---

### 2. Backend Models
**File:** `app-backend/src/models/SurveyProject.js`

**Changes:**
- ✅ Updated 3 JOIN statements in:
  - `findAll()` method (line 102)
  - `findById()` method (line 155)
  - `findBySurveyor()` method (line 290)

**Example Change:**
```sql
-- Before:
JOIN control_points cp ON pcp.control_point_id = cp.id
-- After:
JOIN public.zim_control_points cp ON pcp.control_point_id = cp.id
```

---

## Files NOT Modified (No Changes Required)

### Frontend
- ✅ `app-frontend/*` - No changes needed (uses API endpoints, not direct table references)

### Migrations
- ℹ️ `app-backend/migrations/*.sql` - Historical migration files remain unchanged
  - These are for reference/documentation only
  - **Important:** Do NOT run old migrations against `zim_control_points`
  - The new table should already have the correct schema

### Junction Tables
- ✅ `project_control_points` table - No changes needed
  - Still uses `control_point_id` column name (foreign key reference)
  - The foreign key constraint may need updating in the database

---

## Database Schema Notes

### Table Structure
The `zim_control_points` table should have the following columns:
```sql
- id (SERIAL PRIMARY KEY)
- monu_num (VARCHAR, UNIQUE)
- monu_name (VARCHAR)
- type (VARCHAR) -- PRIM, SEC, TERT, QUART, TSM
- comp_sheet, topo (VARCHAR)
- gauss_lo (INTEGER) -- 27, 29, 31, 33
- y_gauss, x_gauss (NUMERIC)
- lat_wgs84, lng_wgs84 (NUMERIC) -- WGS84 coordinates
- msl_hgt, ped_hgt, pill_hgt (NUMERIC)
- top_signal, bot_signal (NUMERIC)
- last_insp (DATE)
- deg_sqr (VARCHAR)
- remark (TEXT)
- area_nm (VARCHAR)
- created_at, updated_at (TIMESTAMP)
- created_by, updated_by (INTEGER)
```

### Foreign Key Constraint
If you haven't already, update the foreign key constraint in `project_control_points`:

```sql
-- Check existing constraint
SELECT conname, conrelid::regclass, confrelid::regclass
FROM pg_constraint
WHERE conname LIKE '%control_point%';

-- Drop old constraint (if exists)
ALTER TABLE project_control_points 
  DROP CONSTRAINT IF EXISTS project_control_points_control_point_id_fkey;

-- Add new constraint pointing to zim_control_points
ALTER TABLE project_control_points
  ADD CONSTRAINT project_control_points_control_point_id_fkey
  FOREIGN KEY (control_point_id) 
  REFERENCES public.zim_control_points(id) 
  ON DELETE CASCADE;
```

---

## Testing Checklist

### Backend API Tests
- [ ] `GET /api/control-points?gauss_lo=31` - Returns points for Lo 31
- [ ] `GET /api/control-points/nearby?y=96799&x=2247815&gauss_lo=31&radius=30000` - Returns nearby points
- [ ] `GET /api/control-points/stats` - Returns correct statistics
- [ ] `GET /api/control-points/:id` - Returns specific point
- [ ] `POST /api/control-points` - Creates new point (auth required)
- [ ] `PUT /api/control-points/:id` - Updates point (auth required)
- [ ] `DELETE /api/control-points/:id` - Deletes point (auth required)

### Frontend Integration Tests
- [ ] Control Point Selection View loads points
- [ ] Auto-selection finds nearby points (increase radius to 30-40km)
- [ ] Map displays control points correctly
- [ ] Selected control points save to project

### Project Model Tests
- [ ] `SurveyProject.findAll()` loads control points correctly
- [ ] `SurveyProject.findById()` loads control points correctly
- [ ] `SurveyProject.findBySurveyor()` loads control points correctly
- [ ] Control point IDs persist in workflow state

---

## Rollback Plan (If Needed)

If issues occur, rollback by reversing all changes:

```bash
# 1. In control-points.js
sed -i 's/zim_control_points/control_points/g' app-backend/src/routes/control-points.js

# 2. In SurveyProject.js
sed -i 's/zim_control_points/control_points/g' app-backend/src/models/SurveyProject.js

# 3. Restart backend
cd app-backend
npm run dev
```

Or use Git:
```bash
git diff HEAD app-backend/src/routes/control-points.js
git diff HEAD app-backend/src/models/SurveyProject.js
git checkout HEAD -- app-backend/src/routes/control-points.js app-backend/src/models/SurveyProject.js
```

---

## Summary

**Total Files Modified:** 2
- `app-backend/src/routes/control-points.js` (9 query updates)
- `app-backend/src/models/SurveyProject.js` (3 JOIN updates)

**Total SQL References Updated:** 12

**Status:** ✅ Complete - Ready for testing

**Next Steps:**
1. ✅ **Run Verification Script:**
   ```bash
   cd app-backend/scripts
   psql -h localhost -U postgres -d surveypro_db -f verify-zim-control-points.sql
   ```

2. ✅ **Test Backend Connection:**
   ```bash
   cd app-backend
   node scripts/test-connection.js
   ```

3. ✅ **Update Foreign Key Constraint:**
   ```sql
   psql -h localhost -U postgres -d surveypro_db
   
   BEGIN;
   ALTER TABLE project_control_points 
     DROP CONSTRAINT IF EXISTS project_control_points_control_point_id_fkey;
   ALTER TABLE project_control_points
     ADD CONSTRAINT project_control_points_control_point_id_fkey
     FOREIGN KEY (control_point_id) 
     REFERENCES public.zim_control_points(id) 
     ON DELETE CASCADE;
   COMMIT;
   ```

4. ✅ **Restart Backend Server:**
   ```bash
   cd app-backend
   npm run dev
   ```

5. ✅ **Test API Endpoints:**
   ```bash
   # Statistics
   curl http://localhost:3050/api/control-points/stats
   
   # Nearby points (your survey area)
   curl "http://localhost:3050/api/control-points/nearby?y=96799&x=2247815&gauss_lo=31&radius=30000"
   ```

6. ✅ **Test Frontend:**
   - Navigate to Control Point Selection
   - Increase search radius to 30-40km
   - Verify points load and auto-selection works

📖 **See VERIFY_ZIM_CONTROL_POINTS.md for detailed verification steps**
