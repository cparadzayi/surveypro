# Schema-Aware PostGIS Migration Setup Guide

## Quick Start (3 Commands)

```bash
cd app-backend

# Step 1: Run migration (creates functions and schema_name column)
npm run migrate

# Step 2: Set up schemas for existing surveyors
npm run setup:schemas

# Step 3: Verify setup
npm run check:user
```

**Done!** 🎉 Your database is now ready for schema-aware PostGIS exports.

---

## What Just Happened?

### Step 1: Migration (040.do.sql)

The migration script:
- ✅ Added `schema_name` column to `surveyor_profiles`
- ✅ Created `generate_schema_name()` function
- ✅ Created `create_surveyor_schema()` function
- ✅ Created `drop_surveyor_schema()` function
- ✅ Created `admin.surveyor_schemas` view
- ✅ Created `admin.schema_storage` view

### Step 2: Schema Setup Script

The setup script:
- ✅ Lists all surveyors in database
- ✅ Creates schema for each surveyor (e.g., `surveyor_elon_paradza`)
- ✅ Creates tables: `survey_projects`, `coordinate_points`, `land_parcels`
- ✅ Updates `surveyor_profiles.schema_name`
- ✅ Verifies table creation
- ✅ Shows summary with table counts

### Step 3: Verification

Check if everything is set up correctly.

---

## Expected Output

### Step 1: npm run migrate

```
Running migrations...
✓ Migrations tracking table ready
✓ Found 39 previously applied migrations
→ Applying migration: 040.do.sql
✓ Applied 040.do.sql
✓ Successfully applied 1 new migration(s)
```

### Step 2: npm run setup:schemas

```
🚀 Setting up surveyor schemas...

Found 2 surveyor(s)

Surveyors:
────────────────────────────────────────────────────────────────────────────────
1. Elon Paradza (elon.paradza@example.com) - ⏳ No schema
2. Jane Smith (jane.smith@example.com) - ⏳ No schema
────────────────────────────────────────────────────────────────────────────────

Creating schemas for 2 surveyor(s)...

Processing: Elon Paradza (elon.paradza@example.com)
  ✓ Created schema: surveyor_elon_paradza
  ✓ Updated profile with schema name
  ✓ Verified 3 table(s) created
  ✅ Success!

Processing: Jane Smith (jane.smith@example.com)
  ✓ Created schema: surveyor_jane_smith
  ✓ Updated profile with schema name
  ✓ Verified 3 table(s) created
  ✅ Success!

════════════════════════════════════════════════════════════════════════════════
SUMMARY
════════════════════════════════════════════════════════════════════════════════
✅ Successful: 2
❌ Failed: 0
📊 Total: 2

All Surveyor Schemas:
────────────────────────────────────────────────────────────────────────────────
1. Elon Paradza → surveyor_elon_paradza (3 tables)
2. Jane Smith → surveyor_jane_smith (3 tables)
────────────────────────────────────────────────────────────────────────────────

✅ Setup complete! Next steps:
   1. Test PostGIS export with a surveyor account
   2. Verify data goes to surveyor schema (not public)
   3. Check QGIS connection with surveyor schema

To verify a specific schema:
   SELECT * FROM surveyor_elon_paradza.coordinate_points;
   SELECT * FROM surveyor_elon_paradza.land_parcels;
```

---

## Manual Verification (Optional)

### Check Schema Creation

```sql
-- List all surveyor schemas
SELECT nspname 
FROM pg_namespace 
WHERE nspname LIKE 'surveyor_%'
ORDER BY nspname;

-- Expected: surveyor_elon_paradza, surveyor_jane_smith, etc.
```

### Check Surveyor Profiles

```sql
-- View surveyor schemas
SELECT * FROM admin.surveyor_schemas;

-- Expected:
-- surveyor_id | email                  | full_name     | schema_name            | table_count
-- 1           | elon.paradza@ex...    | Elon Paradza  | surveyor_elon_paradza  | 3
-- 2           | jane.smith@exa...     | Jane Smith    | surveyor_jane_smith    | 3
```

### Check Tables in Schema

```sql
-- List tables in a surveyor schema
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'surveyor_elon_paradza'
ORDER BY table_name;

-- Expected: coordinate_points, land_parcels, survey_projects
```

### Test Schema-Aware Query

```sql
-- Set search path to surveyor schema
SET search_path = surveyor_elon_paradza, public;

-- Query should now use surveyor's tables
SELECT COUNT(*) FROM coordinate_points;
SELECT COUNT(*) FROM land_parcels;
```

---

## Testing PostGIS Export

### 1. Login as Surveyor

Login to SurveyPro as `elon.paradza@example.com`

### 2. Import Coordinates

- Navigate to Cadastral Standard workflow
- Import CSV with coordinates (~100-500 points)
- Complete steps 1-4

### 3. Export to PostGIS

Click "Export to PostGIS Database" button

### 4. Verify in Database

```sql
-- Check surveyor schema (should have points)
SELECT COUNT(*) FROM surveyor_elon_paradza.coordinate_points;
-- Expected: Number of points you exported ✅

-- Check public schema (should be empty)
SELECT COUNT(*) FROM public.coordinate_points WHERE project_id = YOUR_PROJECT_ID;
-- Expected: 0 ✅
```

### 5. Test QGIS Connection

- Click "Open QGIS Manager"
- Note the schema name: `surveyor_elon_paradza`
- Connect QGIS to database
- Add layer: `surveyor_elon_paradza.coordinate_points`
- Verify points appear on map ✅

---

## Troubleshooting

### Error: "relation 'surveyor_profiles' does not exist"

**Cause:** Database table name might be different

**Fix:** Check actual table name
```sql
SELECT tablename FROM pg_tables WHERE tablename LIKE '%surveyor%';
```

Update setup script if needed.

### Error: "Migration 040 already applied"

**Cause:** Migration already ran (this is normal if re-running)

**Fix:** Skip to step 2 (npm run setup:schemas)

### Error: "function create_surveyor_schema does not exist"

**Cause:** Migration didn't run successfully

**Fix:** 
```bash
# Check migration history
psql -U postgres -d surveypro_v1 -c "SELECT * FROM migrations_history ORDER BY applied_at DESC LIMIT 5;"

# If 040.do.sql is missing, run manually:
psql -U postgres -d surveypro_v1 -f migrations/040.do.sql
```

### Error: "No surveyors found in database"

**Cause:** No surveyor profiles exist yet

**Fix:** Create a surveyor profile first:
1. Register a new user in the app
2. Complete surveyor profile
3. Re-run setup:schemas

### Schema created but tables empty

**Cause:** This is expected! New schemas start empty.

**Fix:** This is correct. Tables will populate when user exports data.

---

## Rollback (If Needed)

### Remove Schemas (DANGER - Deletes Data!)

```sql
-- List schemas to remove
SELECT nspname FROM pg_namespace WHERE nspname LIKE 'surveyor_%';

-- Drop specific schema (replace with actual name)
DROP SCHEMA IF EXISTS surveyor_elon_paradza CASCADE;

-- Clear schema_name from profiles
UPDATE surveyor_profiles SET schema_name = NULL;
```

### Undo Migration

```bash
cd app-backend
psql -U postgres -d surveypro_db -c "DELETE FROM migrations_history WHERE migration_name = '040.do.sql';"
psql -U postgres -d surveypro_db -c "ALTER TABLE surveyor_profiles DROP COLUMN IF EXISTS schema_name;"
psql -U postgres -d surveypro_db -c "DROP FUNCTION IF EXISTS create_surveyor_schema CASCADE;"
psql -U postgres -d surveypro_db -c "DROP FUNCTION IF EXISTS generate_schema_name CASCADE;"
psql -U postgres -d surveypro_db -c "DROP FUNCTION IF EXISTS drop_surveyor_schema CASCADE;"
psql -U postgres -d surveypro_db -c "DROP VIEW IF EXISTS admin.surveyor_schemas CASCADE;"
psql -U postgres -d surveypro_db -c "DROP VIEW IF EXISTS admin.schema_storage CASCADE;"
```

---

## Next Steps After Setup

1. ✅ **Test with one surveyor** - Verify PostGIS export works
2. ✅ **Test QGIS workflow** - Connect and digitize parcels
3. ✅ **Test with multiple surveyors** - Ensure isolation
4. ✅ **Update user registration** - Auto-create schemas for new users
5. ✅ **Monitor storage** - Use `admin.schema_storage` view

---

## Performance Monitoring

### Check Schema Sizes

```sql
SELECT * FROM admin.schema_storage;
```

### Check Surveyor Activity

```sql
SELECT 
  s.name,
  s.schema_name,
  (SELECT COUNT(*) FROM information_schema.tables 
   WHERE table_schema = s.schema_name) AS tables,
  s.created_at
FROM surveyor_profiles s
WHERE s.schema_name IS NOT NULL
ORDER BY s.created_at DESC;
```

---

## Support

For issues:
1. Check `SCHEMA_EXPORT_FIX_IMPLEMENTED.md` for implementation details
2. Check `POSTGIS_EXPORT_SCHEMA_ISSUE.md` for root cause analysis
3. Review this guide's troubleshooting section
4. Check backend logs for schema-related errors

---

## Summary

✅ **Migration 040** - Database schema changes (functions, columns)  
✅ **Setup Script** - Creates schemas for existing surveyors  
✅ **Backend Code** - Already updated (coordinatePoints, landParcels, spatial)  
✅ **Frontend Code** - No changes needed  
✅ **QGIS Integration** - Works with surveyor-specific schemas  

**Total Setup Time:** 2-5 minutes  
**Status:** Ready for production testing
