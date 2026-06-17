# Quick Fix Guide - Land Parcel Foreign Key Error

## 🔴 CRITICAL ISSUE: Project Schema Mismatch

**Error:** `insert or update on table "land_parcels" violates foreign key constraint "land_parcels_project_id_fkey"`

**Root Cause:** Projects are being created in `public` schema, but land parcels expect them in surveyor schemas.

**Time to Fix:** 30-60 minutes

---

## 🚀 Quick Fix (Do This Now!)

### Step 1: Update survey-projects.js Routes (5 minutes)

**File:** `app-backend/src/routes/survey-projects.js`

Add import at top:
```javascript
import { authenticateWithSchema } from '../utils/schemaAuth.js'
```

Update ALL route definitions to include `authenticateWithSchema`:

```javascript
// Find this pattern (appears multiple times):
preHandler: [fastify.authenticate]

// Replace with:
preHandler: [fastify.authenticate, authenticateWithSchema]
```

Routes to update:
- `GET /recent`
- `GET /`
- `POST /:id/touch`
- `GET /:id`
- `POST /` (CREATE)
- `PUT /:id` (UPDATE)
- `DELETE /:id`

### Step 2: Update Route Handlers (15 minutes)

In EACH route handler, add this line near the top:

```javascript
// OLD:
async (request, reply) => {
  const project = await SurveyProject.create({ ... })
}

// NEW:
async (request, reply) => {
  const db = request.db || (await import('../config/db.js')).default
  const project = await SurveyProject.create(db, { ... })
}
```

Example for CREATE route:

```javascript
fastify.post('/', {
  preHandler: [fastify.authenticate, authenticateWithSchema]
}, async (request, reply) => {
  try {
    // 👇 ADD THIS LINE
    const db = request.db || (await import('../config/db.js')).default
    
    const project = await SurveyProject.create(db, {  // 👈 Pass db
      name: request.body.name,
      surveyorId: profileId,
      // ... other fields
    })
    
    return { ok: true, project }
  } catch (error) {
    // ...
  }
})
```

### Step 3: Update SurveyProject Model (20 minutes)

**File:** `app-backend/src/models/SurveyProject.js`

Update EVERY method to accept `dbConnection` as first parameter:

```javascript
class SurveyProject {
  // BEFORE:
  static async create({ name, surveyorId, ... }) {
    const result = await db.query(...)
  }
  
  // AFTER:
  static async create(dbConnection = db, { name, surveyorId, ... }) {
    const result = await dbConnection.query(...)
  }
  
  // Apply to ALL methods:
  // - create()
  // - findAll()
  // - findRecent()
  // - findById()
  // - update()
  // - delete()
  // - etc.
}
```

### Step 4: Restart Backend (1 minute)

```bash
cd app-backend
npm run dev
```

### Step 5: Test (5 minutes)

1. **Login to app**
2. **Create a new project** via the UI
3. **Check console logs** - should show project created in surveyor schema
4. **Try digitizing a parcel** - should work now!

---

## 🧪 Verification Commands

### Check if projects are in correct schema:

```sql
-- Connect to database
psql -U postgres -d surveypro_v1

-- Check public schema (should be empty or old data)
SELECT id, name, surveyor_profile_id 
FROM public.survey_projects 
ORDER BY created_at DESC 
LIMIT 5;

-- Check surveyor schema (should have new data)
SET search_path = surveyor_YOUR_USERNAME, public;

SELECT id, name 
FROM survey_projects 
ORDER BY created_at DESC 
LIMIT 5;
```

### Test project-parcel linkage:

```sql
-- In your surveyor schema:
SET search_path = surveyor_YOUR_USERNAME, public;

-- Check projects exist
SELECT id, name FROM survey_projects;

-- Check parcels can reference projects
SELECT 
  lp.id as parcel_id,
  lp.designation,
  sp.name as project_name
FROM land_parcels lp
JOIN survey_projects sp ON lp.project_id = sp.id;
-- Should return results without error
```

---

## ✅ Success Indicators

After implementing the fix, you should see:

1. **Console Log:** 
   ```
   [POST /survey-projects] Creating project for user: john@example.com
   [POST /survey-projects] User john@example.com (profile_id: 1) created project in schema: surveyor_john_doe
   ```

2. **Database:** Projects in `surveyor_*` schema, not `public`

3. **Land Parcels:** Can be created without foreign key errors

4. **QGIS:** Can connect to surveyor schema and see data

---

## ⚠️ Common Mistakes

### Mistake 1: Forgot to add authenticateWithSchema
```javascript
// ❌ WRONG:
preHandler: [fastify.authenticate]

// ✅ CORRECT:
preHandler: [fastify.authenticate, authenticateWithSchema]
```

### Mistake 2: Didn't pass db to model
```javascript
// ❌ WRONG:
const project = await SurveyProject.create({ name })

// ✅ CORRECT:
const db = request.db
const project = await SurveyProject.create(db, { name })
```

### Mistake 3: Updated routes but not model
```javascript
// Both must be updated!
// 1. Routes: Add authenticateWithSchema + get request.db
// 2. Model: Add dbConnection parameter to methods
```

---

## 🔄 Rollback Plan (If Something Goes Wrong)

```bash
# 1. Stop the server
Ctrl+C

# 2. Restore files from git
cd app-backend
git checkout src/routes/survey-projects.js
git checkout src/models/SurveyProject.js

# 3. Restart server
npm run dev
```

---

## 📞 Need Help?

### Check Logs

**Backend Console:**
```bash
npm run dev
# Look for errors when creating projects
```

**PostgreSQL Logs:**
```sql
-- In psql:
SHOW log_destination;
-- Check the log file for errors
```

### Test Manually

**Create Project via API:**
```bash
# Get auth token from browser devtools (Application → localStorage → authToken)

curl -X POST http://localhost:3050/api/survey-projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Test Project",
    "surveyorProfileId": 1,
    "clientName": "Test Client",
    "district": "Test District"
  }'
```

**Check Response:**
```json
{
  "ok": true,
  "project": {
    "id": 1,
    "name": "Test Project",
    // ... should return project
  }
}
```

### Still Stuck?

1. Read full analysis: `LAND_PARCEL_COMPREHENSIVE_ANALYSIS.md`
2. Check database schema: `psql` commands above
3. Review migration 040: `app-backend/migrations/040.do.sql`
4. Contact team lead with error logs

---

## 📊 Impact Assessment

### Before Fix:
- ❌ Cannot create land parcels
- ❌ Foreign key constraint errors
- ❌ Data in wrong schema
- ⚠️ Multi-tenancy broken

### After Fix:
- ✅ Land parcels work
- ✅ Projects in correct schema
- ✅ Multi-tenancy working
- ✅ QGIS integration ready

**Estimated Impact:** Unblocks all users, enables full workflow

---

## 🎯 Next Steps (After This Fix)

1. ✅ **This fix** - Projects in correct schema
2. ⏭️ Update QGIS endpoint (see main analysis doc)
3. ⏭️ Create QGIS integration guide
4. ⏭️ Test with multiple surveyors
5. ⏭️ Deploy to production

**Priority:** This fix is P0 (blocking). Do it ASAP!

---

**Last Updated:** December 9, 2024  
**Estimated Time:** 30-60 minutes  
**Difficulty:** LOW (straightforward code changes)  
**Risk:** LOW (can rollback easily)  
**Impact:** HIGH (unblocks all workflows)
