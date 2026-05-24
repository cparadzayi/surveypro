# QGIS Generated Columns Configuration

## Problem
QGIS tries to insert values into `GENERATED ALWAYS` columns, causing this error:
```
ERROR: cannot insert a non-DEFAULT value into column "area_m2"
DETAIL: Column "area_m2" is a generated column.
```

## Root Cause
After migration 051, `area_m2`, `area_ha`, and `perimeter_m` are now `GENERATED ALWAYS` columns (auto-calculated by PostgreSQL). QGIS doesn't automatically detect this and tries to insert NULL or 0 values, which PostgreSQL rejects.

## Solution Options

### Option 1: Configure QGIS Layer (Recommended)

#### Step 1: Open Layer Properties
1. Right-click on `land_parcels` layer in QGIS
2. Select **Properties**
3. Go to **Attributes Form** tab

#### Step 2: Set Generated Columns to "Hidden"
For each of these fields:
- `area_m2`
- `area_ha`
- `perimeter_m`

Do the following:
1. Click on the field name in the list
2. In the right panel, find **Widget Type**
3. Change from "Text Edit" to **"Hidden"**
4. Click **OK**

#### Step 3: Verify Configuration
1. Start editing the layer (pencil icon)
2. Click "Add Polygon Feature"
3. Draw a polygon
4. In the attribute form that appears, you should NOT see `area_m2`, `area_ha`, or `perimeter_m` fields
5. Fill in required fields (stand, project_id, etc.)
6. Click OK
7. Save edits (💾 icon)

✅ The parcel should save successfully, and areas will be auto-calculated by PostgreSQL!

---

### Option 2: Create a QGIS View (Alternative)

If Option 1 doesn't work, create a database view that excludes generated columns for editing:

```sql
-- Run this in your surveyor schema
CREATE OR REPLACE VIEW land_parcels_edit AS
SELECT 
  id,
  project_id,
  stand,
  designation,
  owner,
  title_deed,
  survey_date,
  surveyor,
  notes,
  centroid_y,
  centroid_x,
  closure_error_m,
  closure_ratio,
  area_calculated,
  calculation_data,
  status,
  digitized_by,
  finalized_at,
  geom,
  metadata,
  created_at,
  updated_at
  -- NOTE: area_m2, area_ha, perimeter_m are excluded
FROM land_parcels;

-- Make view editable
CREATE OR REPLACE RULE land_parcels_edit_insert AS
ON INSERT TO land_parcels_edit
DO INSTEAD
INSERT INTO land_parcels (
  project_id, stand, designation, owner, title_deed, survey_date, 
  surveyor, notes, centroid_y, centroid_x, closure_error_m, 
  closure_ratio, area_calculated, calculation_data, status, 
  digitized_by, finalized_at, geom, metadata
)
VALUES (
  NEW.project_id, NEW.stand, NEW.designation, NEW.owner, NEW.title_deed, 
  NEW.survey_date, NEW.surveyor, NEW.notes, NEW.centroid_y, NEW.centroid_x, 
  NEW.closure_error_m, NEW.closure_ratio, NEW.area_calculated, 
  NEW.calculation_data, NEW.status, NEW.digitized_by, NEW.finalized_at, 
  NEW.geom, NEW.metadata
)
RETURNING *;

CREATE OR REPLACE RULE land_parcels_edit_update AS
ON UPDATE TO land_parcels_edit
DO INSTEAD
UPDATE land_parcels
SET
  project_id = NEW.project_id,
  stand = NEW.stand,
  designation = NEW.designation,
  owner = NEW.owner,
  title_deed = NEW.title_deed,
  survey_date = NEW.survey_date,
  surveyor = NEW.surveyor,
  notes = NEW.notes,
  centroid_y = NEW.centroid_y,
  centroid_x = NEW.centroid_x,
  closure_error_m = NEW.closure_error_m,
  closure_ratio = NEW.closure_ratio,
  area_calculated = NEW.area_calculated,
  calculation_data = NEW.calculation_data,
  status = NEW.status,
  digitized_by = NEW.digitized_by,
  finalized_at = NEW.finalized_at,
  geom = NEW.geom,
  metadata = NEW.metadata,
  updated_at = NOW()
WHERE id = OLD.id
RETURNING *;

CREATE OR REPLACE RULE land_parcels_edit_delete AS
ON DELETE TO land_parcels_edit
DO INSTEAD
DELETE FROM land_parcels
WHERE id = OLD.id
RETURNING *;
```

Then in QGIS:
1. Remove the `land_parcels` layer
2. Add `land_parcels_edit` view instead
3. Use this view for digitizing

---

### Option 3: Update QGIS Default Values (Quick Fix)

1. Right-click `land_parcels` layer → **Properties**
2. Go to **Attributes Form** tab
3. For each generated column (`area_m2`, `area_ha`, `perimeter_m`):
   - Click the field
   - Check **"Apply default value on update"**
   - Set **Default value** to: `NULL`
   - Uncheck **"Editable"**
4. Click **OK**

---

## Verification

After applying any solution, test with a simple polygon:

```sql
-- In your surveyor schema
SET search_path = surveyor_YOUR_USERNAME, public;

-- Insert test parcel (without area columns)
INSERT INTO land_parcels (project_id, stand, geom)
VALUES (
  1,
  'Test Stand QGIS',
  ST_GeomFromText('POLYGON((0 0, 100 0, 100 100, 0 100, 0 0))', 22291)
);

-- Verify areas are auto-calculated
SELECT 
  stand,
  ROUND(area_m2::numeric, 2) as area_m2,
  ROUND(area_ha::numeric, 4) as area_ha,
  ROUND(perimeter_m::numeric, 2) as perimeter_m
FROM land_parcels
WHERE stand = 'Test Stand QGIS';

-- Expected result:
-- stand: Test Stand QGIS
-- area_m2: 10000.00
-- area_ha: 1.0000
-- perimeter_m: 400.00
```

---

## Why This Happens

**PostgreSQL `GENERATED ALWAYS` columns:**
- ✅ Auto-calculated from other columns
- ✅ Always in sync with geometry
- ❌ Cannot be inserted or updated manually
- ❌ Must be excluded from INSERT/UPDATE statements

**QGIS behavior:**
- Reads all columns from table schema
- Tries to insert values for all columns (even NULL)
- Doesn't automatically detect `GENERATED ALWAYS` constraint
- Needs manual configuration to exclude these columns

---

## Recommended Workflow

1. ✅ Use **Option 1** (Hidden fields) - Simplest, no database changes
2. ✅ If that fails, use **Option 2** (View) - More robust, better for teams
3. ✅ After saving in QGIS, refresh layer to see calculated areas
4. ✅ Areas will appear automatically in QGIS attribute table

---

## Troubleshooting

### If areas still show as NULL in QGIS:
1. Right-click layer → **Refresh**
2. Or close and re-add the layer
3. Check PostgreSQL: `SELECT area_m2 FROM land_parcels WHERE id = X;`

### If QGIS still tries to insert into generated columns:
1. Check QGIS version (3.28+ recommended)
2. Try Option 2 (view-based approach)
3. Check layer is in edit mode when configuring

### If you need to edit areas manually (not recommended):
```sql
-- Temporarily drop generated columns
ALTER TABLE land_parcels 
  DROP COLUMN area_m2,
  DROP COLUMN area_ha,
  DROP COLUMN perimeter_m;

-- Add regular columns
ALTER TABLE land_parcels
  ADD COLUMN area_m2 NUMERIC(12, 2),
  ADD COLUMN area_ha NUMERIC(12, 4),
  ADD COLUMN perimeter_m NUMERIC(12, 2);

-- But then you lose auto-calculation! Not recommended.
```

---

## Summary

✅ **Problem:** QGIS inserting into generated columns
✅ **Solution:** Configure QGIS to hide/exclude those columns
✅ **Result:** Parcels save successfully, areas auto-calculate
✅ **Benefit:** No manual area calculation needed!

**Next Steps:**
1. Apply Option 1 configuration in QGIS
2. Test by digitizing a polygon
3. Verify areas appear after refresh
4. Document this setup for your team
