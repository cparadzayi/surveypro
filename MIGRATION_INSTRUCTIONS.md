# Coordinate Order Fix Migration - Instructions

## Overview

This guide explains how to run the coordinate order fix migration for your surveyor schema in SurveyPro.

---

## Finding Your Schema Name

Your surveyor schema follows the pattern: `surveyor_<username>`

**Option 1: From PostgreSQL**
```sql
SELECT schema_name 
FROM information_schema.schemata 
WHERE schema_name LIKE 'surveyor_%';
```

**Option 2: From your surveyor profile**
- Your schema name is based on your username
- Example: User "john.doe" → Schema "surveyor_john_doe"

---

## Running the Migration

### **Step 1: Edit the Script**

Open `fix_coordinate_order_migration.sql` and update line 23:

```sql
\set SURVEYOR_SCHEMA 'surveyor_john_doe'
```

Replace `'surveyor_john_doe'` with your actual schema name.

### **Step 2: Connect to PostgreSQL**

```bash
psql -h localhost -U postgres -d surveypro
```

### **Step 3: Run the Script**

```bash
\i fix_coordinate_order_migration.sql
```

Or from command line:
```bash
psql -h localhost -U postgres -d surveypro -f fix_coordinate_order_migration.sql
```

### **Step 4: Review the Output**

The script will:
1. ✅ Set search path to your schema
2. ✅ Show current schema verification
3. ✅ Display "BEFORE" state (should show "NEEDS FIX")
4. ✅ Run the migration (swap coordinates)
5. ✅ Display "AFTER" state (should show all ✓)
6. ⏸️ Wait for you to COMMIT or ROLLBACK

### **Step 5: Verify and Commit**

**If verification shows all ✓:**
```sql
COMMIT;
```

**If something looks wrong:**
```sql
ROLLBACK;
```

---

## Expected Output

### **Before Migration (NEEDS FIX)**
```
 name |  srid | x_ordinate | y_ordinate | x_check                    | y_check                   | location_check
------+-------+------------+------------+----------------------------+---------------------------+------------------
 P2   | 22291 | 2247107.9  | 97538.004  | X looks like Southing ✗    | Y looks like Westing ✗    | Outside Zimbabwe ✗
```

### **After Migration (FIXED)**
```
 name |  srid | x_westing | y_southing | x_check           | y_check           | location_check
------+-------+-----------+------------+-------------------+-------------------+----------------
 P2   | 22291 | 97538.004 | 2247107.9  | X is Westing ✓    | Y is Southing ✓   | In Zimbabwe ✓
```

---

## Multiple Surveyors

If you have multiple surveyor schemas that need fixing, run the migration for each schema:

1. Edit the script to set the schema name
2. Run the script
3. Verify and commit
4. Repeat for next schema

**Example:**
```sql
-- For surveyor_john_doe
\set SURVEYOR_SCHEMA 'surveyor_john_doe'
-- Run migration, verify, commit

-- For surveyor_jane_smith
\set SURVEYOR_SCHEMA 'surveyor_jane_smith'
-- Run migration, verify, commit
```

---

## Troubleshooting

### **Issue: "relation coordinate_points does not exist"**

**Cause:** Wrong schema or schema not set correctly

**Solution:**
1. Verify schema name: `SELECT current_schema();`
2. Check if table exists: `\dt coordinate_points`
3. Verify search path: `SHOW search_path;`

### **Issue: "No rows updated"**

**Cause:** Either no data exists or coordinates are already correct

**Solution:**
1. Check if points exist: `SELECT COUNT(*) FROM coordinate_points;`
2. Run STEP 2 verification to see current state
3. If all ✓, no migration needed

### **Issue: Points still wrong in QGIS after migration**

**Cause:** QGIS cache or wrong schema loaded

**Solution:**
1. Remove and re-add the PostGIS layer in QGIS
2. Verify you're loading from the correct schema
3. Check QGIS connection uses the right schema

---

## Backup and Recovery

### **Create Backup Before Migration**

```bash
# Backup specific schema
pg_dump -h localhost -U postgres -d surveypro -n surveyor_john_doe > backup_before_fix.sql

# Backup just coordinate_points table
pg_dump -h localhost -U postgres -d surveypro -n surveyor_john_doe -t coordinate_points > coordinate_points_backup.sql
```

### **Restore from Backup (if needed)**

```bash
# Restore entire schema
psql -h localhost -U postgres -d surveypro < backup_before_fix.sql

# Restore just coordinate_points
psql -h localhost -U postgres -d surveypro < coordinate_points_backup.sql
```

---

## Post-Migration Verification

### **1. PostgreSQL Verification**

```sql
-- Set your schema
SET search_path TO surveyor_john_doe, public;

-- Check coordinates
SELECT 
  name,
  ST_X(geom) as x_westing,
  ST_Y(geom) as y_southing,
  ST_X(ST_Transform(geom, 4326)) as lon,
  ST_Y(ST_Transform(geom, 4326)) as lat
FROM coordinate_points
LIMIT 5;

-- Expected: x_westing ~97k, y_southing ~2.2M, lon ~30°E, lat ~-20°S
```

### **2. QGIS Verification**

1. Open QGIS
2. Add PostGIS Connection:
   - Host: localhost
   - Database: surveypro
   - Schema: **surveyor_john_doe** (your schema)
3. Add Layer: coordinate_points
4. Verify CRS: EPSG:22291
5. Add Basemap: OpenStreetMap
6. **Points should appear in central Zimbabwe**

### **3. MapLibre Verification**

1. Open SurveyPro application
2. Navigate to MapLibre Area View
3. Load your project
4. **Points should still display correctly** (no change expected)

---

## Schema-Per-Surveyor Architecture

**How it works:**
- Each surveyor has their own PostgreSQL schema
- Schema name: `surveyor_<username>`
- All tables (coordinate_points, land_parcels, etc.) exist in each schema
- Data is isolated between surveyors
- Migration must be run per schema

**Benefits:**
- ✅ Data isolation and security
- ✅ Multi-tenant architecture
- ✅ Independent migrations per surveyor
- ✅ No cross-contamination of survey data

---

## Summary

1. **Find your schema name** (surveyor_<username>)
2. **Edit migration script** (set SURVEYOR_SCHEMA variable)
3. **Run migration** (psql -f fix_coordinate_order_migration.sql)
4. **Verify output** (all checks should show ✓)
5. **Commit changes** (if verification passes)
6. **Test in QGIS** (points should appear in Zimbabwe)

**After migration, all new CSV imports will use the correct coordinate order automatically.**
