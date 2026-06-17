# Land Parcel Area Data Issue - Root Cause Analysis & Fix

## Problem Statement
Land parcels retrieved from the PostGIS database are showing **zero values** for `area_m2`, `area_ha`, and `perimeter_m` fields in the multi-tenant schema-per-surveyor architecture.

## Root Cause Analysis

### Issue 1: **CRITICAL - Conflicting Table Definitions**

**Migration 017 (Old - Public Schema):**
```sql
CREATE TABLE land_parcels (
  -- ... other fields ...
  area_m2 NUMERIC GENERATED ALWAYS AS (ST_Area(geom)) STORED,
  area_ha NUMERIC GENERATED ALWAYS AS (ST_Area(geom) / 10000) STORED,
  perimeter_m NUMERIC GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED
);
```
✅ Uses **GENERATED ALWAYS** columns - PostgreSQL auto-calculates from geometry

**Migration 040 (New - Schema-per-surveyor):**
```sql
CREATE TABLE IF NOT EXISTS surveyor_X.land_parcels (
  -- ... other fields ...
  area_m2 NUMERIC(12, 2),
  area_ha NUMERIC(12, 4),
  perimeter_m NUMERIC(12, 2),
  -- NO GENERATED ALWAYS!
);
```
❌ Uses **regular columns** - requires manual INSERT/UPDATE
❌ Backend tries to UPDATE these columns, but they're empty on INSERT

### Issue 2: **Model Tries to Update Non-Generated Columns**

**File:** `app-backend/src/models/landParcel.js`

**Line 32-38 (create method):**
```javascript
const result = await dbConnection.query(
  `INSERT INTO land_parcels 
   (project_id, stand, designation, geom, ...) 
   VALUES ($1, $2, $3, ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), 22291), ...) 
   RETURNING *, ST_AsGeoJSON(geom)::jsonb as geom`,
  [projectId, stand, designation, JSON.stringify(geom), ...]
)
```
❌ Does NOT insert `area_m2`, `area_ha`, `perimeter_m` (expects GENERATED columns)
❌ In migration 040 schema, these remain NULL/0

**Line 126-151 (updateAreaCalculation method):**
```javascript
async updateAreaCalculation(dbConnection = db, id, data) {
  const result = await dbConnection.query(
    `UPDATE "land_parcels" 
    SET 
      "area_m2" = $1,
      "area_ha" = $2,
      "perimeter_m" = $3,
      ...
    WHERE "id" = $8`,
    [data.areaM2, data.areaHa, data.perimeterM, ...]
  )
  return result.rows[0]
}
```
✅ This method DOES update area values
❌ But it's only called from `/land-parcels/calculate-areas` endpoint
❌ NOT called during normal parcel creation from QGIS

### Issue 3: **Schema Context May Not Be Set**

**File:** `app-backend/src/utils/schemaAuth.js`

```javascript
export async function authenticateWithSchema(request, reply) {
  // ... gets surveyor profile ...
  request.db = getSurveyorPool(profile.schema_name)
}
```

**File:** `app-backend/src/config/db.js`

```javascript
function getSurveyorPool(schemaName) {
  return {
    async query(sql, params) {
      const client = await pool.connect()
      try {
        await client.query(`SET search_path = ${schemaName}, public`)
        const result = await client.query(sql, params)
        return result
      } finally {
        client.release()
      }
    }
  }
}
```

⚠️ **SECURITY ISSUE:** `schemaName` is directly interpolated without sanitization
⚠️ SQL injection risk if schema_name is malicious

## Impact Assessment

### Affected Operations:
1. ✅ **QGIS Digitization → Database:** Parcels are created but with NULL/0 areas
2. ✅ **Frontend Display:** Shows 0.00 m² / 0.0000 ha
3. ✅ **Area Calculations:** `/land-parcels/calculate-areas` endpoint works but requires manual trigger
4. ❌ **Auto-calculation:** Areas should be calculated automatically on INSERT

### Data Integrity:
- Existing parcels in surveyor schemas have **zero areas**
- Geometry is stored correctly (EPSG:22291)
- Area calculation logic is correct (shoelace method)
- Problem is purely in table definition mismatch

## Solution

### Fix 1: Update Migration 040 to Use GENERATED ALWAYS Columns

**File:** `app-backend/migrations/040.do.sql` (lines 106-108)

**BEFORE:**
```sql
area_m2 NUMERIC(12, 2),
area_ha NUMERIC(12, 4),
perimeter_m NUMERIC(12, 2),
```

**AFTER:**
```sql
area_m2 NUMERIC(12, 2) GENERATED ALWAYS AS (ST_Area(geom)) STORED,
area_ha NUMERIC(12, 4) GENERATED ALWAYS AS (ST_Area(geom) / 10000) STORED,
perimeter_m NUMERIC(12, 2) GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED,
```

### Fix 2: Update landParcel.create() to NOT Insert Area Columns

**File:** `app-backend/src/models/landParcel.js` (line 32)

**BEFORE:**
```javascript
// Note: area_m2, area_ha, perimeter_m are GENERATED ALWAYS columns and cannot be inserted
```

**AFTER:**
```javascript
// Note: area_m2, area_ha, perimeter_m are GENERATED ALWAYS columns (auto-calculated by PostgreSQL)
// They MUST NOT be included in INSERT statements
```

✅ Code is already correct - just update comment

### Fix 3: Fix SQL Injection in getSurveyorPool

**File:** `app-backend/src/config/db.js` (line 36)

**BEFORE:**
```javascript
await client.query(`SET search_path = ${schemaName}, public`)
```

**AFTER:**
```javascript
await client.query('SET search_path = $1, public', [schemaName])
```

❌ **WAIT!** PostgreSQL does NOT support parameterized schema names in SET search_path
✅ **Solution:** Validate schema name with whitelist pattern

```javascript
function getSurveyorPool(schemaName) {
  // Validate schema name (must start with surveyor_ and contain only alphanumeric + underscore)
  if (!/^surveyor_[a-z0-9_]+$/.test(schemaName)) {
    throw new Error('Invalid schema name format')
  }
  
  return {
    async query(sql, params) {
      const client = await pool.connect()
      try {
        // Safe to use string interpolation after validation
        await client.query(`SET search_path = ${schemaName}, public`)
        const result = await client.query(sql, params)
        return result
      } finally {
        client.release()
      }
    }
  }
}
```

### Fix 4: Migration Script to Fix Existing Data

**New File:** `app-backend/migrations/051.do.sql`

```sql
-- Migration 051: Fix land_parcels area columns to use GENERATED ALWAYS
-- Purpose: Convert regular columns to auto-calculated columns in surveyor schemas

DO $$
DECLARE
  schema_rec RECORD;
BEGIN
  -- Loop through all surveyor schemas
  FOR schema_rec IN 
    SELECT schema_name 
    FROM surveyor_profiles 
    WHERE schema_name IS NOT NULL
  LOOP
    RAISE NOTICE 'Fixing land_parcels in schema: %', schema_rec.schema_name;
    
    -- Drop existing columns
    EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_m2', schema_rec.schema_name);
    EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS area_ha', schema_rec.schema_name);
    EXECUTE format('ALTER TABLE %I.land_parcels DROP COLUMN IF EXISTS perimeter_m', schema_rec.schema_name);
    
    -- Add GENERATED ALWAYS columns
    EXECUTE format('
      ALTER TABLE %I.land_parcels 
      ADD COLUMN area_m2 NUMERIC(12, 2) GENERATED ALWAYS AS (ST_Area(geom)) STORED,
      ADD COLUMN area_ha NUMERIC(12, 4) GENERATED ALWAYS AS (ST_Area(geom) / 10000) STORED,
      ADD COLUMN perimeter_m NUMERIC(12, 2) GENERATED ALWAYS AS (ST_Perimeter(geom)) STORED
    ', schema_rec.schema_name);
    
    RAISE NOTICE '✅ Fixed schema: %', schema_rec.schema_name;
  END LOOP;
  
  RAISE NOTICE '🎉 All surveyor schemas updated successfully!';
END $$;
```

## Testing Plan

### 1. Test Area Auto-Calculation
```sql
-- In surveyor schema
SET search_path = surveyor_test, public;

-- Insert test parcel
INSERT INTO land_parcels (project_id, stand, geom)
VALUES (
  1, 
  'Test Stand 1',
  ST_GeomFromText('POLYGON((0 0, 100 0, 100 100, 0 100, 0 0))', 22291)
);

-- Verify areas are auto-calculated
SELECT 
  stand, 
  area_m2,  -- Should be ~10000
  area_ha,  -- Should be ~1.0
  perimeter_m  -- Should be ~400
FROM land_parcels
WHERE stand = 'Test Stand 1';
```

### 2. Test QGIS Workflow
1. Export coordinates to PostGIS
2. Digitize polygon in QGIS
3. Save to database
4. Refresh in SurveyPro
5. ✅ Verify area shows immediately (not 0.00)

### 3. Test Multi-Tenant Isolation
```sql
-- Create two test surveyors
SELECT create_surveyor_schema('alice');
SELECT create_surveyor_schema('bob');

-- Insert parcel for Alice
SET search_path = surveyor_alice, public;
INSERT INTO land_parcels (project_id, stand, geom) VALUES (...);

-- Verify Bob cannot see Alice's data
SET search_path = surveyor_bob, public;
SELECT COUNT(*) FROM land_parcels;  -- Should be 0
```

## Rollout Plan

### Phase 1: Fix Migration 040 (Immediate)
- Update `040.do.sql` to use GENERATED ALWAYS
- Commit and document change

### Phase 2: Create Migration 051 (Immediate)
- Create new migration to fix existing schemas
- Test on development database
- Run on production during maintenance window

### Phase 3: Add Schema Name Validation (High Priority)
- Update `getSurveyorPool()` with validation
- Add unit tests for validation logic
- Deploy with migration 051

### Phase 4: Verify All Routes (Medium Priority)
- Audit all routes using `authenticateWithSchema`
- Ensure `request.db` is used consistently
- Add logging for schema context

### Phase 5: Documentation (Low Priority)
- Update QGIS integration guide
- Add troubleshooting section for zero areas
- Document multi-tenant best practices

## Success Metrics

✅ **Area values auto-populate** on parcel creation
✅ **Zero area parcels eliminated** from database
✅ **QGIS workflow seamless** - no manual calculation needed
✅ **Schema isolation verified** - no cross-contamination
✅ **Security hardened** - SQL injection prevented

## Files to Modify

1. ✅ `app-backend/migrations/040.do.sql` - Fix table definition
2. ✅ `app-backend/migrations/051.do.sql` - NEW - Fix existing data
3. ✅ `app-backend/src/config/db.js` - Add schema validation
4. ℹ️ `app-backend/src/models/landParcel.js` - Already correct (verify comment)

## Estimated Effort

- **Migration fixes:** 30 minutes
- **Schema validation:** 15 minutes
- **Testing:** 1 hour
- **Documentation:** 30 minutes
- **Total:** ~2.5 hours

## Risk Assessment

### Low Risk:
- ✅ GENERATED ALWAYS is standard PostgreSQL feature
- ✅ Migration 051 is idempotent (can run multiple times)
- ✅ No data loss (geometry preserved)

### Medium Risk:
- ⚠️ Existing parcels need recalculation (automatic via GENERATED)
- ⚠️ Schema validation may break if schema names are non-standard

### Mitigation:
- ✅ Test on development database first
- ✅ Backup production database before migration
- ✅ Run migration during low-traffic period
- ✅ Monitor logs for errors

---

**Status:** Ready for implementation
**Priority:** HIGH - Affects core functionality
**Assigned:** Backend Team
**Reviewed:** Pending
