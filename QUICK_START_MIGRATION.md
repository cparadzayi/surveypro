# Quick Start: Schema-Aware PostGIS Migration

## ⚡ One Command Setup

```bash
cd app-backend
npm run setup:auto
```

**That's it!** Wait 2-3 minutes and you're done. ✅

---

## What This Does

1. ✅ Runs migration 040 (adds schema functions and `schema_name` column)
2. ✅ Creates individual schemas for each surveyor (e.g., `surveyor_elon_paradza`)
3. ✅ Creates tables in each schema: `coordinate_points`, `land_parcels`, `survey_projects`
4. ✅ Updates `surveyor_profiles` with schema names
5. ✅ Verifies everything is set up correctly

---

## Verify It Worked

```bash
psql -U postgres -d surveypro_db -c "SELECT * FROM admin.surveyor_schemas;"

-- Expected output:
-- surveyor_id | email               | full_name    | schema_name            | table_count
-- 1           | elon.paradza@...   | Elon Paradza | surveyor_elon_paradza  | 3
```

---

## Test PostGIS Export

1. **Login** as a surveyor (e.g., elon.paradza@example.com)
2. **Navigate** to Cadastral Standard workflow
3. **Import** coordinates (CSV)
4. **Export** to PostGIS Database (button in step 4)
5. **Verify** in database:

```sql
-- Check surveyor schema (should have points)
SELECT COUNT(*) FROM surveyor_elon_paradza.coordinate_points;
-- Expected: Number of points you exported ✅

-- Check public schema (should be empty)
SELECT COUNT(*) FROM public.coordinate_points WHERE project_id = YOUR_PROJECT_ID;
-- Expected: 0 ✅
```

---

## Manual Setup (If Auto Fails)

```bash
cd app-backend

# Step 1: Run migration
npm run migrate

# Step 2: Create schemas
npm run setup:schemas
```

---

## Scripts Available

- `npm run setup:auto` - One-click automatic setup
- `npm run migrate` - Run all pending migrations
- `npm run setup:schemas` - Create schemas for existing surveyors

---

## Files Created

1. **`migrations/040.do.sql`** - Migration script (schema functions)
2. **`scripts/setup-surveyor-schemas.js`** - Schema creation script
3. **`scripts/auto-setup.js`** - Automatic setup orchestrator
4. **`MIGRATION_SETUP_GUIDE.md`** - Detailed guide with troubleshooting
5. **`SCHEMA_EXPORT_FIX_IMPLEMENTED.md`** - Implementation details
6. **`POSTGIS_EXPORT_SCHEMA_ISSUE.md`** - Root cause analysis

---

## Troubleshooting

### Error: "No surveyors found"

**Fix:** Create a surveyor profile first:
1. Register a new user in the app
2. Complete surveyor profile
3. Re-run setup

### Error: "Migration already applied"

**Fix:** This is normal if re-running. Skip to:
```bash
npm run setup:schemas
```

### Error: "Database connection failed"

**Fix:** 
1. Check PostgreSQL is running
2. Check `DATABASE_URL` in `.env`
3. Verify database credentials

---

## Need More Help?

- **Detailed Guide:** `MIGRATION_SETUP_GUIDE.md`
- **Implementation:** `SCHEMA_EXPORT_FIX_IMPLEMENTED.md`
- **Root Cause:** `POSTGIS_EXPORT_SCHEMA_ISSUE.md`
- **Testing:** `TEST_EXECUTION_LOG.md`

---

**Setup Time:** 2-3 minutes  
**Status:** ✅ Ready for testing
