# Fix: Land Parcels Area Columns Error

## Problem

When generating the Coordinate List or calculating parcel areas, you're seeing HTTP 500 errors:

```
column "area_m2" of relation "land_parcels" does not exist
```

## Root Cause

1. **Migration 073** removed `area_m2`, `area_ha`, and `perimeter_m` as generated columns for QGIS compatibility
2. **Migration 079** added them back as generated columns when creating new surveyor schemas
3. Backend code tries to **write** to these columns, but generated columns are read-only
4. This creates an inconsistency between schemas

## Solution

Run the fix script to add these columns as regular (non-generated) NUMERIC columns that the backend can write to:

```bash
cd app-backend
psql -U postgres -d surveypro_db -f FIX_AREA_COLUMNS.sql
```

## What the Fix Does

1. **Public schema**: Adds missing columns if they don't exist
2. **Surveyor schemas**: 
   - Drops generated columns (if present)
   - Adds regular NUMERIC columns
3. **Result**: Backend can compute and store area values explicitly

## After Running the Fix

1. **Restart your backend server**
2. **Try generating Coordinate List again** - should work now
3. **Area calculations** will work correctly
4. **QGIS** can still load and edit the `land_parcels` table

## Technical Details

### Before (Generated Columns - Read-Only)
```sql
area_m2 NUMERIC(12, 2) GENERATED ALWAYS AS (ST_Area(geom)) STORED
```

### After (Regular Columns - Writable)
```sql
area_m2 NUMERIC(12, 2)
```

Backend computes: `area_m2 = ST_Area(geom)` and stores it explicitly.

## Files Modified

- `migrations/080_add_area_columns.sql` - New migration
- `migrations/080_undo.sql` - Rollback script
- `migrations/079.do.sql` - Updated to use regular columns for new schemas
- `FIX_AREA_COLUMNS.sql` - Quick fix script (this is what you run)

## Verification

After running the fix and restarting the backend:

1. Navigate to **Coordinate List** step
2. Click **Generate Coordinate List**
3. Should complete without errors
4. Check console - no HTTP 500 errors

## Questions?

If you still see errors after running this fix, check:
- Backend server was restarted
- Database connection is working
- Check backend logs for any other errors
