# Area Computation Module - Test Plan

## 🎯 Test Objective
Verify the complete Area Computation workflow including polygon digitization, area calculation, database saving, and PDF report generation.

---

## 📋 Pre-Test Checklist

### Backend Server
```bash
cd app-backend
npm start
# Expected: Server running on http://localhost:3050
```

### Frontend Server
```bash
cd app-frontend
npm run dev
# Expected: Server running on http://localhost:5173
```

### Database
- ✅ PostgreSQL running
- ✅ PostGIS extension enabled
- ✅ `land_parcels` table exists

### Test Data
Use the provided `test-coordinates.csv` file with 10 survey points.

---

## 🧪 Test Cases

### **TEST 1: Map Initialization & Zoom**

**Objective:** Verify map loads correctly and points are visible

**Steps:**
1. Login to SurveyPro
2. Navigate to Cadastral Standard workflow
3. Import `test-coordinates.csv`
4. Complete Field Book → Calculations Part 1 → Coordinate List
5. Navigate to **Area Computation** step

**Expected Results:**
- ✅ Map loads with white background
- ✅ 10 blue survey points visible
- ✅ Points are clearly visible (not tiny dots)
- ✅ Map automatically zoomed to show all points
- ✅ Point labels show IDs (ST1, ST2, P1, P2, etc.)
- ✅ Statistics show: "Survey Points: 10"
- ✅ Projection shows: "Lo 31°"

**Screenshot Location:** Take screenshot showing all points clearly visible

---

### **TEST 2: Map Controls & Navigation**

**Objective:** Verify zoom controls work properly

**Steps:**
1. Click **"+ (Zoom In)"** button 3 times
2. Verify points are closer and still visible
3. Click **"- (Zoom Out)"** button 2 times
4. Use mouse wheel to zoom in/out
5. Click **"Fit View"** button

**Expected Results:**
- ✅ Zoom in: Points get larger, can see details
- ✅ Zoom out: Can see broader context
- ✅ Min zoom level: 8 (prevents zooming out too far)
- ✅ Max zoom level: 20 (allows very close inspection)
- ✅ "Fit View" recenters all points with padding
- ✅ Smooth zoom transitions (0.5 increments)

**Pass Criteria:** User can easily navigate and see all points clearly

---

### **TEST 3: Label Toggle**

**Objective:** Verify label visibility toggle

**Steps:**
1. Observe labels are ON by default
2. Click **"✓ Labels"** button to toggle OFF
3. Click **"✓ Labels"** button to toggle ON

**Expected Results:**
- ✅ Labels initially visible on all points
- ✅ Toggle OFF: Labels disappear, points remain
- ✅ Toggle ON: Labels reappear
- ✅ Button changes color to indicate state

---

### **TEST 4: Draw Polygon Method**

**Objective:** Create a parcel by drawing on the map

**Steps:**
1. Click **"✏️ Draw Polygon"** button
2. Yellow instruction banner appears
3. Click on point **ST1**
4. Click on point **ST2**
5. Click on point **P2**
6. Click on point **P1**
7. Press **ESC** key to finish
8. Enter designation: **"LOT 1"**
9. Click **OK**

**Expected Results:**
- ✅ Drawing mode activated (yellow banner shows)
- ✅ Each click adds a point with temporary red marker
- ✅ Line connects points as drawn
- ✅ Preview polygon shows filled semi-transparent
- ✅ ESC finishes drawing
- ✅ Prompt for designation appears
- ✅ After OK: Polygon turns blue, area computed automatically
- ✅ Statistics update: "Defined Parcels: 1"
- ✅ Area displays in card (e.g., "15234.56 m²" or "1.5235 ha")
- ✅ Parcel appears in results list below

**Data to Record:**
- Parcel ID: LOT 1
- Number of points: 4
- Area (m²): _____________
- Centroid Y: _____________
- Centroid X: _____________
- Closure Error (m): _____________
- Quality: _____________

---

### **TEST 5: Manual Point Selection Method**

**Objective:** Create a parcel using the Quick Builder

**Steps:**
1. Scroll to **"Quick Parcel Builder"** section
2. Type **"ST"** in the search box
3. Click to select: **ST1**, **ST2**, **P2**
4. Verify 3 points selected
5. Enter designation: **"LOT 2"**
6. Click **"💾 Save Parcel"**

**Expected Results:**
- ✅ Search filters points (shows ST1, ST2)
- ✅ Clicking adds point to selection (turns blue)
- ✅ Selected points count shows: "(3)"
- ✅ Designation field accepts text
- ✅ Save button enabled when ≥3 points + designation
- ✅ After save: Polygon appears on map
- ✅ Area computed automatically
- ✅ Parcel added to results list
- ✅ Statistics update: "Defined Parcels: 2"

**Data to Record:**
- Parcel ID: LOT 2
- Number of points: 3
- Area (m²): _____________

---

### **TEST 6: Parcel Management**

**Objective:** Verify parcel actions work

**Steps:**
1. In results list, click **"🔍 Zoom"** on LOT 1
2. Verify map zooms to that parcel
3. Click **"🗑️ Delete"** on LOT 2
4. Confirm deletion
5. Verify parcel removed

**Expected Results:**
- ✅ Zoom: Map centers on parcel with appropriate padding
- ✅ Delete: Confirmation dialog appears
- ✅ After delete: Parcel removed from map and list
- ✅ Statistics update: "Defined Parcels: 1"
- ✅ Total area recalculated

---

### **TEST 7: Save to Database**

**Objective:** Batch save parcels to PostgreSQL

**Steps:**
1. Ensure at least 2 parcels defined
2. Click **"💾 Save to Database"** button
3. Wait for confirmation message

**Expected Results:**
- ✅ Success message: "Successfully saved X parcel(s) to database!"
- ✅ No error messages in browser console
- ✅ Parcels marked as "saved" internally

**Database Verification:**
```sql
-- Run in PostgreSQL
SELECT 
  id,
  stand,
  area_m2,
  area_ha,
  centroid_y,
  centroid_x,
  closure_error_m,
  ST_AsText(geom) as geometry,
  created_at
FROM land_parcels
WHERE project_id = YOUR_PROJECT_ID
ORDER BY id DESC;
```

**Expected Database Results:**
- ✅ Records inserted for each parcel
- ✅ `stand` matches designations (LOT 1, LOT 2)
- ✅ `area_m2` populated correctly
- ✅ `area_ha` = area_m2 / 10000
- ✅ `centroid_y`, `centroid_x` populated
- ✅ `closure_error_m` populated
- ✅ `geom` is valid PostGIS POLYGON geometry
- ✅ `area_calculated` = true

---

### **TEST 8: PDF Report Export**

**Objective:** Generate professional PDF report

**Steps:**
1. Ensure at least 2 parcels defined
2. Click **"📄 Export PDF Report"** button
3. Wait for download

**Expected Results:**
- ✅ PDF downloads automatically
- ✅ Filename format: `area_computation_ProjectName_2025-11-13.pdf`
- ✅ No errors in console

**PDF Content Verification:**

**Page 1 - Cover & Summary:**
- ✅ Title: "LAND PARCEL AREA COMPUTATION REPORT"
- ✅ Project name displayed
- ✅ Surveyor name (from workflow)
- ✅ Survey date
- ✅ Projection: "Cape Lo 31° (EPSG:22291)"
- ✅ Summary box with:
  - Total Parcels: 2
  - Total Area: X m² (Y ha)
  - Average Closure Error: Z m
  - Computation Method: "Shoelace Formula with Traverse Adjustment"

**Page 1/2 - Parcel Table:**
- ✅ Table headers: Designation, Points, Area, Closure, Quality
- ✅ LOT 1 row with all data
- ✅ LOT 2 row with all data
- ✅ Areas formatted correctly (m² or ha)
- ✅ Closure errors in meters
- ✅ Quality indicators (Excellent/Good/Fair/Poor)

**Page 2+ - Detailed Breakdowns:**
For each parcel:
- ✅ Parcel name header
- ✅ Area display
- ✅ Centroid coordinates (Y, X)
- ✅ Closure analysis (ΣdY, ΣdX, total error)
- ✅ Boundary points table:
  - Column headers: #, Point ID, Y (Westing), X (Northing)
  - All vertex coordinates listed
  - 3 decimal precision

**Last Page - Footer:**
- ✅ Signature block for Land Surveyor
- ✅ Surveyor name
- ✅ License number (if provided)
- ✅ Page numbers on each page
- ✅ Generation timestamp

---

### **TEST 9: Clear All Function**

**Objective:** Verify clear all removes all parcels

**Steps:**
1. Define 2-3 parcels
2. Click **"🗑️ Clear All"** button
3. Confirm in dialog

**Expected Results:**
- ✅ Confirmation dialog: "Delete all parcels?"
- ✅ After OK: All parcels removed from map
- ✅ Results list clears
- ✅ Statistics reset: "Defined Parcels: 0", "Total Area: 0 m²"

---

### **TEST 10: Area Computation Accuracy**

**Objective:** Verify area calculations are correct

**Test Parcel (ST1 → ST2 → P2 → P1):**

Using test data coordinates:
- ST1: Y=96800.000, X=2248000.000
- ST2: Y=96720.850, X=2248071.780
- P2: Y=96859.810, X=2248159.820
- P1: Y=96950.050, X=2248101.640

**Manual Calculation (Shoelace Formula):**
```
Area = 0.5 * |Σ(Yi * Xi+1 - Xi * Yi+1)|
```

**Expected Results:**
- ✅ Computed area matches manual calculation (±0.01 m²)
- ✅ Centroid is average of vertex coordinates
- ✅ Closure error < 0.5m (for good quality data)

---

### **TEST 11: Edge Cases**

**A. Minimum Points:**
1. Try to save parcel with only 2 points
2. **Expected:** Error message "Minimum 3 points required"

**B. No Designation:**
1. Select 3+ points but leave designation empty
2. **Expected:** Save button disabled

**C. Duplicate Designation:**
1. Create LOT 1
2. Create another LOT 1
3. **Expected:** Both saved (or warning, depending on DB constraints)

**D. Very Small Parcel:**
1. Create triangle with 3 adjacent points
2. **Expected:** Area computed, likely < 100 m²

**E. Large Parcel:**
1. Use all 10 points
2. **Expected:** Area computed, likely > 30,000 m² (3 ha)
3. Display in hectares automatically

---

## 📊 Test Results Summary

| Test Case | Status | Notes |
|-----------|--------|-------|
| 1. Map Initialization | ⬜ PASS / ❌ FAIL | |
| 2. Map Controls | ⬜ PASS / ❌ FAIL | |
| 3. Label Toggle | ⬜ PASS / ❌ FAIL | |
| 4. Draw Polygon | ⬜ PASS / ❌ FAIL | |
| 5. Manual Selection | ⬜ PASS / ❌ FAIL | |
| 6. Parcel Management | ⬜ PASS / ❌ FAIL | |
| 7. Save to Database | ⬜ PASS / ❌ FAIL | |
| 8. PDF Export | ⬜ PASS / ❌ FAIL | |
| 9. Clear All | ⬜ PASS / ❌ FAIL | |
| 10. Area Accuracy | ⬜ PASS / ❌ FAIL | |
| 11. Edge Cases | ⬜ PASS / ❌ FAIL | |

---

## 🐛 Bug Report Template

**Bug ID:** [#001, #002, etc.]
**Test Case:** [Which test case failed]
**Severity:** [Critical / High / Medium / Low]
**Description:** [What went wrong]
**Steps to Reproduce:**
1. 
2. 
3. 

**Expected Behavior:** 
**Actual Behavior:** 
**Screenshots:** [If applicable]
**Console Errors:** [Copy from browser console]
**Environment:** 
- Browser: 
- OS: 
- Frontend: http://localhost:5173
- Backend: http://localhost:3050

---

## ✅ Acceptance Criteria

Module is ready for production if:
- ✅ All 11 test cases PASS
- ✅ No critical or high severity bugs
- ✅ Map zoom allows clear visibility of all points
- ✅ Areas computed accurately (±0.01 m²)
- ✅ Database saves successfully
- ✅ PDF generates without errors
- ✅ User can complete workflow end-to-end without assistance

---

## 🚀 Quick Test Script

**5-Minute Smoke Test:**
1. Navigate to Area Computation step ✓
2. Verify 10 points visible ✓
3. Draw one polygon (4 points) ✓
4. Check area computed ✓
5. Save to database ✓
6. Export PDF ✓
7. Open PDF and verify content ✓

If all 7 steps complete successfully → **BASIC FUNCTIONALITY WORKING** ✅

---

## 📝 Notes Section

**Tester Name:** _____________________
**Test Date:** _____________________
**Build Version:** _____________________
**Overall Status:** ⬜ PASS / ❌ FAIL / ⚠️ PARTIAL

**Additional Comments:**
_____________________________________________
_____________________________________________
_____________________________________________
