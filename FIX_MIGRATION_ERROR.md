# Fix Migration Error - Column Mismatch

## Problem

The `migrate_surveyor_to_schema()` function failed with:
```
ERROR: column "metadata" does not exist
```

## Root Cause

The migration function (from 040_schema_per_surveyor.sql) tries to copy columns that don't exist in the actual `public.survey_projects` table:

**Function expects:**
- metadata (JSONB) - ❌ **DOESN'T EXIST**

**Actual table has:**
- workflow_state (JSONB) ✅
- last_used (TIMESTAMP) ✅
- stand_reference (VARCHAR) ✅  
- township (VARCHAR) ✅

## Solution

Created Migration 042 that fixes the function to match actual table structure.

### Apply the Fix

```bash
cd c:/mataranyika/SurveyPro-nov-alpha/app-backend
psql -U postgres -d surveypro_db -f migrations/042.do.sql
```

This will:
1. Drop the broken `migrate_surveyor_to_schema` function
2. Recreate it with correct columns
3. Include ALL actual columns from your tables

### Retry Migration

After applying the fix, retry the migration:

```bash
psql -U postgres -d surveypro_db -c "SELECT migrate_surveyor_to_schema(2);"
```

**Expected output:**
```
                    migrate_surveyor_to_schema
------------------------------------------------------------------------
 Successfully migrated surveyor kuziva_paradzayi (ID: 2) to schema surveyor_kuziva_paradzayi
(1 row)
```

### Verify Migration Success

```bash
# Check your schema has the data
psql -U postgres -d surveypro_db -c "SELECT COUNT(*) FROM surveyor_kuziva_paradzayi.coordinate_points;"

# Should show: 540
```

```bash
# Check survey projects migrated
psql -U postgres -d surveypro_db -c "SELECT COUNT(*) FROM surveyor_kuziva_paradzayi.survey_projects;"

# Should show: 1
```

```bash
# Check workflow states migrated  
psql -U postgres -d surveypro_db -c "SELECT COUNT(*) FROM surveyor_kuziva_paradzayi.workflow_states;"

# Should show: 1
```

## What Gets Migrated

✅ **survey_projects** - Your project (maglas2283)
✅ **coordinate_points** - Your 540 points
✅ **land_parcels** - Any digitized parcels
✅ **workflow_states** - Your workflow data with imported points

## After Successful Migration

Your data will be in:
- ❌ ~~`public.coordinate_points`~~ (old location)
- ✅ `surveyor_kuziva_paradzayi.coordinate_points` (new location)

Backend will automatically use the surveyor schema when you make requests.

## Rollback (if needed)

If something goes wrong, you can rollback:

```bash
# Restore to using public schema
psql -U postgres -d surveypro_db -c "UPDATE surveyor_profiles SET schema_name = NULL WHERE id = 2;"

# Your data is still in public schema as backup
```

---

**Run Migration 042 now to fix the error!**
