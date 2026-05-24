# Setup Guide: Migration 016 - QGIS Integration Enhancements

## Quick Start

### Step 1: Run the Migration

```bash
cd app-backend
npm run migrate
```

**Expected Output:**
```
Running migration: 016.do.sql
✓ Added name column to features table
✓ Populated existing records
✓ Created indexes
Migration 016 complete!
```

### Step 2: Restart Backend Server

```bash
# Stop the current server (Ctrl+C)
npm run dev
```

### Step 3: Verify Migration

Open PostgreSQL and check:

```sql
-- Check if name column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'features' AND column_name = 'name';

-- Check if indexes exist
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'features' 
  AND (indexname = 'features_name_idx' OR indexname = 'features_layer_name_idx');

-- Verify data migration
SELECT id, name, properties->>'name' as prop_name 
FROM features 
WHERE properties->>'name' IS NOT NULL 
LIMIT 5;
```

**Expected Results:**
- `name` column exists (VARCHAR 255)
- Both indexes exist
- `name` column matches `properties->>'name'`

---

## Testing the Features

### Test 1: Export Points (No Duplicates)

1. Open AreasView in browser: `http://localhost:5173/modules/lite/areas`
2. Add 3 points:
   - Point A: Y=123.45, X=678.90
   - Point B: Y=124.50, X=679.20
   - Point C: Y=125.00, X=680.00
3. Select coordinate list layer (or create new one)
4. Click "Export Current Points to DB (3 points)"

**Expected Result:**
```
Export complete:
3 created

Total: 3 points
```

### Test 2: Export Same Points (Skip Duplicates)

1. Keep the same 3 points
2. **Uncheck** "Replace duplicates on export"
3. Click "Export Current Points to DB (3 points)"

**Expected Result:**
```
Export complete:
3 skipped (duplicates)

Total: 3 points
```

### Test 3: Export Same Points (Replace Duplicates)

1. Modify coordinates:
   - Point A: Y=123.46, X=678.91 (changed)
   - Point B: Y=124.50, X=679.20 (same)
   - Point C: Y=125.01, X=680.01 (changed)
2. **Check** "Replace duplicates on export"
3. Click "Export Current Points to DB (3 points)"

**Expected Result:**
```
Export complete:
3 replaced

Total: 3 points
```

### Test 4: Mixed Export (New + Existing)

1. Add 2 new points:
   - Point D: Y=126.00, X=681.00
   - Point E: Y=127.00, X=682.00
2. Keep existing points A, B, C
3. **Uncheck** "Replace duplicates on export"
4. Click "Export Current Points to DB (5 points)"

**Expected Result:**
```
Export complete:
2 created, 3 skipped (duplicates)

Total: 5 points
```

---

## QGIS Setup & Testing

### Step 1: Connect QGIS to Database

1. Open QGIS
2. Click "Get QGIS Connection Info" in AreasView
3. Connection URI is copied to clipboard
4. In QGIS: **Layer → Add Layer → Add PostGIS Layers**
5. Click **"New"**
6. Paste connection details:
   - **Name**: SurveyPro
   - **Host**: localhost
   - **Port**: 5432
   - **Database**: surveypro
   - **Username**: postgres
   - **Password**: (your password)
7. Click **"Test Connection"** → Should show "Connection successful"
8. Click **"OK"**

### Step 2: Load Points Layer

1. In the connection dialog, expand **"SurveyPro"**
2. Find **"public.features"** table
3. Click **"Add"**
4. Points should appear on map

### Step 3: Configure Labels (NEW SIMPLE METHOD)

1. Right-click layer → **Properties**
2. Go to **Labels** tab
3. Change dropdown from "No Labels" to **"Single Labels"**
4. In **Value** dropdown, select **`name`** ✨
5. Adjust text size if needed (e.g., 10pt)
6. Click **"Apply"** → **"OK"**

**Expected Result**: Point names (A, B, C, D, E) display next to points!

### Step 4: Enable Snapping for Polygon Digitizing

1. **Settings → Snapping Options**
2. Enable snapping: **All Layers** or **Active Layer**
3. Set tolerance: **0.01 meters**
4. Enable **"Snap to Vertex"**

---

## Troubleshooting

### Issue 1: Migration Fails - "column already exists"

**Cause**: Migration 016 already ran.

**Solution**: Check if it worked:
```sql
SELECT name FROM features LIMIT 5;
```

If it shows names, you're good! If not, rollback and retry:
```bash
npm run migrate:undo
npm run migrate
```

### Issue 2: Labels Show NULL in QGIS

**Cause**: Existing features don't have `name` column populated.

**Solution**: Run manual update:
```sql
UPDATE features
SET name = properties->>'name'
WHERE name IS NULL AND properties->>'name' IS NOT NULL;
```

### Issue 3: Export Shows "0 points"

**Cause**: No valid points in the table.

**Solution**: 
1. Add points manually (click "Add Point")
2. Or load from existing layer (switch to "Load from DB" mode)
3. Or load from geometry (use "Load Lines/Polygons" section)

### Issue 4: Duplicates Still Created

**Cause**: Points have different names or layer_id.

**Solution**: 
- Verify point names match exactly (case-sensitive)
- Ensure exporting to same layer
- Check console logs for details

### Issue 5: QGIS Can't Connect

**Cause**: PostgreSQL not running or wrong credentials.

**Solution**:
```bash
# Check if PostgreSQL is running
pg_isready

# Test connection manually
psql -h localhost -U postgres -d surveypro

# Check .env file for correct credentials
cat app-backend/.env
```

---

## Performance Benchmarks

Run these tests to verify performance:

### Benchmark 1: Export Speed

```javascript
// In browser console (AreasView page)
console.time('export')
// Click "Export Current Points to DB"
// After completion:
console.timeEnd('export')
```

**Expected**: < 500ms for 100 points

### Benchmark 2: Duplicate Detection

```sql
-- In PostgreSQL
EXPLAIN ANALYZE
SELECT * FROM features 
WHERE layer_id = 5 AND name = 'A';
```

**Expected**: Index scan, < 1ms execution time

### Benchmark 3: QGIS Label Rendering

1. Load 1000+ points in QGIS
2. Enable labels
3. Pan/zoom map

**Expected**: Smooth rendering, no lag

---

## Rollback (If Needed)

If something goes wrong, rollback the migration:

```bash
cd app-backend
npm run migrate:undo
```

This will:
- Drop indexes
- Drop `name` column
- Preserve JSONB `properties` (no data loss)

Then fix the issue and re-run:
```bash
npm run migrate
```

---

## Verification Checklist

- [ ] Migration 016 ran successfully
- [ ] Backend server restarted
- [ ] `name` column exists in `features` table
- [ ] Indexes created: `features_name_idx`, `features_layer_name_idx`
- [ ] Export shows point count in button
- [ ] Export detects duplicates (skip mode works)
- [ ] Export replaces duplicates (replace mode works)
- [ ] Export summary shows created/skipped/replaced counts
- [ ] QGIS connects to database
- [ ] QGIS loads features layer
- [ ] QGIS labels display using `name` column
- [ ] QGIS snapping works for polygon digitizing

---

## Next Steps After Verification

Once everything is working:

1. **Test Full Workflow**:
   - Export coordinate list
   - Open QGIS
   - Digitize polygons
   - Run batch area computation
   - Verify results

2. **Create Sample Data**:
   - Export 10-20 points
   - Create 3-5 polygons in QGIS
   - Test batch computation

3. **Document Your Workflow**:
   - Take screenshots
   - Note any issues
   - Share feedback

4. **Production Deployment**:
   - Backup database
   - Run migration on production
   - Test with real data

---

## Support

If you encounter issues:

1. Check console logs (browser + backend)
2. Check PostgreSQL logs
3. Review migration output
4. Verify database schema
5. Test with minimal data first

**Files to Check**:
- `app-backend/migrations/016.do.sql`
- `app-backend/migrations/016.README.md`
- `BATCH_AREA_COMPUTATION_GUIDE.md`

**Logs to Review**:
- Browser console (F12)
- Backend terminal output
- PostgreSQL logs (`/var/log/postgresql/`)

---

## Success Criteria

✅ You'll know it's working when:
1. Export button shows point count
2. Duplicate exports are skipped/replaced correctly
3. QGIS labels display point names without expressions
4. Batch area computation works with QGIS polygons
5. No duplicate points in database after re-export

🎉 **Congratulations!** You now have a professional QGIS-integrated workflow for batch area computation!
