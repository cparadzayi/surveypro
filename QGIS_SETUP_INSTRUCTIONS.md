# QGIS Setup Instructions - Schema-Per-Surveyor

## Prerequisites
✅ Coordinate swap fix installed (run `fix_qgis_coordinates_schema_aware.sql` first)
✅ Parcels deleted from database
✅ QGIS Desktop installed

## Step 1: Install Coordinate Swap Fix

Run this SQL script in your PostgreSQL client:
```bash
psql -U postgres -d surveypro -f app-backend/fix_qgis_coordinates_schema_aware.sql
```

This will:
- Create the auto-fix function
- Apply triggers to ALL surveyor schemas
- Verify installation

## Step 2: Connect QGIS to Your Surveyor Schema

### 2.1 Open QGIS
Launch QGIS Desktop

### 2.2 Add PostGIS Connection
1. **Layer** → **Add Layer** → **Add PostGIS Layers**
2. Click **"New"** to create a new connection

### 2.3 Connection Settings
```
Name: SurveyPro - Kuda Makonese
Host: localhost (or your database host)
Port: 5432
Database: surveypro
```

**Authentication:**
- **Username**: postgres (or your DB user)
- **Password**: [your password]

**Advanced Settings (IMPORTANT):**
- Click **"Also list tables with no geometry"**: ✅ Check
- Click **"Only show layers in the layer registries"**: ❌ Uncheck

### 2.4 Set Search Path (Schema)
In the connection settings, go to **"PostgreSQL"** tab:
- **Schema**: `surveyor_kuda_makonese` (or your surveyor schema name)

Click **"Test Connection"** → Should show "Connection successful"

Click **"OK"** to save

## Step 3: Add Land Parcels Layer

1. In the **Add PostGIS Layers** dialog, click **"Connect"**
2. Expand your connection
3. Find and select: `surveyor_kuda_makonese.land_parcels`
4. **IMPORTANT**: Set **Primary Key** to `id`
5. Click **"Add"**

## Step 4: Configure Layer for Digitizing

### 4.1 Set CRS
1. Right-click layer → **Properties**
2. Go to **"Source"** tab
3. Verify **CRS**: `EPSG:22291 - Cape Lo 31`
4. If not set, click **"Select CRS"** and search for `22291`

### 4.2 Enable Editing
1. Right-click layer → **Toggle Editing** (or press `Ctrl+E`)
2. Layer should now be editable (pencil icon appears)

### 4.3 Set Snapping (Optional but Recommended)
1. **Project** → **Snapping Options**
2. Enable snapping for `land_parcels` layer
3. Set tolerance: `5 meters`
4. Mode: **Vertex and Segment**

## Step 5: Digitize Parcels

### 5.1 Start Digitizing
1. Click **"Add Polygon Feature"** button (or press `Ctrl+.`)
2. Click to add vertices for your parcel boundary
3. Right-click to finish the polygon

### 5.2 Enter Attributes
When you finish the polygon, a form will appear:
- **stand**: Enter parcel number (e.g., "2283", "Outside Figure")
- **designation**: Optional description
- **project_id**: Enter your project ID (e.g., `6`)
- Leave other fields empty (they'll be auto-calculated)

### 5.3 Save
1. Click **"Save Layer Edits"** (or press `Ctrl+S`)
2. **Check PostgreSQL logs** - you should see:
   ```
   [QGIS Fix] ✅ Coordinates fixed automatically
   ```
   (Only if coordinates were swapped - otherwise silent success)

## Step 6: Verify Coordinates

### 6.1 In QGIS
1. Open **Attribute Table** (right-click layer → **Open Attribute Table**)
2. Check `area_m2` - should be auto-calculated
3. Coordinates should look correct on the map

### 6.2 In Database (Optional)
Run this query to verify:
```sql
SELECT 
  stand,
  ST_X(ST_Centroid(geom)) as first_ordinate,
  ST_Y(ST_Centroid(geom)) as second_ordinate,
  area_m2,
  CASE 
    WHEN ST_X(ST_Centroid(geom)) < 200000 AND ST_Y(ST_Centroid(geom)) > 1000000
    THEN '✅ CORRECT'
    ELSE '❌ SWAPPED'
  END as status
FROM surveyor_kuda_makonese.land_parcels
ORDER BY id DESC
LIMIT 5;
```

Expected values:
- `first_ordinate`: ~97,000 (Westing)
- `second_ordinate`: ~2,247,000 (Southing)

## Step 7: View in Frontend

1. Open SurveyPro frontend
2. Navigate to **Area Computation** step
3. Your QGIS-digitized parcels should appear on the map
4. Coordinates should match frontend-digitized parcels exactly

## Troubleshooting

### Issue: Coordinates Still Swapped
**Solution**: 
1. Check trigger is installed: Run diagnostic query from `fix_qgis_coordinates_schema_aware.sql`
2. Re-run the fix script
3. Delete and re-digitize the parcel

### Issue: "No Primary Key" Error
**Solution**: 
1. When adding layer, manually set Primary Key to `id`
2. Or add in layer properties: **Source** → **Primary Key** → `id`

### Issue: Can't See Layer
**Solution**:
1. Verify schema name is correct
2. Check connection settings include schema in search path
3. Refresh connection in QGIS

### Issue: Area Not Calculating
**Solution**:
1. Verify SRID is 22291 (not 4326 or other)
2. Check `area_m2` column exists and is a GENERATED column
3. Re-save the layer

## Best Practices

1. **Always set project_id** when digitizing
2. **Use meaningful stand names** (e.g., "2283", "Outside Figure")
3. **Save frequently** (Ctrl+S)
4. **Check PostgreSQL logs** for coordinate swap notices
5. **Verify in frontend** after digitizing

## Schema-Specific Notes

Your surveyor schema: `surveyor_kuda_makonese`
- All parcels saved here are isolated from other surveyors
- Coordinate swap fix is active
- Frontend automatically loads from your schema when you're logged in

## Summary

✅ Coordinate swap fix installed
✅ QGIS connected to your surveyor schema
✅ Layer configured with EPSG:22291
✅ Ready to digitize parcels
✅ Coordinates will be automatically corrected
✅ Frontend will display parcels correctly

**You're all set! Start digitizing in QGIS.**
