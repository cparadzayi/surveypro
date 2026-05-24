# Testing Guide - Batch Area Computation UI

## Overview

The batch area computation UI is located in **AreasView** (`/modules/lite/areas`), not Areas2View. Here's how to test it.

---

## UI Location

**URL**: `http://localhost:5173/modules/lite/areas`

**Section**: "🚀 Batch Area Computation (QGIS Workflow)" - Blue panel below the "Load Lines/Polygons" section

---

## Visual Guide to the UI

```
┌─────────────────────────────────────────────────────────────────┐
│ Areas (Shoelace, ZIM P(Y,X))                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Input Mode: [Ad-hoc Points ▼]  [Add Point]  [+3 rows]         │
│                                                                 │
│ ┌─ Load Lines/Polygons ────────────────────────────────────┐   │
│ │ [Select project... ▼]  [Select layer... ▼]  [Fetch]     │   │
│ └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│ ┌─ 🚀 Batch Area Computation (QGIS Workflow) ──────────────┐   │
│ │                                    [Show Instructions]    │   │
│ │                                                           │   │
│ │ ┌─ Coordinate List ──┐  ┌─ Polygon Layer ──────────────┐│   │
│ │ │ Layer: [Select...▼]│  │ Layer: [Select...▼]          ││   │
│ │ │                    │  │                              ││   │
│ │ │ [Export Current    │  │ [Compute All Areas]          ││   │
│ │ │  Points to DB      │  │                              ││   │
│ │ │  (0 points)]       │  │                              ││   │
│ │ └────────────────────┘  └──────────────────────────────┘│   │
│ │                                                           │   │
│ │ Tolerance (m): [0.001]                                    │   │
│ │ ☑ Save results to polygon properties                     │   │
│ │ ☐ Replace duplicates on export                           │   │
│ └───────────────────────────────────────────────────────────┘   │
│                                                                 │
│ ┌─ Points Table ────────────────────────────────────────────┐   │
│ │ #  │ Point │ Y (westing) │ X (southing) │               │   │
│ │ 1  │       │             │              │ [×]           │   │
│ └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Testing

### Test 1: Verify UI Elements Exist

**Steps:**
1. Start backend: `cd app-backend && npm run dev`
2. Start frontend: `cd app-frontend && npm run dev`
3. Open browser: `http://localhost:5173/modules/lite/areas`
4. Scroll down to find the blue panel

**Expected UI Elements:**
- [ ] Blue panel with "🚀 Batch Area Computation (QGIS Workflow)" header
- [ ] "Show Instructions" button
- [ ] Two layer selectors (Coordinate List, Polygon Layer)
- [ ] "Export Current Points to DB (X points)" button
- [ ] "Compute All Areas" button
- [ ] Tolerance input field (default: 0.001)
- [ ] Two checkboxes:
  - [ ] "Save results to polygon properties"
  - [ ] "Replace duplicates on export"

### Test 2: Instructions Panel

**Steps:**
1. Click "Show Instructions" button

**Expected:**
- [ ] Instructions panel expands
- [ ] Shows 6-step workflow
- [ ] "Get QGIS Connection Info" button visible
- [ ] Click "Hide Instructions" - panel collapses

### Test 3: Export Points (Empty State)

**Steps:**
1. Don't add any points
2. Select a coordinate list layer
3. Click "Export Current Points to DB (0 points)"

**Expected:**
- [ ] Alert shows: "No valid points to export"
- [ ] Alert includes helpful instructions
- [ ] No API call made

### Test 4: Export Points (With Data)

**Steps:**
1. Click "Add Point" 3 times
2. Enter test data:
   - Point A: Y=123.45, X=678.90
   - Point B: Y=124.50, X=679.20
   - Point C: Y=125.00, X=680.00
3. Select/create a coordinate list layer
4. Click "Export Current Points to DB (3 points)"

**Expected:**
- [ ] Button shows "(3 points)"
- [ ] Button is enabled (not grayed out)
- [ ] After click: Alert shows "Export complete: 3 created"
- [ ] Console log shows export details

**Check Console:**
```javascript
// Should see:
Export details: [
  {name: "A", status: "created", id: 123},
  {name: "B", status: "created", id: 124},
  {name: "C", status: "created", id: 125}
]
```

### Test 5: Export Duplicate Points (Skip Mode)

**Steps:**
1. Keep the same 3 points
2. **Uncheck** "Replace duplicates on export"
3. Click "Export Current Points to DB (3 points)" again

**Expected:**
- [ ] Alert shows: "Export complete: 3 skipped (duplicates)"
- [ ] Console shows all points skipped

### Test 6: Export Duplicate Points (Replace Mode)

**Steps:**
1. Modify coordinates:
   - Point A: Y=123.46, X=678.91
2. **Check** "Replace duplicates on export"
3. Click "Export Current Points to DB (3 points)"

**Expected:**
- [ ] Alert shows: "Export complete: 3 replaced"
- [ ] Console shows all points replaced

### Test 7: QGIS Connection Info

**Steps:**
1. Click "Show Instructions"
2. Click "Get QGIS Connection Info"

**Expected:**
- [ ] Alert dialog appears with connection details
- [ ] Shows: Host, Port, Database, Username
- [ ] Shows connection URI
- [ ] Shows setup instructions
- [ ] Connection URI copied to clipboard
- [ ] Console log: "Connection URI copied to clipboard"

### Test 8: Batch Computation (No Layers)

**Steps:**
1. Don't select any layers
2. Try to click "Compute All Areas"

**Expected:**
- [ ] Button is disabled (grayed out)
- [ ] Cannot click

### Test 9: Batch Computation (With Layers)

**Prerequisites:**
- Coordinate list layer with points in database
- Polygon layer with polygons in database (created in QGIS)

**Steps:**
1. Select coordinate list layer
2. Select polygon layer
3. Set tolerance: 0.001
4. Check "Save results to polygon properties"
5. Click "Compute All Areas"

**Expected:**
- [ ] Button is enabled
- [ ] After click: Processing starts
- [ ] Results panel appears below
- [ ] Shows summary cards: Total, Success, Failed
- [ ] Shows detailed results table
- [ ] Table columns: Status, Designation, Area, Centroid, Closure Error, Vertices

### Test 10: Results Display

**Expected Results Panel:**
```
┌─ Batch Computation Results ─────────────────────────────── [× Close] ┐
│                                                                       │
│ ┌─ Total: 25 ─┐  ┌─ Success: 23 ─┐  ┌─ Failed: 2 ─┐                │
│ │      25      │  │      23       │  │      2      │                │
│ └──────────────┘  └───────────────┘  └─────────────┘                │
│                                                                       │
│ ┌─ Results Table ───────────────────────────────────────────────┐   │
│ │ Status │ Designation │ Area      │ Centroid    │ Closure │ ... │   │
│ │   ✓    │ Stand 2344  │ 0.1250 ha │ 123.45, ... │ 0.023 m │ ... │   │
│ │   ✓    │ Stand 2345  │ 1250 m²   │ 124.50, ... │ 0.015 m │ ... │   │
│ │   ✗    │ Stand 2346  │ Error     │             │         │ ... │   │
│ └───────────────────────────────────────────────────────────────┘   │
│                                                                       │
│ [Export Results CSV]  [Generate PDF Report]                          │
└───────────────────────────────────────────────────────────────────────┘
```

**Verify:**
- [ ] Summary cards show correct counts
- [ ] Success rows have green checkmark (✓)
- [ ] Failed rows have red X (✗) and error message
- [ ] Areas display in correct units (m² or ha)
- [ ] Closure errors color-coded (green < 0.5m, amber ≥ 0.5m)
- [ ] Vertex names shown for successful polygons

### Test 11: Export Results CSV

**Steps:**
1. After batch computation completes
2. Click "Export Results CSV"

**Expected:**
- [ ] CSV file downloads
- [ ] Filename: `batch-area-results.csv`
- [ ] Open in Excel/spreadsheet
- [ ] Columns: Designation, Status, Area, Unit, Centroid_Y, Centroid_X, Closure_Error_m, Vertices, Error
- [ ] Data matches results table

### Test 12: Generate PDF (Placeholder)

**Steps:**
1. Click "Generate PDF Report"

**Expected:**
- [ ] Alert: "PDF generation will be implemented next..."
- [ ] No error
- [ ] Button disabled if no successful results

---

## Browser Console Testing

### Check for Errors

**Open Console:** Press F12 → Console tab

**Expected:**
- [ ] No red errors
- [ ] No warnings about missing functions
- [ ] Export logs show correct data structure

### Test API Calls

**Network Tab:** F12 → Network tab

**Export Points:**
- [ ] POST request to `/api/spatial/layers/:id/features/batch`
- [ ] Request body contains features array
- [ ] Response shows created/skipped/replaced counts

**Batch Computation:**
- [ ] POST request to `/api/compute/area/batch`
- [ ] Request body contains layer IDs and tolerance
- [ ] Response shows results array

---

## Database Verification

### Check Exported Points

```sql
-- Check if points were created
SELECT id, name, layer_id, 
       geometry->>'coordinates' as coords,
       properties->>'system' as system
FROM features
WHERE layer_id = YOUR_LAYER_ID
  AND properties->>'exported_from' = 'AreasView'
ORDER BY created_at DESC
LIMIT 10;
```

**Expected:**
- [ ] Points exist with correct names
- [ ] `name` column populated (not NULL)
- [ ] Coordinates match input
- [ ] `properties` contains system: 'ZIM_P(Y,X)'

### Check Duplicate Detection

```sql
-- Check for duplicates
SELECT name, COUNT(*) as count
FROM features
WHERE layer_id = YOUR_LAYER_ID
GROUP BY name
HAVING COUNT(*) > 1;
```

**Expected:**
- [ ] No duplicates (count = 0 rows)

---

## Common Issues & Solutions

### Issue 1: Button Shows "(0 points)"
**Cause:** No valid points in table
**Solution:** Add points or load from layer

### Issue 2: "Export Current Points to DB" Button Disabled
**Cause:** No layer selected OR no valid points
**Solution:** Select layer AND add points

### Issue 3: "Compute All Areas" Button Disabled
**Cause:** Missing coordinate list layer OR polygon layer
**Solution:** Select both layers

### Issue 4: Export Shows "0 created, 0 skipped"
**Cause:** Points have empty Y/X values
**Solution:** Verify coordinates are entered correctly

### Issue 5: Batch Computation Shows All Failed
**Cause:** Vertices don't match coordinate list (tolerance too strict)
**Solution:** Increase tolerance (e.g., 0.01m) or verify coordinates

### Issue 6: Results Panel Doesn't Appear
**Cause:** JavaScript error or API failure
**Solution:** Check browser console for errors

---

## Performance Benchmarks

### Export Speed
- [ ] 10 points: < 100ms
- [ ] 100 points: < 500ms
- [ ] 1000 points: < 2000ms

### Batch Computation
- [ ] 10 polygons: < 1 second
- [ ] 100 polygons: < 5 seconds
- [ ] 1000 polygons: < 30 seconds

---

## Screenshots to Take

For documentation:
1. [ ] Empty UI state
2. [ ] Instructions panel expanded
3. [ ] Export button with point count
4. [ ] Export success alert
5. [ ] Duplicate detection alert
6. [ ] QGIS connection info dialog
7. [ ] Batch computation results panel
8. [ ] Results table with mixed success/failure
9. [ ] CSV export file in Excel
10. [ ] QGIS with labeled points

---

## Testing Checklist Summary

- [ ] All UI elements visible
- [ ] Instructions panel works
- [ ] Export shows point count
- [ ] Export creates points in database
- [ ] Duplicate detection works (skip mode)
- [ ] Duplicate detection works (replace mode)
- [ ] QGIS connection info displays
- [ ] Batch computation button enables/disables correctly
- [ ] Batch computation processes polygons
- [ ] Results panel displays correctly
- [ ] CSV export works
- [ ] No console errors
- [ ] Database records correct
- [ ] Performance acceptable

---

## Next Steps After Testing

1. **If all tests pass:**
   - Document any observations
   - Take screenshots for user guide
   - Deploy to production

2. **If tests fail:**
   - Note which test failed
   - Check console errors
   - Review database logs
   - Report issue with details

3. **Improvements needed:**
   - Better error messages?
   - UI tweaks?
   - Performance optimization?
   - Additional features?

---

## Support

**Documentation:**
- `BATCH_AREA_COMPUTATION_GUIDE.md` - User workflow
- `SETUP_MIGRATION_016.md` - Setup instructions
- `IMPLEMENTATION_CHECKLIST.md` - Deployment checklist

**Logs to Check:**
- Browser console (F12)
- Backend terminal output
- PostgreSQL logs

**Database Queries:**
See "Database Verification" section above

---

🧪 **Happy Testing!**

Report any issues with:
- Test number that failed
- Expected vs actual behavior
- Console error messages
- Screenshots if applicable
