# Quick Start: Normalized Schema

## 5-Minute Setup

### Step 1: Run Migration (1 min)
```bash
cd app-backend
npm run migrate
```

Expected output:
```
✓ Running migration 017.do.sql
✓ Created coordinate_points table
✓ Created land_parcels table
✓ Migration complete
```

### Step 2: Verify Tables (1 min)
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('coordinate_points', 'land_parcels');

-- Should return:
-- coordinate_points
-- land_parcels
```

### Step 3: Import Existing Data (2 min)

**If you have existing land_parcels table:**
```sql
-- Import from old land_parcels to new structure
INSERT INTO land_parcels (project_id, stand, geom)
SELECT 
  1,  -- Your project_id
  stand,
  geom
FROM land_parcels_old;  -- Rename your old table first
```

**If you have coordinate points in features table:**
```sql
-- Import from features table
INSERT INTO coordinate_points (project_id, name, geom)
SELECT 
  project_id,
  properties->>'name',
  ST_SetSRID(ST_MakePoint(
    (geometry->'coordinates'->0)::numeric,
    (geometry->'coordinates'->1)::numeric
  ), 22291)
FROM features
WHERE geometry->>'type' = 'Point';
```

### Step 4: Test Backend (1 min)
```bash
# Restart server
npm run dev

# Test (replace TOKEN and project_id)
curl -X POST http://localhost:3050/api/compute/area/batch/v2 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"project_id": 1}'
```

Expected response:
```json
{
  "ok": true,
  "total_polygons": 4,
  "success_count": 3,
  "failure_count": 1,
  "results": [...]
}
```

---

## QGIS Quick Test

### 1. Add Tables
- Open QGIS
- Add PostGIS Layer
- Add `coordinate_points` table
- Add `land_parcels` table

### 2. Digitize Test Parcel
- Enable editing on `land_parcels`
- Enable snapping to `coordinate_points`
- Draw a polygon
- Enter stand name
- Save

### 3. Verify in Database
```sql
SELECT id, stand, area_m2, area_ha 
FROM land_parcels;
```

Area columns should be auto-populated! ✓

---

## Troubleshooting

### "Table already exists"
```sql
-- Check if migration already ran
SELECT * FROM coordinate_points LIMIT 1;
-- If this works, migration already complete
```

### "No coordinate points found"
```sql
-- Check data
SELECT COUNT(*) FROM coordinate_points;
-- If 0, import data (see Step 3)
```

### "No land parcels found"
```sql
-- Check data
SELECT COUNT(*) FROM land_parcels;
-- If 0, digitize in QGIS or import data
```

---

## Next: Frontend Integration

See `NORMALIZED_SCHEMA_IMPLEMENTATION.md` for complete details.

**You're ready to use the normalized schema!** 🎉
