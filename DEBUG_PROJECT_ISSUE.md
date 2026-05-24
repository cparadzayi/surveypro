# Foreign Key Constraint Error - Debugging Guide

## Error
```
insert or update on table "land_parcels" violates foreign key constraint "land_parcels_project_id_fkey"
```

## What This Means
The `land_parcels` table has a foreign key constraint:
```sql
project_id INTEGER REFERENCES survey_projects(id) ON DELETE CASCADE
```

This means `project_id = 5` must exist in the `survey_projects` table **in your surveyor schema**.

## Root Cause
In the multi-tenant architecture, each surveyor has their own schema with their own `survey_projects` table. The project you're trying to use (ID 5) either:
1. Doesn't exist in your surveyor schema
2. Exists in the `public` schema but not in your surveyor schema
3. Was created before the multi-tenancy migration

## How to Fix

### Option 1: Check Which Projects Exist in Your Schema

```sql
-- Connect to database
psql -U postgres -d surveypro_v1

-- Set search path to your surveyor schema
SET search_path = surveyor_YOUR_USERNAME, public;

-- List all projects in your schema
SELECT id, name, location, created_at 
FROM survey_projects 
ORDER BY id;
```

**Use one of the project IDs from this list!**

### Option 2: Create a New Project in Your Schema

If no projects exist, create one:

```sql
SET search_path = surveyor_YOUR_USERNAME, public;

INSERT INTO survey_projects (
  name, 
  location, 
  surveyor_id, 
  created_at
) VALUES (
  'Test Project for Area Digitization',
  'Test Location',
  YOUR_SURVEYOR_ID,  -- Replace with your surveyor ID
  NOW()
) RETURNING id, name;
```

**Use the returned ID in your frontend!**

### Option 3: Check if Project Exists in Public Schema

```sql
-- Check public schema
SET search_path = public;

SELECT id, name, location 
FROM survey_projects 
WHERE id = 5;
```

If it exists in `public` but not in your surveyor schema, you need to either:
- Use a different project ID that exists in your surveyor schema
- Migrate the project to your surveyor schema
- Create a new project in your surveyor schema

## Frontend Fix

The issue is that the frontend is using `project_id: 5`, but this project doesn't exist in your surveyor schema.

**Check the frontend code:**

```typescript
// In MapLibreAreaView.vue
project_id: workflowState.projectInfo.projectId  // This is 5
```

**Solutions:**

1. **Select a different project** in the UI that exists in your surveyor schema
2. **Create a new project** via the Projects page
3. **Update the project selector** to only show projects from your surveyor schema

## Verify Multi-Tenancy is Working

```sql
-- Check which schema you're in
SELECT current_schema();

-- Check if survey_projects table exists in your schema
SELECT schemaname, tablename 
FROM pg_tables 
WHERE tablename = 'survey_projects';

-- Should show:
-- surveyor_YOUR_USERNAME | survey_projects
-- public                 | survey_projects (if old table still exists)
```

## Quick Test

```sql
-- Set to your surveyor schema
SET search_path = surveyor_YOUR_USERNAME, public;

-- Create test project
INSERT INTO survey_projects (name, location, surveyor_id)
VALUES ('Test Project', 'Test Location', 1)
RETURNING id;

-- Use the returned ID in your frontend!
```

## Summary

✅ **Good news:** The area column issue is fixed!
✅ **Good news:** Multi-tenancy is working correctly!
❌ **Issue:** Project ID 5 doesn't exist in your surveyor schema
✅ **Solution:** Use a project ID that exists in your surveyor schema, or create a new one

---

**Next Steps:**
1. Run the SQL queries above to find valid project IDs
2. Update the frontend to use a valid project ID
3. Or create a new project and use its ID
4. Try digitizing again - it should work!
