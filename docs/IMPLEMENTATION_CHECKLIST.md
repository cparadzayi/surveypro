# Implementation Checklist - Migration 016

## Pre-Implementation

- [ ] **Backup Database**
  ```bash
  pg_dump -U postgres surveypro > backup_before_migration_016.sql
  ```

- [ ] **Review Changes**
  - [ ] Read `016.do.sql`
  - [ ] Read `016.README.md`
  - [ ] Read `BATCH_AREA_COMPUTATION_GUIDE.md`

- [ ] **Check Current State**
  ```sql
  -- Verify features table exists
  SELECT COUNT(*) FROM features;
  
  -- Check if name column already exists
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'features' AND column_name = 'name';
  ```

---

## Implementation Steps

### 1. Run Migration

- [ ] **Navigate to backend directory**
  ```bash
  cd app-backend
  ```

- [ ] **Run migration**
  ```bash
  npm run migrate
  ```

- [ ] **Verify migration output**
  - [ ] No errors in console
  - [ ] "Migration 016 complete" message

- [ ] **Check database**
  ```sql
  -- Verify name column
  \d features
  
  -- Check indexes
  \di features_*
  
  -- Verify data migration
  SELECT id, name, properties->>'name' as prop_name 
  FROM features 
  WHERE properties->>'name' IS NOT NULL 
  LIMIT 10;
  ```

### 2. Restart Backend

- [ ] **Stop current server** (Ctrl+C)

- [ ] **Start server**
  ```bash
  npm run dev
  ```

- [ ] **Verify server starts without errors**

- [ ] **Check logs for migration confirmation**

### 3. Test Backend API

- [ ] **Test batch create endpoint**
  ```bash
  curl -X POST http://localhost:3042/api/spatial/layers/5/features/batch \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -d '{
      "features": [
        {
          "geometry": {"type": "Point", "coordinates": [123.45, 678.90]},
          "properties": {"name": "Test1", "system": "ZIM_P(Y,X)"}
        }
      ],
      "replace_duplicates": false
    }'
  ```

- [ ] **Verify response**
  - [ ] `ok: true`
  - [ ] `created: 1`
  - [ ] `skipped: 0`

### 4. Test Frontend

- [ ] **Open AreasView**
  - URL: `http://localhost:5173/modules/lite/areas`

- [ ] **Check UI elements**
  - [ ] "Replace duplicates on export" checkbox visible
  - [ ] Button shows "(X points)" count
  - [ ] Batch computation section visible

- [ ] **Test export (no duplicates)**
  - [ ] Add 3 test points
  - [ ] Select coordinate list layer
  - [ ] Click "Export Current Points to DB"
  - [ ] Verify summary: "3 created"

- [ ] **Test export (skip duplicates)**
  - [ ] Export same 3 points again
  - [ ] Uncheck "Replace duplicates"
  - [ ] Verify summary: "3 skipped (duplicates)"

- [ ] **Test export (replace duplicates)**
  - [ ] Modify coordinates
  - [ ] Check "Replace duplicates"
  - [ ] Export again
  - [ ] Verify summary: "3 replaced"

---

## QGIS Integration Testing

### 5. Connect QGIS

- [ ] **Get connection info**
  - [ ] Click "Get QGIS Connection Info" in AreasView
  - [ ] Connection URI copied to clipboard

- [ ] **Open QGIS**

- [ ] **Add PostGIS connection**
  - [ ] Layer → Add Layer → Add PostGIS Layers
  - [ ] Click "New"
  - [ ] Enter connection details
  - [ ] Test connection (should succeed)
  - [ ] Click OK

- [ ] **Load features layer**
  - [ ] Expand SurveyPro connection
  - [ ] Find public.features
  - [ ] Click Add
  - [ ] Points appear on map

### 6. Configure Labels

- [ ] **Open layer properties**
  - [ ] Right-click layer → Properties

- [ ] **Enable labels**
  - [ ] Go to Labels tab
  - [ ] Change to "Single Labels"
  - [ ] Value: Select **`name`** from dropdown
  - [ ] Adjust text size (e.g., 10pt)
  - [ ] Click Apply

- [ ] **Verify labels display**
  - [ ] Point names visible on map
  - [ ] Labels match point names in database

### 7. Test Snapping

- [ ] **Enable snapping**
  - [ ] Settings → Snapping Options
  - [ ] Enable "All Layers" or "Active Layer"
  - [ ] Set tolerance: 0.01 meters
  - [ ] Enable "Snap to Vertex"

- [ ] **Test snapping**
  - [ ] Create new polygon layer
  - [ ] Start editing
  - [ ] Click near a point
  - [ ] Cursor should snap to point

---

## Batch Computation Testing

### 8. Create Test Polygons

- [ ] **In QGIS, create polygon layer**
  - [ ] Layer → Create Layer → New Shapefile Layer
  - [ ] Add field: `designation` (Text, 255)
  - [ ] Save layer

- [ ] **Digitize test polygon**
  - [ ] Start editing
  - [ ] Click 4 points (using snapping)
  - [ ] Right-click to finish
  - [ ] Enter designation: "Test Stand 1"
  - [ ] Save edits

- [ ] **Save to database**
  - [ ] Database → DB Manager
  - [ ] Import Layer
  - [ ] Select polygon layer
  - [ ] Import to features table

### 9. Run Batch Computation

- [ ] **In AreasView, batch section**
  - [ ] Select coordinate list layer
  - [ ] Select polygon layer
  - [ ] Set tolerance: 0.001
  - [ ] Check "Save results to properties"

- [ ] **Click "Compute All Areas"**

- [ ] **Verify results**
  - [ ] Summary shows: Total, Success, Failed
  - [ ] Table shows: Status, Designation, Area, Centroid, Closure Error
  - [ ] All polygons computed successfully
  - [ ] Closure errors < 0.5m (green)

### 10. Export Results

- [ ] **Export CSV**
  - [ ] Click "Export Results CSV"
  - [ ] File downloads
  - [ ] Open in Excel/spreadsheet
  - [ ] Verify data correct

- [ ] **Generate PDF** (when implemented)
  - [ ] Click "Generate PDF Report"
  - [ ] PDF generated
  - [ ] Contains all calculation sheets

---

## Performance Testing

### 11. Benchmark Export Speed

- [ ] **Export 10 points**
  - [ ] Time: < 100ms

- [ ] **Export 100 points**
  - [ ] Time: < 500ms

- [ ] **Export 1000 points**
  - [ ] Time: < 2000ms

### 12. Benchmark Duplicate Detection

- [ ] **Re-export 100 points (skip mode)**
  - [ ] Time: < 500ms
  - [ ] All skipped correctly

- [ ] **Re-export 100 points (replace mode)**
  - [ ] Time: < 1000ms
  - [ ] All replaced correctly

### 13. Benchmark QGIS Performance

- [ ] **Load 1000+ points**
  - [ ] Labels render smoothly
  - [ ] Pan/zoom no lag

- [ ] **Search by name**
  - [ ] Attribute table search
  - [ ] Results instant (< 100ms)

---

## Edge Cases & Error Handling

### 14. Test Error Scenarios

- [ ] **Export with no points**
  - [ ] Error: "No valid points to export"
  - [ ] Helpful message displayed

- [ ] **Export with invalid coordinates**
  - [ ] Points with empty Y/X skipped
  - [ ] Valid points exported

- [ ] **Batch compute with unmatched vertices**
  - [ ] Error reported for polygon
  - [ ] Shows: "X vertices not found"
  - [ ] Other polygons computed successfully

- [ ] **Batch compute with invalid geometry**
  - [ ] Error: "Less than 3 vertices"
  - [ ] Other polygons computed successfully

### 15. Test Rollback

- [ ] **Run undo migration**
  ```bash
  npm run migrate:undo
  ```

- [ ] **Verify rollback**
  ```sql
  -- name column should be gone
  \d features
  ```

- [ ] **Re-run migration**
  ```bash
  npm run migrate
  ```

- [ ] **Verify re-migration works**

---

## Documentation Review

### 16. Verify Documentation

- [ ] **BATCH_AREA_COMPUTATION_GUIDE.md**
  - [ ] Updated with new features
  - [ ] QGIS setup instructions correct
  - [ ] Workflow steps accurate

- [ ] **SETUP_MIGRATION_016.md**
  - [ ] All steps clear
  - [ ] Commands correct
  - [ ] Troubleshooting helpful

- [ ] **QGIS_WORKFLOW_DIAGRAM.md**
  - [ ] Diagrams accurate
  - [ ] Data flow clear
  - [ ] Performance numbers realistic

- [ ] **016.README.md**
  - [ ] Technical details correct
  - [ ] Code examples work
  - [ ] Testing scenarios valid

---

## Production Readiness

### 17. Pre-Production Checks

- [ ] **Database backup created**

- [ ] **All tests passed**

- [ ] **Performance acceptable**

- [ ] **Error handling works**

- [ ] **Documentation complete**

- [ ] **Team trained on new features**

### 18. Production Deployment

- [ ] **Schedule maintenance window**

- [ ] **Notify users of downtime**

- [ ] **Run migration on production**
  ```bash
  cd app-backend
  NODE_ENV=production npm run migrate
  ```

- [ ] **Verify production migration**

- [ ] **Restart production server**

- [ ] **Smoke test production**
  - [ ] Export points
  - [ ] Load in QGIS
  - [ ] Verify labels
  - [ ] Run batch computation

- [ ] **Monitor logs for errors**

- [ ] **Notify users of completion**

---

## Post-Implementation

### 19. Monitor & Support

- [ ] **Monitor error logs** (first 24 hours)

- [ ] **Check database performance**
  ```sql
  -- Check index usage
  SELECT schemaname, tablename, indexname, idx_scan 
  FROM pg_stat_user_indexes 
  WHERE tablename = 'features';
  ```

- [ ] **Gather user feedback**

- [ ] **Document any issues**

### 20. Optimization (if needed)

- [ ] **Analyze slow queries**
  ```sql
  SELECT * FROM pg_stat_statements 
  WHERE query LIKE '%features%' 
  ORDER BY total_time DESC 
  LIMIT 10;
  ```

- [ ] **Add additional indexes if needed**

- [ ] **Tune PostgreSQL settings**

---

## Success Criteria

✅ **Migration is successful when:**

1. **Database**
   - [ ] `name` column exists and populated
   - [ ] Indexes created and used
   - [ ] No data loss
   - [ ] Performance improved

2. **Backend**
   - [ ] Batch endpoint works
   - [ ] Duplicate detection accurate
   - [ ] Error handling robust
   - [ ] Response times acceptable

3. **Frontend**
   - [ ] Export UI functional
   - [ ] Duplicate handling works
   - [ ] Results display correctly
   - [ ] No console errors

4. **QGIS**
   - [ ] Connection works
   - [ ] Labels display easily
   - [ ] Snapping works
   - [ ] Performance good

5. **Workflow**
   - [ ] End-to-end workflow works
   - [ ] Export → QGIS → Compute → Results
   - [ ] No manual workarounds needed
   - [ ] Users satisfied

---

## Rollback Plan

If critical issues occur:

1. **Stop backend server**
2. **Restore database backup**
   ```bash
   psql -U postgres surveypro < backup_before_migration_016.sql
   ```
3. **Undo migration**
   ```bash
   npm run migrate:undo
   ```
4. **Restart server**
5. **Notify users**
6. **Investigate issues**
7. **Fix and re-deploy**

---

## Sign-Off

- [ ] **Developer**: Implementation complete and tested
- [ ] **QA**: All tests passed
- [ ] **Product Owner**: Features meet requirements
- [ ] **Users**: Training complete and satisfied

**Date**: _______________

**Signed**: _______________

---

## Notes

Use this space to document any issues, observations, or improvements:

```
[Your notes here]
```

---

🎉 **Congratulations!** Migration 016 is complete and production-ready!
