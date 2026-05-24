# CSV Re-import with Smart Merge - Deployment Guide

**Date:** November 19, 2024  
**Status:** Ready for Deployment

## 🚀 Quick Start

### Step 1: Run Database Migration

```bash
cd app-backend
npm run migrate
```

**Expected Output:**
```
Running migrations...
✓ Migrations tracking table ready
✓ Found X previously applied migrations
→ Applying migration: 020_csv_import_tracking.do.sql
✓ Applied 020_csv_import_tracking.do.sql
✓ Successfully applied 1 new migration(s)
```

### Step 2: Restart Backend Server

```bash
cd app-backend
npm run dev
```

**Verify:**
- Server starts without errors
- New routes registered: `/api/csv-imports`
- Check logs for: `✅ Registered route: /api (csvImports.js)`

### Step 3: Start Frontend

```bash
cd app-frontend
npm run dev
```

**Verify:**
- No compilation errors
- New components load: `CSVReimportDialog.vue`, `MergeAnalysisDialog.vue`
- Service imports work: `csvImports.ts`

---

## 📋 Pre-Deployment Checklist

### Database
- [ ] Backup production database
- [ ] Test migration on staging database
- [ ] Verify all tables created successfully
- [ ] Check indexes created
- [ ] Verify triggers and functions work

### Backend
- [ ] `csvImports.js` route file exists
- [ ] All endpoints respond correctly
- [ ] Error handling works
- [ ] Transaction rollback works on failure
- [ ] API authentication enabled

### Frontend
- [ ] `csvImports.ts` service compiles
- [ ] Dialog components render
- [ ] Integration with CadastralStandardView complete
- [ ] No TypeScript errors (except pre-existing)
- [ ] Build succeeds: `npm run build`

---

## 🧪 Testing Guide

### Test 1: First-Time CSV Import

**Steps:**
1. Open Cadastral Standard module
2. Select a project
3. Import a CSV file (e.g., 542 points)
4. Verify import record created in database

**SQL Verification:**
```sql
SELECT * FROM project_csv_imports 
WHERE project_id = [YOUR_PROJECT_ID]
ORDER BY import_date DESC LIMIT 1;
```

**Expected:**
- Import record exists
- `csv_hash` populated
- `point_count` matches CSV
- `has_generated_documents` = FALSE initially

---

### Test 2: Re-import Detection

**Steps:**
1. With existing import, try to import same/different CSV
2. Verify dialog appears with 4 options
3. Check existing import details displayed correctly

**Expected Dialog:**
```
⚠️ CSV Data Already Exists for This Project

Previous Import:
• Date: [timestamp]
• Points: [count]
• Documents Generated: ✅/❌
• Land Parcels: ✅ X parcels / ❌ None

Options:
○ Use Previous Import
○ Append New Points
○ Replace with Smart Merge
○ Complete Replacement
```

---

### Test 3: Use Previous Import

**Steps:**
1. Select "Use Previous Import"
2. Click Continue

**Expected:**
- Dialog closes
- No changes to database
- Alert: "Using previous CSV import. No changes made."

---

### Test 4: Append New Points

**Steps:**
1. Import CSV with some new points
2. Select "Append New Points"
3. Click Continue

**Expected:**
- New points added to existing
- Duplicate IDs skipped
- Workflow restarts from Field Book
- All documents regenerated

---

### Test 5: Smart Merge - 100% Match

**Steps:**
1. Import identical CSV (same coordinates)
2. Select "Replace with Smart Merge"
3. Review analysis

**Expected Analysis:**
```
Point Matching (tolerance: 0.01m):
• ✅ Matched: [all points]
• ➕ New: 0
• ❌ Removed: 0

Land Parcel Impact:
• ✅ Fully Matched: [all parcels]
• ⚠️ Partially Matched: 0
• ❌ Orphaned: 0
```

---

### Test 6: Smart Merge - Partial Match

**Steps:**
1. Import CSV with some coordinate changes
2. Select "Replace with Smart Merge"
3. Review analysis
4. Set actions for partial parcels
5. Proceed with merge

**Expected:**
- Matched points updated
- New points added
- Removed points tracked in history
- Partial parcels handled per user choice
- Orphaned parcels marked as 'orphaned'

**SQL Verification:**
```sql
-- Check point history
SELECT * FROM coordinate_point_history 
WHERE import_id = [NEW_IMPORT_ID]
ORDER BY created_at DESC;

-- Check parcel status
SELECT designation, parcel_status 
FROM land_parcels 
WHERE project_id = [PROJECT_ID];
```

---

### Test 7: Complete Replacement

**Steps:**
1. Import new CSV
2. Select "Complete Replacement"
3. Confirm warning dialog
4. Verify all old data deleted

**Expected:**
- Warning dialog with counts
- Confirmation required
- All old points deleted
- All old parcels deleted
- New import processed
- Workflow restarts

---

## 🔍 End-to-End Test Scenario

### Scenario: Survey Update with Parcel Preservation

**Initial State:**
- Project: "Elon Estates Gwelo"
- CSV Import: 542 points
- Parcels: 12 digitized stands
- Documents: Field Book, Calculations generated

**Action: Import Updated CSV**
- 538 points match (within 0.01m tolerance)
- 4 new points added
- 0 points removed
- 10 parcels fully matched (all vertices match)
- 2 parcels partially matched (1 vertex changed)
- 0 parcels orphaned

**User Decisions:**
- Parcel "Stand 123" (partial): Keep as-is
- Parcel "Stand 456" (partial): Mark for review

**Expected Result:**
- 538 matched points updated with new coordinates
- 4 new points added
- 10 parcels retained (status: active)
- 1 parcel kept (status: active)
- 1 parcel marked (status: pending_review)
- Field Book regenerated with 542 points
- Calculations regenerated
- Coordinate List regenerated
- Workflow advances to Area Computation

**Verification:**
```sql
-- Import record
SELECT * FROM project_csv_imports WHERE id = [NEW_IMPORT_ID];

-- Point history
SELECT action, COUNT(*) 
FROM coordinate_point_history 
WHERE import_id = [NEW_IMPORT_ID]
GROUP BY action;
-- Expected: matched: 538, created: 4

-- Parcel status
SELECT parcel_status, COUNT(*) 
FROM land_parcels 
WHERE project_id = [PROJECT_ID]
GROUP BY parcel_status;
-- Expected: active: 11, pending_review: 1
```

---

## 🐛 Troubleshooting

### Issue: Migration Fails

**Symptoms:**
- Error during `npm run migrate`
- Tables not created

**Solutions:**
1. Check PostgreSQL connection
2. Verify user has CREATE TABLE permissions
3. Check for naming conflicts
4. Review migration logs

**Manual Migration:**
```sql
-- Connect to database
psql -U [username] -d [database]

-- Run migration manually
\i app-backend/migrations/020_csv_import_tracking.do.sql
```

---

### Issue: Duplicate Import Error (409)

**Symptoms:**
- "This CSV file has already been imported"
- 409 Conflict response

**Cause:**
- Exact same CSV content (SHA256 hash match)

**Solutions:**
1. Use "Use Previous Import" option
2. Modify CSV slightly if truly different
3. Delete old import record if test data

---

### Issue: Merge Analysis Fails

**Symptoms:**
- Error during smart merge analysis
- Empty analysis results

**Debugging:**
```javascript
// Check console logs
[CSV Re-import] Analyzing smart merge...
[CSV Re-import] Merge analysis complete: {...}

// Verify API response
GET /api/csv-imports/analyze-merge
{
  "data": {
    "matched": [...],
    "newPoints": [...],
    "removedPoints": [...],
    "parcelAnalysis": {...}
  }
}
```

**Solutions:**
1. Check tolerance value (default 0.01m)
2. Verify coordinate format (Y, X)
3. Check for NULL coordinates
4. Review backend logs

---

### Issue: Parcels Not Preserved

**Symptoms:**
- Fully matched parcels marked as orphaned
- Incorrect parcel analysis

**Debugging:**
```sql
-- Check parcel vertices
SELECT id, designation, ST_AsText(geom) 
FROM land_parcels 
WHERE project_id = [PROJECT_ID];

-- Check coordinate points
SELECT name, ST_Y(geom) as y, ST_X(geom) as x 
FROM coordinate_points 
WHERE project_id = [PROJECT_ID];
```

**Solutions:**
1. Verify tolerance setting
2. Check coordinate precision
3. Review vertex matching logic
4. Increase tolerance if needed

---

## 📊 Performance Monitoring

### Metrics to Track

1. **Import Time:**
   - First import: ~2-3 seconds
   - Re-import detection: ~500ms
   - Merge analysis: ~1-2 seconds (500 points)
   - Merge execution: ~3-5 seconds

2. **Database Queries:**
   - Import record creation: 1 query
   - Point matching: 1 query per point
   - Parcel analysis: 1 query per parcel
   - Merge execution: Transaction with multiple queries

3. **Memory Usage:**
   - CSV content stored in memory during processing
   - Analysis results cached temporarily
   - Cleared after merge completion

### Optimization Tips

1. **Large Datasets (>1000 points):**
   - Consider batch processing
   - Add progress indicators
   - Implement pagination for results

2. **Many Parcels (>50):**
   - Cache parcel geometries
   - Parallel vertex matching
   - Optimize PostGIS queries

3. **Frequent Re-imports:**
   - Add import history cleanup
   - Archive old imports
   - Implement retention policy

---

## 🔒 Security Considerations

### Authentication
- All endpoints require valid JWT
- User can only access own projects
- Import records linked to user ID

### Authorization
- Project ownership verified
- Parcel access controlled
- History audit trail maintained

### Input Validation
- CSV content sanitized
- File size limits enforced
- SQL injection prevented (parameterized queries)
- XSS prevention (escaped output)

### Data Protection
- Import records include user ID
- Deletion cascades properly
- Backup before major operations
- Transaction rollback on errors

---

## 📝 User Acceptance Testing (UAT)

### UAT Scenario 1: Survey Revision

**User Story:**
"As a land surveyor, I need to update coordinates after a resurvey while preserving existing parcel boundaries."

**Test Steps:**
1. Import original survey CSV (Day 1)
2. Digitize 10 parcels in QGIS
3. Compute areas for all parcels
4. Generate comprehensive document
5. Perform resurvey with improved accuracy
6. Import updated CSV (Day 2)
7. Select "Smart Merge"
8. Review analysis showing 95% match
9. Keep all fully matched parcels
10. Review partially matched parcels
11. Proceed with merge
12. Verify parcels preserved
13. Regenerate documents

**Success Criteria:**
- ✅ All fully matched parcels retained
- ✅ Partial parcels reviewed and decided
- ✅ Documents regenerated correctly
- ✅ No data loss
- ✅ Audit trail maintained

---

### UAT Scenario 2: Project Continuation

**User Story:**
"As a surveyor, I need to continue working on a project after a break without re-importing data."

**Test Steps:**
1. Open project after 1 week
2. Attempt to import CSV
3. See "Use Previous Import" option
4. Select and continue
5. Verify all data intact

**Success Criteria:**
- ✅ Previous import detected
- ✅ Option to use existing data
- ✅ No unnecessary re-processing
- ✅ Workflow state preserved

---

### UAT Scenario 3: Error Recovery

**User Story:**
"As a surveyor, I need to recover if I accidentally import wrong CSV."

**Test Steps:**
1. Import correct CSV
2. Digitize parcels
3. Accidentally import wrong CSV
4. See warning about data loss
5. Cancel import
6. Verify original data intact

**Success Criteria:**
- ✅ Clear warnings displayed
- ✅ Ability to cancel
- ✅ No data changed on cancel
- ✅ Can retry with correct file

---

## 🎯 Success Metrics

### Deployment Success
- ✅ Migration runs without errors
- ✅ All endpoints respond correctly
- ✅ UI components render properly
- ✅ No console errors
- ✅ All tests pass

### User Adoption
- ✅ Users understand 4 options
- ✅ Smart merge preferred for updates
- ✅ Parcel preservation works
- ✅ Positive user feedback
- ✅ Reduced support tickets

### System Performance
- ✅ Import time < 5 seconds
- ✅ Analysis time < 3 seconds
- ✅ Merge execution < 10 seconds
- ✅ No database locks
- ✅ Memory usage stable

---

## 📞 Support

### Common User Questions

**Q: What happens to my parcels if I re-import?**
A: With Smart Merge, parcels are analyzed. Fully matched parcels are automatically retained. You decide what to do with partial matches.

**Q: Can I undo a merge?**
A: Not currently. Always backup before major operations. Future: Implement rollback feature.

**Q: Why is my CSV rejected as duplicate?**
A: The exact same CSV content was imported before. Use "Use Previous Import" or modify the CSV if it's truly different.

**Q: What tolerance should I use?**
A: Default 0.01m (1cm) works for most surveys. Increase for lower precision surveys, decrease for high-precision work.

---

## 🚀 Next Steps

### Phase 3 Enhancements
1. Visual diff view (map showing changes)
2. Undo/rollback functionality
3. Batch operations
4. Advanced matching algorithms
5. Email notifications
6. Detailed audit reports

### Monitoring
1. Set up error tracking (Sentry)
2. Add performance monitoring
3. Track user adoption metrics
4. Monitor database growth
5. Review logs regularly

---

## ✅ Deployment Checklist

- [ ] Database backup created
- [ ] Migration tested on staging
- [ ] Backend tests pass
- [ ] Frontend builds successfully
- [ ] UAT scenarios completed
- [ ] Documentation reviewed
- [ ] Support team trained
- [ ] Rollback plan ready
- [ ] Monitoring configured
- [ ] Users notified of new feature

---

**Status:** ✅ Ready for Production Deployment

**Deployment Date:** [To be scheduled]

**Deployed By:** [Name]

**Sign-off:** [Stakeholder approval]
