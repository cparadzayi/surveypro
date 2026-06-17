# Found Beacons Component - Testing Guide

**Date:** 2025-01-21  
**Component:** `FoundBeaconsView.vue`  
**Status:** Ready for Testing

---

## ✅ Integration Complete

The Found Beacons component has been successfully integrated into the Cadastral Standard workflow!

### **Changes Made:**

1. ✅ **Type Definition** - Added `'found-beacons'` to workflow steps
2. ✅ **Workflow Steps** - Inserted Found Beacons as Step 3 (after Control Point Selection)
3. ✅ **Component Import** - Added `FoundBeaconsView` to imports
4. ✅ **Template Integration** - Added Found Beacons section to template
5. ✅ **Handler Function** - Created `handleFoundBeaconsSave()` function
6. ✅ **Computed Property** - Added `fixedPointsForBeaconAssessment` 
7. ✅ **Progress Tracking** - Updated step times (8 minutes for Found Beacons)

---

## 🧪 How to Test

### **Step 1: Start the Application**

```bash
# Terminal 1 - Backend
cd app-backend
npm run dev

# Terminal 2 - Frontend
cd app-frontend
npm run dev
```

### **Step 2: Navigate to Cadastral Standard**

1. Open browser: `http://localhost:5173`
2. Login to SurveyPro
3. Navigate to **Modules → Cadastral Standard**

### **Step 3: Import CSV with Fixed Points**

You need a CSV file with Fixed points (Status = F). Use one of these options:

#### **Option A: Use Existing Sample**
If you have `sample-survey-points-zvishavane.csv` in your project:
- It contains 2 Fixed points: MGWANI and VOMGWE

#### **Option B: Create Test CSV**
Create a file `test-beacons.csv`:

```csv
Point,Y,X,Status,Description,Date of survey
CP1,18862.52,2268555.01,F,Trig Beacon MGWANI,15/10/2025
CP2,10266.83,2275951.17,F,Trig Beacon VOMGWE,15/10/2025
CP3,25123.45,2270234.56,F,Trig Beacon HARARE,15/10/2025
P1,97556.123,2247098.456,P,50mm Iron Pipe in Concrete,15/10/2025
P2,97568.789,2247102.345,P,Wooden Peg,15/10/2025
P3,97575.234,2247115.678,P,Wooden Peg,15/10/2025
```

This gives you **3 Fixed points** and **3 Peg points** to test with.

### **Step 4: Complete CSV Import**

1. Select a surveyor
2. Select a project
3. **Select Lo zone** (e.g., Lo 29)
4. Import your CSV file
5. Click "Continue to Control Point Selection"

### **Step 5: Skip Control Point Selection** (for now)

Since Control Point Selection is optional, you can skip it:
- Just click through or navigate away
- The workflow will move to Found Beacons

### **Step 6: Test Found Beacons Component** 🎯

You should now see the **Found Beacons Assessment** screen!

#### **What You Should See:**

1. **Header:**
   - Title: "Found Beacons Assessment"
   - Subtitle: "Section 3 of Report on Survey (SI 727 of 1979)"

2. **Instructions Panel** (Blue):
   - Explanation of what to do
   - Reference to Fixed points from CSV

3. **Beacon Cards** (One for each Fixed point):
   - Beacon CP1 (MGWANI)
   - Beacon CP2 (VOMGWE)
   - Beacon CP3 (HARARE)

4. **For Each Beacon:**
   - Beacon header with name and coordinates
   - Status buttons: Found / Not Found / Replaced
   - Conditional forms based on status

5. **Summary Panel:**
   - Total beacons count
   - Found/Not Found/Replaced counts
   - Adopted count

6. **Navigation:**
   - "← Back to Control Points" button
   - "Save & Continue to Field Book →" button

---

## 🧪 Test Scenarios

### **Test 1: All Beacons Found (Happy Path)**

For each beacon:
1. Click **"✓ Found"** button
2. Select **Condition**: "Good"
3. Leave **Particular Circumstances** empty (or add text)
4. **Skip alignment test** (uncheck checkbox)
5. Check **"Beacon Position Adopted"**
6. Click **"Save & Continue"**

**Expected Result:**
- ✅ Summary shows: 3 found, 0 not found, 0 replaced
- ✅ Adopted: 3 of 3
- ✅ Button enabled
- ✅ Navigates to Field Book step

---

### **Test 2: Mixed Conditions**

**Beacon CP1 (MGWANI):**
- Status: **Found**
- Condition: **Excellent**
- Circumstances: "Found in good condition, centre-mark intact"
- Alignment Test: **Yes**
  - Line: "CP1-CP2"
  - Test Result: "Measured bearing: 45°23'15""
  - Discrepancy: 0.008
  - Acceptable: ✓
- Adopted: **Yes**

**Beacon CP2 (VOMGWE):**
- Status: **Found**
- Condition: **Fair**
- Circumstances: "Scattered stones, no centre-mark visible"
- Alignment Test: **No**
- Adopted: **Yes**

**Beacon CP3 (HARARE):**
- Status: **Not Found**
- Circumstances: "Extensive search conducted within 5m radius. Beacon not found."

**Expected Result:**
- ✅ Summary: 2 found, 1 not found, 0 replaced
- ✅ Adopted: 2 of 2
- ✅ Validation passes
- ✅ Data saved correctly

---

### **Test 3: Replaced Beacon**

**Beacon CP3:**
- Status: **Replaced**
- Reason: "Original beacon not found. New beacon placed at calculated position."
- Method: "Intersection from CP1 and CP2. Verified by RTK GPS."
- Distance from Original: 0.145

**Expected Result:**
- ✅ Summary: 2 found, 0 not found, 1 replaced
- ✅ Replacement details captured
- ✅ Validation requires reason and method

---

### **Test 4: Validation Testing**

Try to save without completing required fields:

1. **Leave a beacon status unselected**
   - Expected: Validation error "Beacon XX: Status is required"

2. **Select "Replaced" but leave reason empty**
   - Expected: Validation error "Beacon XX: Replacement reason is required"

3. **Select "Replaced" but leave method empty**
   - Expected: Validation error "Beacon XX: Method of determining new position is required"

**Expected Result:**
- ❌ Save button disabled
- ❌ Red validation panel appears
- ❌ Lists all validation errors

---

### **Test 5: Data Persistence**

1. Fill out beacon assessment
2. Click "Save & Continue"
3. Go back to Found Beacons step
4. **Expected:** All your data should still be there!

---

## 🔍 What to Check

### **UI/UX:**
- ✅ All beacons from CSV appear
- ✅ Beacon descriptions shown correctly
- ✅ Coordinates displayed (3 decimals)
- ✅ Status buttons toggle correctly
- ✅ Conditional forms show/hide based on status
- ✅ Color coding (green=found, yellow=not found, blue=replaced)
- ✅ Summary updates in real-time
- ✅ Validation messages clear and helpful

### **Functionality:**
- ✅ Can select each status type
- ✅ Can enter all field types (text, number, checkbox)
- ✅ Alignment test section shows/hides
- ✅ Validation prevents saving incomplete data
- ✅ Save button enables when valid
- ✅ Navigation works (back and forward)

### **Data Flow:**
- ✅ Fixed points extracted from CSV correctly
- ✅ Beacon data saved to `workflowState.reportOnSurvey.beacons`
- ✅ Data persists when navigating back
- ✅ Workflow advances to Field Book after save

---

## 🐛 Known Issues (Pre-existing)

The lint errors you see are **pre-existing** and not related to Found Beacons:
- Module import warnings (Vetur linter, not critical)
- Some property type mismatches in other parts of the file
- These don't affect Found Beacons functionality

---

## 📊 Console Logging

Watch the browser console for helpful messages:

```
[Found Beacons] Saving beacon assessment data: [...]
[Found Beacons] ✅ Beacon data saved. Moving to Field Book step.
```

---

## ✅ Success Criteria

The test is successful if:

1. ✅ Found Beacons step appears after Control Point Selection
2. ✅ All Fixed points from CSV are listed
3. ✅ Can assess each beacon (found/not found/replaced)
4. ✅ Can enter all required details
5. ✅ Validation works correctly
6. ✅ Summary statistics update
7. ✅ Can save and continue to Field Book
8. ✅ Data persists when navigating back
9. ✅ No console errors (except pre-existing lint warnings)

---

## 🎯 Next Steps After Testing

Once Found Beacons is working:

1. **Report on Survey View** - Build the main report component
2. **Project Setup Enhancement** - Add S.R. Number and other SI 727 fields
3. **PDF Generation** - Create SI 727 compliant PDF template
4. **End-to-end Testing** - Complete workflow from CSV to Report PDF

---

## 📞 Troubleshooting

### **Problem: Found Beacons step doesn't appear**
- **Check:** Did you import a CSV with Fixed points (Status = F)?
- **Check:** Did you complete Control Point Selection?
- **Check:** Check browser console for errors

### **Problem: No beacons shown**
- **Check:** Your CSV must have at least one point with `Status=F`
- **Check:** Verify CSV format is correct
- **Check:** Check console for `fixedPointsForBeaconAssessment` value

### **Problem: Save button stays disabled**
- **Check:** All beacons must have a status selected
- **Check:** Replaced beacons need reason and method
- **Check:** Look at validation error messages

### **Problem: Data doesn't persist**
- **Check:** Are you clicking "Save & Continue" (not just navigating away)?
- **Check:** Check `workflowState.reportOnSurvey.beacons` in Vue DevTools

---

**Ready to test!** 🚀

Start your dev servers and try it out. The Found Beacons component is fully integrated and ready for your first cadastral survey assessment!
