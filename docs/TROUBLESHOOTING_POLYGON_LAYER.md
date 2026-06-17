# Troubleshooting: Polygon Layer Not Showing

## Problem

The "Polygon Layer (from QGIS)" dropdown is showing point layers instead of polygon layers.

**What you're seeing:**
- Avondale - Survey Points
- Avondale - Coordinate List Points (SRID 22291)

**What you need:**
- A layer containing polygons (e.g., "Avondale - Land Parcels")

---

## Root Cause

**The polygon layer doesn't exist in the database yet!**

You need to:
1. Create polygons in QGIS first
2. Save them to the database
3. Then they'll appear in the dropdown

---

## Solution: Create Polygon Layer in QGIS

### Step 1: Verify Coordinate List Exists

First, make sure your coordinate list is in the database:

**In SurveyPro:**
1. You already have "Avondale - Coordinate List Points (SRID 22291)" ✓
2. This is good - you can use this as your reference points

### Step 2: Open QGIS and Connect to Database

**Get connection info:**
1. In SurveyPro, click "Show Instructions" in the Batch Area Computation section
2. Click "Get QGIS Connection Info"
3. Connection details will be displayed and copied to clipboard

**In QGIS:**
1. Open QGIS Desktop
2. Go to: **Layer → Add Layer → Add PostGIS Layers**
3. Click **"New"** to create connection
4. Enter details:
   - **Name**: SurveyPro
   - **Host**: localhost (or your server IP)
   - **Port**: 5432
   - **Database**: surveypro
   - **Username**: postgres
   - **Password**: (your database password)
5. Click **"Test Connection"** - should show "Connection successful"
6. Click **"OK"**

### Step 3: Load Coordinate List in QGIS

1. In the PostGIS connection dialog, expand **"SurveyPro"**
2. Find the **"features"** table
3. Click **"Add"**
4. Points should appear on the map

**Enable labels:**
1. Right-click the layer → **Properties**
2. Go to **Labels** tab
3. Change to **"Single Labels"**
4. Value: Select **`name`** from dropdown
5. Click **"Apply"**
6. Point names (A, B, C, etc.) should now display

### Step 4: Create Polygon Layer

**Option A: Create New Shapefile (Temporary)**

1. **Layer → Create Layer → New Shapefile Layer**
2. Settings:
   - **File name**: Browse and save (e.g., `land_parcels.shp`)
   - **Geometry type**: Polygon
   - **CRS**: EPSG:22291 (same as coordinate list)
3. Add fields:
   - **Name**: `designation`, **Type**: Text, **Length**: 255
   - Click **"Add to Fields List"**
4. Click **"OK"**

**Option B: Create PostGIS Layer Directly**

1. **Database → DB Manager**
2. Expand **PostGIS → SurveyPro**
3. Click **"Create Table"** button (or SQL window)
4. Run SQL:
```sql
-- This is handled by the app, but you can verify the structure
SELECT * FROM layers WHERE name LIKE '%Parcel%';
```

### Step 5: Enable Snapping

**Critical for accurate digitization!**

1. **Settings → Snapping Options** (or press **S** key)
2. Settings:
   - **Enable snapping**: Check the box
   - **Mode**: All Layers (or Active Layer)
   - **Type**: Vertex
   - **Tolerance**: 0.01 meters (10mm)
   - **Units**: meters
3. Click **"OK"**

### Step 6: Digitize Polygons

1. **Select the polygon layer** in Layers panel
2. Click **"Toggle Editing"** (pencil icon) or press **Ctrl+E**
3. Click **"Add Polygon Feature"** (polygon icon)
4. **Click points in order:**
   - Click near point A (cursor should snap to it)
   - Click near point B (cursor should snap to it)
   - Click near point C (cursor should snap to it)
   - Click near point D (cursor should snap to it)
   - Right-click to finish polygon
5. **Enter attributes:**
   - designation: "Stand 2344" (or your parcel name)
   - Click **"OK"**
6. **Repeat for all parcels** (e.g., 25 stands)
7. Click **"Save Layer Edits"** (disk icon)
8. Click **"Toggle Editing"** to stop editing

### Step 7: Save Polygons to Database

**If you created a shapefile, import it:**

1. **Database → DB Manager**
2. Expand **PostGIS → SurveyPro**
3. Click **"Import Layer/File"** button
4. Settings:
   - **Input**: Select your polygon shapefile
   - **Schema**: public
   - **Table**: features (or create new table)
   - **Primary key**: id
   - **Geometry column**: geometry
   - **Source SRID**: 22291
   - **Target SRID**: 22291
5. Click **"OK"**

**Important:** The polygons need to be in the `features` table with a different `layer_id` than your coordinate list.

### Step 8: Create Layer Record in SurveyPro

**The polygons are in the database, but you need a layer record:**

**Option A: Use SurveyPro UI**
1. Go to Projects/Layers management
2. Create new layer:
   - **Name**: "Avondale - Land Parcels"
   - **Type**: Polygon
   - **SRID**: 22291
   - **Project**: Avondale - Survey Points

**Option B: SQL (Quick)**
```sql
-- Insert layer record
INSERT INTO layers (project_id, name, geometry_type, srid, description)
VALUES (
  (SELECT id FROM projects WHERE name LIKE '%Avondale%' LIMIT 1),
  'Avondale - Land Parcels',
  'Polygon',
  22291,
  'Land parcels digitized in QGIS'
)
RETURNING id;

-- Note the returned layer_id (e.g., 6)
```

### Step 9: Link Polygons to Layer

**Update the features to reference the new layer:**

```sql
-- First, find the layer_id you just created
SELECT id, name FROM layers WHERE name LIKE '%Parcel%';
-- Let's say it returns id = 6

-- Update polygon features to use this layer_id
UPDATE features
SET layer_id = 6  -- Use the actual layer_id from above
WHERE geometry->>'type' = 'Polygon'
  AND layer_id IS NULL OR layer_id = 0;  -- Adjust condition as needed

-- Verify
SELECT COUNT(*) FROM features WHERE layer_id = 6;
```

### Step 10: Refresh SurveyPro and Test

1. **Refresh the browser** (Ctrl+F5)
2. Go back to **Areas** page
3. **Polygon Layer dropdown** should now show:
   - "Avondale - Land Parcels" ✓
4. Select it and click **"Compute All Areas"**

---

## Quick Check: Verify Database State

### Check if polygons exist:
```sql
-- Count features by geometry type
SELECT 
  geometry->>'type' as geom_type,
  COUNT(*) as count
FROM features
GROUP BY geometry->>'type';

-- Expected:
-- geom_type | count
-- Point     | 50    (coordinate list)
-- Polygon   | 25    (land parcels)
```

### Check layers:
```sql
-- List all layers
SELECT id, name, geometry_type, srid
FROM layers
ORDER BY created_at DESC;

-- Expected:
-- id | name                                    | geometry_type | srid
-- 5  | Avondale - Coordinate List Points ...   | Point         | 22291
-- 6  | Avondale - Land Parcels                 | Polygon       | 22291
```

### Check if polygons are linked to a layer:
```sql
-- Count features per layer
SELECT 
  l.id as layer_id,
  l.name as layer_name,
  COUNT(f.id) as feature_count,
  f.geometry->>'type' as geom_type
FROM layers l
LEFT JOIN features f ON f.layer_id = l.id
GROUP BY l.id, l.name, f.geometry->>'type'
ORDER BY l.id;
```

---

## Alternative: Quick Test with Sample Data

If you want to test the batch computation immediately without QGIS:

### Create test polygon in database:

```sql
-- 1. Create polygon layer
INSERT INTO layers (project_id, name, geometry_type, srid, description)
VALUES (
  (SELECT id FROM projects WHERE name LIKE '%Avondale%' LIMIT 1),
  'Avondale - Test Parcels',
  'Polygon',
  22291,
  'Test polygons for batch computation'
)
RETURNING id;
-- Note the returned id (e.g., 7)

-- 2. Create a test polygon using existing coordinate points
-- Assuming you have points A, B, C, D in your coordinate list
INSERT INTO features (layer_id, project_id, geometry, properties)
VALUES (
  7,  -- Use the layer_id from above
  (SELECT id FROM projects WHERE name LIKE '%Avondale%' LIMIT 1),
  '{
    "type": "Polygon",
    "coordinates": [[
      [123.45, 678.90],
      [124.50, 679.20],
      [125.00, 680.00],
      [126.00, 681.00],
      [123.45, 678.90]
    ]]
  }'::jsonb,
  '{
    "designation": "Test Stand 001",
    "created_by": "manual_test"
  }'::jsonb
);

-- 3. Verify
SELECT 
  id,
  properties->>'designation' as designation,
  geometry->'coordinates'->0 as vertices
FROM features
WHERE layer_id = 7;
```

---

## Common Issues

### Issue 1: "No layers found" in dropdown
**Cause:** No polygon layers exist in database
**Solution:** Create layer record (see Step 8 above)

### Issue 2: Layer exists but shows 0 features
**Cause:** Polygons not linked to layer (wrong layer_id)
**Solution:** Update features.layer_id (see Step 9 above)

### Issue 3: Polygons exist but not in features table
**Cause:** Imported to wrong table
**Solution:** Re-import to `features` table or migrate data

### Issue 4: QGIS can't connect to database
**Cause:** Wrong credentials or PostgreSQL not running
**Solution:** 
- Check PostgreSQL is running: `pg_isready`
- Verify credentials in `.env` file
- Test connection: `psql -h localhost -U postgres -d surveypro`

---

## Summary Checklist

To get polygon layer showing in dropdown:

- [ ] Coordinate list exported to database (Layer 5) ✓ You have this
- [ ] QGIS connected to SurveyPro database
- [ ] Coordinate list loaded in QGIS with labels
- [ ] Snapping enabled (0.01m tolerance)
- [ ] Polygon layer created in QGIS
- [ ] Polygons digitized using coordinate points
- [ ] Polygons saved to database (features table)
- [ ] Layer record created in `layers` table
- [ ] Polygons linked to layer (correct layer_id)
- [ ] Browser refreshed
- [ ] Polygon layer appears in dropdown ✓

---

## Next Steps

1. **Follow Step 2-9 above** to create polygon layer in QGIS
2. **Or use SQL test data** to verify batch computation works
3. **Refresh browser** and check dropdown
4. **Select both layers** and click "Compute All Areas"
5. **Verify results** show computed areas

Once you have polygons in the database with a proper layer record, they'll appear in the dropdown!

Need help with any specific step? Let me know!
