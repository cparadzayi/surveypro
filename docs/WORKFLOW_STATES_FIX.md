# CRITICAL FIX: Missing workflow_states Table

## Problem Discovered

The `workflow_states` table **does not exist** in the database! This is why:

1. ❌ Imported CSV points are not saved
2. ❌ Found beacons (Status='F') are not persisted
3. ❌ Workflow data is lost on page refresh
4. ❌ Console shows: `Total imported points: 0`

## Root Cause

The workflow persistence feature was implemented in the code but the database table was never created.

## Fix (5 minutes)

### Step 1: Apply Migration

Open PowerShell/Terminal and run:

```bash
cd c:/mataranyika/SurveyPro-nov-alpha/app-backend
psql -U postgres -d surveypro_db -f migrations/041.do.sql
```

Enter your postgres password when prompted.

### Step 2: Verify Table Created

```bash
psql -U postgres -d surveypro_db -c "\d workflow_states"
```

You should see table structure with columns:
- id
- project_id
- current_step
- step_data
- completed_steps
- created_at
- updated_at

### Step 3: Re-import CSV

**IMPORTANT:** Since the table didn't exist, your previous CSV import wasn't saved. You need to:

1. Go to CSV Import step in the cadastral workflow
2. Click "Import New CSV" or drag-drop your CSV file
3. Select "Complete Replace" when prompted
4. Wait for import to complete

### Step 4: Verify Data Saved

Check the database:

```bash
psql -U postgres -d surveypro_db -c "SELECT project_id, current_step, jsonb_object_keys(step_data) FROM workflow_states WHERE project_id = 1;"
```

You should see output like:
```
 project_id | current_step |     jsonb_object_keys
------------+--------------+---------------------------
          1 | csv-import   | csv-import
          1 | csv-import   | field-book
          1 | csv-import   | project-setup
```

### Step 5: Check Points Were Saved

```bash
psql -U postgres -d surveypro_db -c "SELECT jsonb_array_length(step_data->'csv-import'->'points') as point_count FROM workflow_states WHERE project_id = 1;"
```

Should show:
```
 point_count
-------------
         540
```

### Step 6: Test Found Beacons

1. **Refresh the page** (Ctrl+Shift+R)
2. **Navigate to Found Beacons Assessment**
3. **Check console for:**

```
🔍 [DEBUG] csvStepData.points exists? true  ← Should be true now!
🔍 Restoring points from database...
  - Points in DB: 540
  - First point.status: F
✅ Restored 540 imported points
[Found Beacons] Total imported points: 540
[Found Beacons] Status distribution: { F: 5, P: 535 }
[Found Beacons] ✅ Total fixed points found: 5
```

4. **Verify UI shows 5 found beacons** for assessment

## Expected Result

After this fix:
- ✅ CSV imports are saved to database
- ✅ Points with Status='F' are persisted
- ✅ Found Beacons step shows 5 beacons
- ✅ Workflow survives page refresh
- ✅ All workflow data is stored

## Troubleshooting

### Migration Failed

If you see errors when running the migration:

```bash
# Check if table already exists (shouldn't, but just in case)
psql -U postgres -d surveypro_db -c "\dt workflow_states"

# If it exists, drop it first
psql -U postgres -d surveypro_db -c "DROP TABLE IF EXISTS workflow_states CASCADE;"

# Then run migration again
psql -U postgres -d surveypro_db -f migrations/041.do.sql
```

### Points Still Not Showing

If points still don't appear after re-import:

1. **Check backend logs** for errors during save
2. **Verify step name:** Run in console:
   ```javascript
   console.log('Workflow state:', window.workflowState)
   ```
3. **Check API response:** Network tab → `/survey-projects/1/workflow`

### Wrong Database

If you're not sure which database to use:

```bash
# List all databases
psql -U postgres -l

# Check backend config
cat app-backend/.env
```

Should show `DB_NAME=surveypro_db`

## Files Created

1. **041.do.sql** - Creates workflow_states table
2. **041.undo.sql** - Rollback migration (if needed)
3. **041.README.md** - Full documentation

## Next Steps

Once this migration is applied:
1. Re-import your CSV data
2. Continue normal workflow
3. Found beacons should now appear correctly

## Why This Happened

The workflow persistence code was added to the frontend and backend API routes, but the database migration to create the table was never run. The code has been trying to save/load data from a non-existent table, silently failing.

This is a **one-time fix** - once the migration is applied, the problem is permanently solved.
