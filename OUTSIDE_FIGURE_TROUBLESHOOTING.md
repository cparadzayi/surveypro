# Outside Figure Data Block - Troubleshooting Guide

## Problem: Outside Figure Data block not showing in Survey Plan

### Step 1: Check Browser Console

Open the Survey Plan view and check the browser console (F12) for these messages:

**Expected messages if working:**
```
[SurveyPlanMap] 🔍 Checking for Outside Figure parcel...
[SurveyPlanMap] 🔍 Total parcels loaded: 3
[SurveyPlanMap] 🔍 All parcel designations/stands:
  1. stand="1463", designation="null", isOutsideFigure=undefined
  2. stand="1464", designation="null", isOutsideFigure=undefined
  3. stand="Outside Figure Data", designation="null", isOutsideFigure=undefined
[SurveyPlanMap] 📐 Outside Figure parcel found: Outside Figure Data
[SurveyPlanMap] 📐 Edges: 4 Points: 4
```

**Common error messages:**

#### Error 1: "No Outside Figure parcel found"
```
[SurveyPlanMap] ⚠️ No Outside Figure parcel found
[SurveyPlanMap] 💡 Make sure parcel has "Outside Figure" in designation or stand field
```

**Solution:** Your parcel name doesn't contain "Outside Figure". 

**Fix Options:**
1. **Rename in Area Computation:** Go back to Area Computation step and rename the parcel
2. **Update in database:** Run this SQL:
   ```sql
   UPDATE land_parcels 
   SET stand = 'Outside Figure Data' 
   WHERE id = YOUR_PARCEL_ID;
   ```
3. **Set metadata flag:**
   ```sql
   UPDATE land_parcels 
   SET metadata = jsonb_set(
     COALESCE(metadata, '{}'::jsonb), 
     '{isOutsideFigure}', 
     'true'::jsonb
   )
   WHERE id = YOUR_PARCEL_ID;
   ```

#### Error 2: "Outside Figure parcel found but no edge data"
```
[SurveyPlanMap] ⚠️ Outside Figure parcel found but no edge data in metadata.residuals.edges
```

**Solution:** The parcel exists but doesn't have traverse data.

**Cause:** Parcel was created in QGIS instead of Area Computation view.

**Fix:** The parcel must be created/saved through the **Area Computation** step (Step 5) which automatically generates:
- `metadata.residuals.edges` (traverse data)
- `metadata.cape_lo_points` (point coordinates)

**To fix existing parcel:**
1. Go to Area Computation (Step 5)
2. Digitize the Outside Figure polygon again
3. Set designation/stand to "Outside Figure Data"
4. Save - this will populate the metadata

---

### Step 2: Check Database

Run the diagnostic query:

```bash
psql -U postgres -d surveypro_v1 -f CHECK_OUTSIDE_FIGURE.sql
```

**Expected output:**
```
 id  | project_id |       stand        | designation | area_m2  | area_ha | is_outside_figure_flag | edge_count | point_count | has_edges | has_points
-----+------------+--------------------+-------------+----------+---------+------------------------+------------+-------------+-----------+------------
 123 |          5 | Outside Figure Data|             | 12345.67 |  1.2346 |                        |          4 |           4 | t         | t
```

**Check these columns:**
- ✅ `edge_count` should be > 0 (number of sides)
- ✅ `point_count` should be > 0 (number of vertices)
- ✅ `has_edges` should be `t` (true)
- ✅ `has_points` should be `t` (true)

**If any are false/0:**
The parcel metadata is incomplete. Recreate in Area Computation.

---

### Step 3: Check Metadata Structure

Run this query to see the actual metadata:

```sql
SELECT 
  id,
  stand,
  jsonb_pretty(metadata->'residuals'->'edges') as edges_data,
  jsonb_pretty(metadata->'cape_lo_points') as points_data
FROM land_parcels
WHERE stand LIKE '%Outside Figure%'
LIMIT 1;
```

**Expected structure:**

**edges_data:**
```json
[
  {
    "dy": -234.56,
    "dx": 401.23,
    "bearing": 300.794,
    "distance": 466.14
  },
  {
    "dy": 162.45,
    "dx": 166.78,
    "bearing": 45.533,
    "distance": 232.21
  }
]
```

**points_data:**
```json
[
  {
    "id": "M8",
    "x": 2247514.30,
    "y": 96857.81
  },
  {
    "id": "2836B",
    "x": 2247752.93,
    "y": 96457.39
  }
]
```

**If metadata is null or wrong structure:**
Parcel was not created through Area Computation. Must recreate.

---

### Step 4: Check Toggle Setting

In the Survey Plan configuration panel:

1. Look for **Display Options** section
2. Check the checkbox: ☑ **Show Outside Figure Data**
3. If it shows "(No data)" next to it, the parcel is not detected

---

### Step 5: Verify Workflow

**Correct workflow:**

1. **Import CSV** → Load coordinate points
2. **Field Book** → Generate field book
3. **Calculations Part 1** → Adjust coordinates
4. **Coordinate List** → Generate coordinate list
5. **Area Computation** → ⭐ **CREATE OUTSIDE FIGURE PARCEL HERE**
   - Click points to digitize polygon
   - Set designation/stand to "Outside Figure Data"
   - Click "Save Parcel"
   - Verify metadata is saved
6. **Survey Plan** → View Outside Figure Data block

**Common mistake:** Creating parcel in QGIS instead of Area Computation view.

---

### Step 6: Manual Metadata Fix (Advanced)

If you have a QGIS parcel and want to add metadata manually:

```sql
-- 1. Get the parcel geometry vertices
SELECT ST_AsText(geom) FROM land_parcels WHERE stand = 'Outside Figure Data';

-- 2. Manually construct metadata (replace with your actual values)
UPDATE land_parcels
SET metadata = jsonb_build_object(
  'cape_lo_points', jsonb_build_array(
    jsonb_build_object('id', 'M8', 'y', 96857.81, 'x', 2247514.30),
    jsonb_build_object('id', '2836B', 'y', 96457.39, 'x', 2247752.93),
    jsonb_build_object('id', '1463C', 'y', 96623.10, 'x', 2247915.60),
    jsonb_build_object('id', '1464C', 'y', 97023.52, 'x', 2247677.97)
  ),
  'residuals', jsonb_build_object(
    'edges', jsonb_build_array(
      jsonb_build_object('distance', 466.14, 'bearing', 300.794, 'dy', -234.56, 'dx', 401.23),
      jsonb_build_object('distance', 232.21, 'bearing', 45.533, 'dy', 162.45, 'dx', 166.78),
      jsonb_build_object('distance', 466.14, 'bearing', 120.794, 'dy', 234.56, 'dx', -401.23),
      jsonb_build_object('distance', 232.21, 'bearing', 225.533, 'dy', -162.45, 'dx', -166.78)
    )
  ),
  'isOutsideFigure', true
)
WHERE stand = 'Outside Figure Data';
```

**Note:** This is tedious and error-prone. Better to recreate in Area Computation.

---

## Quick Checklist

- [ ] Parcel name contains "Outside Figure" (case-insensitive)
- [ ] Parcel created in **Area Computation** step (not QGIS)
- [ ] `metadata.residuals.edges` exists and has data
- [ ] `metadata.cape_lo_points` exists and has data
- [ ] Toggle "Show Outside Figure Data" is checked
- [ ] Browser console shows parcel found message
- [ ] No console errors

---

## Still Not Working?

**Check these:**

1. **Project ID mismatch:** Ensure Survey Plan is loading parcels from the correct project
2. **Cache issue:** Hard refresh browser (Ctrl+Shift+R)
3. **API error:** Check Network tab in browser DevTools for failed requests
4. **Vue reactivity:** Check if `parcels.value` is populated in Vue DevTools

**Get help:**
Share the browser console output and database query results.
