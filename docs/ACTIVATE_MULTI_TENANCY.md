# Activate Multi-Tenancy (Schema-per-Surveyor)

## Current Status

✅ **Architecture designed** (Migration 040)
✅ **Schema management functions created**
⚠️ **NOT ACTIVE** - Currently using public schema
⚠️ **Middleware temporarily disabled** (to fix 500 errors)

## Problem

Your 540 coordinate points are in `public.coordinate_points` instead of `surveyor_kuziva_paradzayi.coordinate_points`.

## Solution: Activate Multi-Tenancy

### Step 1: Apply Multi-Tenancy Migration

```bash
cd c:/mataranyika/SurveyPro-nov-alpha/app-backend
psql -U postgres -d surveypro_db -f migrations/040.do.sql
```

**Expected output:**
```
CREATE FUNCTION
CREATE FUNCTION
CREATE FUNCTION
CREATE VIEW
...
```

### Step 2: Create Your Surveyor Schema

```bash
psql -U postgres -d surveypro_db -c "SELECT create_surveyor_schema('kuziva_paradzayi');"
```

**Expected output:**
```
                    create_surveyor_schema                     
---------------------------------------------------------------
 Schema surveyor_kuziva_paradzayi created with 5 tables
(1 row)
```

### Step 3: Verify Schema Created

```bash
psql -U postgres -d surveypro_db -c "\dn"
```

**Should show:**
```
        List of schemas
        Name           |  Owner   
-----------------------+----------
 public                | postgres
 surveyor_kuziva_paradzayi | postgres
```

### Step 4: Assign Schema to Your Profile

```bash
psql -U postgres -d surveypro_db -c "UPDATE surveyor_profiles SET schema_name = 'surveyor_kuziva_paradzayi' WHERE id = 2;"
```

**Verify:**
```bash
psql -U postgres -d surveypro_db -c "SELECT id, name, schema_name FROM surveyor_profiles WHERE id = 2;"
```

**Should show:**
```
 id |      name       |       schema_name        
----+-----------------+--------------------------
  2 | Kuziva Paradzayi | surveyor_kuziva_paradzayi
```

### Step 5: Migrate Existing Data

**IMPORTANT:** This moves your 540 points from public to your schema!

```bash
psql -U postgres -d surveypro_db -c "SELECT migrate_surveyor_to_schema(2);"
```

**Expected output:**
```
                          migrate_surveyor_to_schema
------------------------------------------------------------------------
 Migrated surveyor 2 (Kuziva Paradzayi) to schema surveyor_kuziva_paradzayi
 Migrated tables: coordinate_points, land_parcels, ...
(1 row)
```

**Verify migration:**
```bash
# Check public schema (should be 0 or have other surveyors' data)
psql -U postgres -d surveypro_db -c "SELECT COUNT(*) FROM public.coordinate_points WHERE project_id = 1;"

# Check your schema (should be 540)
psql -U postgres -d surveypro_db -c "SELECT COUNT(*) FROM surveyor_kuziva_paradzayi.coordinate_points WHERE project_id = 1;"
```

### Step 6: Restart Backend

**The code changes are already done** - I've re-enabled `authenticateWithSchema` middleware.

```bash
cd c:/mataranyika/SurveyPro-nov-alpha/app-backend
# Ctrl+C to stop
npm run dev
```

### Step 7: Test in Browser

1. **Refresh frontend** (Ctrl+Shift+R)
2. **Navigate to QGIS Export**
3. **Click "Export to PostGIS"**
4. **Should work without 500 errors!**

Console should show:
```
✅ Schema authenticated: surveyor_kuziva_paradzayi
✅ Exported 540 points to PostGIS
```

---

## QGIS Setup for Multi-Tenancy

### Connect to Your Surveyor Schema

**Connection String:**
```
host=localhost 
port=5432 
dbname=surveypro_db 
user=postgres 
password=your_password
schemas=surveyor_kuziva_paradzayi
```

**In QGIS:**
1. Browser → PostgreSQL → New Connection
2. Name: `SurveyPro - Kuziva`
3. Host: `localhost`
4. Port: `5432`
5. Database: `surveypro_db`
6. **Schema:** `surveyor_kuziva_paradzayi` (NOT public!)
7. Authentication: Basic (username/password)
8. Test Connection → OK

### Add Coordinate Points Layer

1. Expand: PostgreSQL → SurveyPro - Kuziva → surveyor_kuziva_paradzayi
2. Find: `coordinate_points` table
3. Right-click → Add Layer to Project
4. Set filter: `"project_id" = 1`
5. Enable labels: name column

---

## Benefits After Activation

✅ **Data Isolation:** Each surveyor has separate tables
✅ **Security:** Surveyors can't see each other's data
✅ **Easy Export:** Export entire schema for one surveyor
✅ **Scalability:** Add new surveyors without conflicts
✅ **Professional:** GitHub-like "repository per user" experience

---

## Verification Checklist

- [ ] Migration 040 applied
- [ ] Schema `surveyor_kuziva_paradzayi` exists
- [ ] `surveyor_profiles.schema_name` set for your profile
- [ ] Data migrated from public to surveyor schema
- [ ] Backend restarted with middleware enabled
- [ ] Frontend connects without 500 errors
- [ ] QGIS connects to surveyor schema
- [ ] Coordinate points visible in QGIS

---

## Rollback (if needed)

If something goes wrong:

```bash
# 1. Restore data to public schema
psql -U postgres -d surveypro_db -c "
  INSERT INTO public.coordinate_points 
  SELECT * FROM surveyor_kuziva_paradzayi.coordinate_points
  ON CONFLICT DO NOTHING;
"

# 2. Clear schema_name
psql -U postgres -d surveypro_db -c "UPDATE surveyor_profiles SET schema_name = NULL WHERE id = 2;"

# 3. Drop surveyor schema
psql -U postgres -d surveypro_db -c "DROP SCHEMA surveyor_kuziva_paradzayi CASCADE;"

# 4. Disable middleware again (edit coordinatePoints.js)
```

---

## Next: Add More Surveyors

For each new surveyor:

```bash
# Create schema
psql -U postgres -d surveypro_db -c "SELECT create_surveyor_schema('john_doe');"

# Assign to profile
psql -U postgres -d surveypro_db -c "UPDATE surveyor_profiles SET schema_name = 'surveyor_john_doe' WHERE id = 3;"

# Migrate their data (if they have any in public)
psql -U postgres -d surveypro_db -c "SELECT migrate_surveyor_to_schema(3);"
```

**Done!** Each surveyor now has complete data isolation. 🎉
