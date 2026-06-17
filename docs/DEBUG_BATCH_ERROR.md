# Debug Batch Computation 400 Error

## The Error

```
Failed to load resource: the server responded with a status of 400 (Bad Request)
AreasView.vue:699
```

This means the backend rejected the request. The most likely causes are:

1. **No points in coordinate layer** → "No points found in coordinate layer"
2. **No polygons in polygon layer** → "No polygons found in polygon layer"
3. **Wrong layer IDs selected**
4. **Features not linked to layers** (layer_id is NULL or wrong)

---

## How to Debug

### Step 1: Check Browser Console

Open browser console (F12) and look for the full error message. It should show something like:

```json
{
  "ok": false,
  "error": "No points found in coordinate layer"
}
```

or

```json
{
  "ok": false,
  "error": "No polygons found in polygon layer"
}
```

### Step 2: Check Network Tab

1. Open F12 → Network tab
2. Click "Compute All Areas" again
3. Find the request to `/api/compute/area/batch`
4. Click on it
5. Check:
   - **Request Payload**: What layer IDs were sent?
   - **Response**: What error message was returned?

Example request payload:
```json
{
  "polygon_layer_id": 6,
  "coordinate_layer_id": 5,
  "tolerance": 0.001,
  "save_results": true
}
```

### Step 3: Verify Data in Database

Run the SQL queries in `DIAGNOSE_BATCH_ERROR.sql` to check:

1. Does coordinate layer (e.g., layer 5) have points?
2. Does polygon layer (e.g., layer 6) have polygons?
3. Are features linked to the correct layers?

---

## Common Problems & Solutions

### Problem 1: "No points found in coordinate layer"

**Cause:** The coordinate layer has no Point features, or they're linked to a different layer.

**Check:**
```sql
SELECT COUNT(*) 
FROM features 
WHERE layer_id = 5 AND geometry->>'type' = 'Point';
```

**If count = 0:**

**Option A:** Points exist but have wrong layer_id
```sql
-- Find orphaned points
SELECT id, layer_id, properties->>'name' 
FROM features 
WHERE geometry->>'type' = 'Point';

-- Fix: Update to correct layer
UPDATE features
SET layer_id = 5  -- Your coordinate layer_id
WHERE geometry->>'type' = 'Point';
```

**Option B:** Points don't exist - need to export them
1. Go to AreasView
2. Add/load coordinate points
3. Click "Export Current Points to DB"

---

### Problem 2: "No polygons found in polygon layer"

**Cause:** The polygon layer has no Polygon features, or they're linked to a different layer.

**Check:**
```sql
SELECT COUNT(*) 
FROM features 
WHERE layer_id = 6 AND geometry->>'type' = 'Polygon';
```

**If count = 0:**

**Option A:** Polygons exist but have wrong layer_id
```sql
-- Find orphaned polygons
SELECT id, layer_id, properties->>'designation' 
FROM features 
WHERE geometry->>'type' = 'Polygon';

-- Fix: Update to correct layer
UPDATE features
SET layer_id = 6  -- Your polygon layer_id
WHERE geometry->>'type' = 'Polygon';
```

**Option B:** Polygons in QGIS but not in database
- The `land_parcels` layer in QGIS needs to be imported to the `features` table
- Use QGIS DB Manager → Import Layer → features table

---

### Problem 3: Wrong Layer IDs Selected

**Symptom:** You selected the wrong layers in the dropdown.

**Solution:**
1. Make sure you select:
   - **Coordinate List Layer**: The layer with Point features
   - **Polygon Layer**: The layer with Polygon features (land_parcels)
2. Check the layer names match what you expect

---

### Problem 4: Polygons in Separate Table

**Symptom:** QGIS shows `land_parcels` as a separate table, not in `features`.

**Check:**
```sql
-- List all tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE';
```

**If you see a `land_parcels` table:**

The polygons are in a separate table, not in `features`. You need to import them:

**In QGIS:**
1. Database → DB Manager
2. Expand PostGIS → SurveyPro
3. Find `land_parcels` table
4. Right-click → Export to File → Shapefile (temporary)
5. Then: Import Layer/File
6. Import to `features` table
7. Set layer_id to your polygon layer (e.g., 6)

**Or via SQL:**
```sql
-- Copy from land_parcels to features
INSERT INTO features (layer_id, project_id, geometry, properties)
SELECT 
  6,  -- Your polygon layer_id
  1,  -- Your project_id
  ST_AsGeoJSON(geom)::jsonb,  -- Convert geometry to GeoJSON
  jsonb_build_object('designation', designation)  -- Add properties
FROM land_parcels;
```

---

## Quick Fix Script

If you just need to link existing features to the correct layers:

```sql
-- Get layer IDs
SELECT id, name, geom_type FROM layers ORDER BY id;

-- Update points to coordinate layer (replace 5 with your layer_id)
UPDATE features
SET layer_id = 5
WHERE geometry->>'type' = 'Point'
  AND (layer_id IS NULL OR layer_id = 0);

-- Update polygons to polygon layer (replace 6 with your layer_id)
UPDATE features
SET layer_id = 6
WHERE geometry->>'type' = 'Polygon'
  AND (layer_id IS NULL OR layer_id = 0);

-- Verify
SELECT 
  l.id, l.name,
  COUNT(CASE WHEN f.geometry->>'type' = 'Point' THEN 1 END) as points,
  COUNT(CASE WHEN f.geometry->>'type' = 'Polygon' THEN 1 END) as polygons
FROM layers l
LEFT JOIN features f ON f.layer_id = l.id
GROUP BY l.id, l.name;
```

---

## After Fixing

1. **Refresh browser** (Ctrl+F5)
2. **Select both layers** in AreasView
3. **Click "Compute All Areas"**
4. **Should work now!** ✓

---

## Still Not Working?

If you still get 400 error after fixing:

1. **Check backend logs** - The terminal where `npm run dev` is running
2. **Check exact error message** - Browser console or Network tab Response
3. **Verify SQL results** - Run the diagnostic queries
4. **Share the error** - Copy the exact error message from console/network tab

The error message will tell you exactly what's wrong!
