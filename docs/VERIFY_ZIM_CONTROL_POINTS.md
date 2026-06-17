# Verification Guide: zim_control_points Table

This guide helps you verify that the `zim_control_points` table is set up correctly and the codebase is ready to use it.

---

## Quick Verification

### 1. Check Database Table

Run the verification script:

```bash
cd app-backend/scripts
psql -h localhost -U postgres -d surveypro_db -f verify-zim-control-points.sql
```

**What it checks:**
- ✅ Table exists
- ✅ Correct structure and columns
- ✅ Indexes are in place
- ✅ Data counts by type (PRIM, SEC, TERT, QUART, TSM)
- ✅ Data counts by Lo zone (27, 29, 31, 33)
- ✅ WGS84 coordinate coverage
- ✅ Foreign key constraints

---

### 2. Test Backend Connection

```bash
cd app-backend
node scripts/test-connection.js
```

**Expected output:**
```
✅ Connected to database successfully!
Current database: surveypro_db
✅ zim_control_points table EXISTS

Table structure:
  - id: integer (nullable: NO)
  - monu_num: character varying (nullable: NO)
  - monu_name: character varying (nullable: YES)
  - type: character varying (nullable: NO)
  ...

Current record count: 1281
```

---

### 3. Update Foreign Key Constraint

If the verification shows an old constraint, update it:

```sql
-- Connect to database
psql -h localhost -U postgres -d surveypro_db

-- Run the update
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

---

### 4. Restart Backend Server

```bash
cd app-backend
npm run dev
```

**Check console for:**
```
Server listening on http://localhost:3050
✅ Database connected successfully
```

---

### 5. Test API Endpoints

#### List Control Points (Lo 31)
```bash
curl "http://localhost:3050/api/control-points?gauss_lo=31&limit=5"
```

#### Find Nearby Points (Your Survey Area)
```bash
curl "http://localhost:3050/api/control-points/nearby?y=96799&x=2247815&gauss_lo=31&radius=30000"
```

#### Get Statistics
```bash
curl "http://localhost:3050/api/control-points/stats"
```

**Expected response:**
```json
{
  "total": "1281",
  "primary_count": "120",
  "secondary_count": "250",
  "tertiary_count": "300",
  "quaternary_count": "150",
  "tsm_count": "461",
  "lo27_count": "400",
  "lo29_count": "350",
  "lo31_count": "320",
  "lo33_count": "211",
  "unique_areas": "85"
}
```

---

### 6. Test Frontend

1. **Start frontend:**
   ```bash
   cd app-frontend
   npm run dev
   ```

2. **Navigate to Control Point Selection:**
   - Login to app
   - Open a project or create new
   - Go to "Control Point Selection" step

3. **Verify:**
   - ✅ Control points load for your Lo zone
   - ✅ Map displays points
   - ✅ Auto-selection works (increase radius to 30-40km)
   - ✅ Selected points save correctly

4. **Check browser console:**
   ```
   [ControlPointSelection] ✅ Loaded 1281 control points for Lo31
   [ControlPointSelection] 🎯 Auto-selecting control points within 30km...
   [ControlPointSelection] ✅ Auto-selected 15 control points within 30km
   ```

---

## Troubleshooting

### Error: "relation 'control_points' does not exist"

**Cause:** Code still referencing old table name

**Fix:** Check if all files were updated:
```bash
# Search for remaining references
grep -r "control_points" app-backend/src/
grep -r "control_points" app-backend/scripts/
```

Should only find references in:
- Migration files (historical, ignore)
- This verification guide

---

### Error: "foreign key constraint violation"

**Cause:** Foreign key still points to old table

**Fix:** Run the foreign key update script (Step 3 above)

---

### No control points loading in frontend

**Possible causes:**
1. Backend not running
2. Wrong database connection
3. Table is empty

**Fix:**
```bash
# Check backend is running
curl http://localhost:3050/api/control-points/stats

# Check record count
psql -h localhost -U postgres -d surveypro_db -c "SELECT COUNT(*) FROM zim_control_points;"

# Check connection settings in .env
cat app-backend/.env
```

---

### Only 1 control point found (Sparse Coverage)

**This is expected for your area!**

Your survey center (Y=96799, X=2247815) is in a sparse region.

**Solution:** Increase search radius in Control Point Selection view:
- Change from **20km** to **30-40km**
- Click "🔄 Re-run Auto-Selection"
- Should find 10-20 points including TSMs

---

## Summary Checklist

Before going live, verify:

- [ ] `zim_control_points` table exists with data
- [ ] Foreign key constraint updated
- [ ] Backend test script passes
- [ ] API endpoints return data
- [ ] Frontend loads control points
- [ ] Auto-selection works with increased radius
- [ ] Selected points save to project

---

## Data Migration Notes

If you need to copy data from old `control_points` to `zim_control_points`:

```sql
-- Copy all data (if zim_control_points is empty)
INSERT INTO public.zim_control_points 
SELECT * FROM public.control_points;

-- Or copy specific columns
INSERT INTO public.zim_control_points (
  monu_num, monu_name, type, comp_sheet, topo,
  gauss_lo, y_gauss, x_gauss, 
  lat_wgs84, lng_wgs84,
  msl_hgt, ped_hgt, pill_hgt,
  top_signal, bot_signal, 
  last_insp, deg_sqr, remark, area_nm
)
SELECT 
  monu_num, monu_name, type, comp_sheet, topo,
  gauss_lo, y_gauss, x_gauss,
  lat_wgs84, lng_wgs84,
  msl_hgt, ped_hgt, pill_hgt,
  top_signal, bot_signal,
  last_insp, deg_sqr, remark, area_nm
FROM public.control_points;
```

---

## Next Steps

After verification:
1. Test with your actual survey (541 points, Gwelo area)
2. Increase search radius to 30-40km
3. Verify TSMs are included in results
4. Complete Control Point Selection step
5. Continue with Found Beacons and subsequent workflow steps

**Good luck! 🚀**
