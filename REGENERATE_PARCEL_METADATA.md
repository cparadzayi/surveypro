# Fix Outside Figure Metadata Issue

## Problem
Your Outside Figure parcel is missing the traverse metadata (`metadata.residuals.edges`) that's required for the Survey Plan UI to display the Outside Figure data table and filter beacons.

## Console Evidence
```
[SurveyPlanMap] ⚠️ Outside Figure parcel found but no edge data in metadata.residuals.edges
```

## Root Cause
When you digitize parcels in QGIS, the geometry is saved but the traverse metadata (edges, bearings, distances, points) needs to be generated from that geometry. This metadata is what the Survey Plan UI uses to:
1. Display the Outside Figure traverse table
2. Calculate the extent for beacon filtering
3. Pass edge data to the PDF export

## Solution Options

### Option 1: Run SQL Script (Recommended)
Execute the `FIX_OUTSIDE_FIGURE_METADATA.sql` script in your PostgreSQL database:

```bash
psql -U postgres -d surveypro_v1 -f FIX_OUTSIDE_FIGURE_METADATA.sql
```

This will:
1. Find your Outside Figure parcel (project_id=5)
2. Generate metadata from its geometry
3. Populate `metadata.residuals.edges` and `metadata.cape_lo_points`
4. Show verification results

### Option 2: Use PostgreSQL Function Directly
Connect to your database and run:

```sql
-- For a specific parcel ID (e.g., 53 based on your console logs)
SELECT generate_parcel_metadata(53);

-- Update the parcel with generated metadata
UPDATE land_parcels
SET metadata = COALESCE(metadata, '{}'::jsonb) || generate_parcel_metadata(53)
WHERE id = 53;
```

### Option 3: Regenerate All Missing Metadata
If you have multiple parcels missing metadata:

```sql
-- Regenerate metadata for all parcels in project 5
SELECT update_parcels_with_missing_metadata(5);
```

## What the Metadata Contains

After running the fix, your Outside Figure parcel will have:

```json
{
  "residuals": {
    "edges": [
      {
        "distance": 123.45,
        "bearing": 45.5,
        "dY": 87.23,
        "dX": 89.12
      },
      // ... more edges
    ]
  },
  "cape_lo_points": [
    {
      "id": "2283A",
      "name": "2283A",
      "y": 2247854.388,
      "x": 97057.022
    },
    // ... more points
  ]
}
```

## Verification

After running the fix, refresh your Survey Plan page. You should see:

1. **Console logs:**
   ```
   [SurveyPlanMap] 📐 Outside Figure parcel found: Outside Figure Data
   [SurveyPlanMap] 📐 Edges: 41 Points: 41
   ```

2. **UI changes:**
   - Outside Figure traverse table appears in the overlay
   - Beacon filtering works correctly
   - PDF export includes Outside Figure data

## Why This Happens

The `generate_parcel_metadata()` function:
1. Extracts vertices from the PostGIS geometry
2. Matches each vertex to the nearest coordinate point (within 0.5m)
3. Calculates distances and bearings between consecutive points
4. Stores everything in the `metadata` JSONB field

This is normally triggered automatically, but if you:
- Imported the parcel before the trigger was set up
- Manually inserted geometry without metadata
- Have an older database schema

...then you need to manually regenerate it.

## Prevention

To prevent this in the future, ensure the trigger is active:

```sql
-- Check if trigger exists
SELECT tgname, tgenabled 
FROM pg_trigger 
WHERE tgrelid = 'land_parcels'::regclass;

-- If missing, create it
CREATE TRIGGER auto_generate_metadata
BEFORE INSERT OR UPDATE ON land_parcels
FOR EACH ROW
EXECUTE FUNCTION trigger_generate_parcel_metadata();
```

## Next Steps

1. Run the SQL fix script
2. Refresh your browser (Ctrl+F5)
3. Check console for successful Outside Figure detection
4. Verify the Outside Figure table appears in the UI
5. Test PDF export

---

**Files:**
- Fix script: `FIX_OUTSIDE_FIGURE_METADATA.sql`
- Migration: `app-backend/migrations/057_generate_metadata_from_geometry.sql`
