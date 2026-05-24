# SI 727 Title Block - Testing Guide

## 🧪 Testing with Real Project Data

### **Step 1: Access the Survey Plan View**

1. **Start the frontend:**
   ```bash
   cd app-frontend
   npm run dev
   ```

2. **Navigate to a project:**
   - Open your browser: `http://localhost:5173` (or your frontend port)
   - Select an existing project with parcels
   - Navigate to the Survey Plan view

---

### **Step 2: Verify Title Block Display**

Look for the **Title Block (SI 727)** overlay in the top-left corner of the map.

#### **Expected Structure:**

```
┌─────────────────────────────────────────┐
│ Title Block (SI 727)                  × │
├─────────────────────────────────────────┤
│                                         │
│         "GENERAL PLAN"                  │
│              of                         │
│    STANDS [X-Y] [TOWNSHIP]              │
│                                         │
│ The figure N1, N2 ............... N1    │
│ represents                              │
│ [Township] comprising [N] stands and    │
│ public places                           │
│ being the whole/the remainder/a         │
│ portion* of [Location], situate in      │
│ the district of [District].             │
│                                         │
│ Vide diagram S.G. No. ...............   │
│ annexed to ...............              │
│ No. ............................        │
│ (*Omit the inappropriate words.)        │
│                                         │
│ ─────────────────────────────────────   │
│                      [Surveyor Name]    │
│                      Lic. No: [Number]  │
│                      Date: [DD/MM/YYYY] │
│                                         │
│ Sheet: Medium | Scale: 100%             │
└─────────────────────────────────────────┘
```

---

### **Step 3: Check Console Output**

Open browser DevTools (F12) and check the Console for:

```
[SurveyPlanMap] 🚀 Component mounted
[SurveyPlanMap] Props: { projectId: X, projectInfo: {...} }
[SurveyPlanMap] 🔄 Loading data for project: X
[SurveyPlanMap] 📋 Project Info: { designation: "...", township: "...", ... }
[SurveyPlanMap] 📊 Loaded X parcels and Y points
[SurveyPlanMap] 👤 Surveyor: [Name]
[SurveyPlanMap] 📍 Location: [Designation], [Township], [District]
```

---

### **Step 4: Test Adaptive Scaling**

#### **Test 4.1: Change Sheet Size**
1. In the config panel, change **Sheet Size** dropdown
2. Select: **Small** → **Medium** → **Large**
3. **Expected:** Title block text size adjusts proportionally

**Console Output:**
```
[SurveyPlanMap] 📏 Adaptive Overlay Scaling Updated:
  Sheet Size: Small
  Map Scale: 1:1000
  Combined Factor: 85%
  Title Block: { fontSize: '10px', width: '238px' }
```

#### **Test 4.2: Change Map Scale**
1. Change **Scale** dropdown
2. Select: **1:500** → **1:1000** → **1:2500** → **1:5000**
3. **Expected:** Title block adjusts for scale

**Console Output:**
```
[SurveyPlanMap] 📏 Adaptive Overlay Scaling Updated:
  Sheet Size: Medium
  Map Scale: 1:500
  Combined Factor: 120%
  Title Block: { fontSize: '14px', width: '336px' }
```

---

### **Step 5: Test Formatting Functions**

#### **Test 5.1: Stand Designation Formatting**

**Test Cases:**

| Input | Expected Output |
|-------|----------------|
| `designation: "1-60"` | `STANDS 1-60 [TOWNSHIP]` |
| `designation: "565-594, 601-620"` | `STANDS 565-594, 601-620 [TOWNSHIP]` |
| `designation: "ALPHA, BETA, GAMMA"` | `ALPHA, BETA, GAMMA` |
| `designation: "LOTS 1-8 OF SUBDIVISION A"` | `LOTS 1-8 OF SUBDIVISION A` |

**How to Test:**
1. Check the title block designation line
2. Verify it matches the expected format
3. Check console for any errors

#### **Test 5.2: Description Line**

**Expected Format:**
```
[Township] comprising [N] stand(s) and public places
```

**Verify:**
- Parcel count is correct
- "stand" vs "stands" (singular/plural)
- Township name is displayed

#### **Test 5.3: Location Line**

**Expected Format:**
```
being the whole/the remainder/a portion* of [Subdivision]
of [Location], situate in the district of [District].
```

**Verify:**
- District name is correct
- Subdivision shown (if available)
- Proper punctuation and formatting

---

### **Step 6: Test Surveyor Information**

**Check the surveyor block (bottom-right of title block):**

```
[Surveyor Name]
Lic. No: [License Number]
[Firm Name]          (if available)
[Address]            (if available)
Date: [DD/MM/YYYY]
```

**Verify:**
- Surveyor name displays correctly
- License number shows (if available)
- Date is formatted as DD/MM/YYYY (British format)
- Right-aligned
- Border line above surveyor block

---

### **Step 7: Test Draggability**

1. **Click and hold** on the title block
2. **Drag** to a new position
3. **Release** mouse button
4. **Expected:** Title block moves smoothly
5. **Verify:** Position is maintained when changing settings

---

### **Step 8: Test with Margin Guides**

1. Click the **📐 button** (Toggle margin guides)
2. **Expected:** 
   - Red dashed sheet outline appears
   - Cyan 50mm margins (left, top, bottom)
   - Yellow 150mm right margin
   - Light blue title block area outline
3. **Verify:** Title block fits within designated area

**Console Output:**
```
[SurveyPlanMap] 📐 SI 727 Margin guides: ON
[SurveyPlanMap] Showing:
  - Sheet outline (red dashed)
  - Left margin: 50mm (cyan)
  - Right margin: 150mm for SG endorsements (yellow)
  - Top/Bottom margins: 50mm (cyan)
  - Title block outline (light blue)
```

---

### **Step 9: Test Print Layout Mode**

1. Click the **📄 button** (Toggle print layout mode)
2. **Expected:**
   - Margin guides automatically enabled
   - All overlays visible
   - Title block in SI 727 position
3. **Verify:** Layout looks professional and print-ready

**Console Output:**
```
[SurveyPlanMap] 📄 Print Layout Mode: ENABLED
  - Margin guides activated
  - Overlays visible
  - Ready for PDF/PNG export
  - Layout complies with SI 727 regulations
```

---

### **Step 10: Visual Inspection Checklist**

#### **Typography:**
- [ ] Times New Roman font (or Georgia fallback)
- [ ] "GENERAL PLAN" is bold, centered, uppercase
- [ ] "of" is small, italic, centered
- [ ] Stand designation is bold, centered
- [ ] Description text is left-aligned, regular weight
- [ ] References have italic labels
- [ ] Dotted underlines for fill-in spaces
- [ ] Note is small, italic, gray
- [ ] Surveyor block is right-aligned

#### **Spacing:**
- [ ] Proper spacing between sections
- [ ] Description lines have good line height
- [ ] Surveyor block has top border
- [ ] No text overlap or crowding

#### **Content:**
- [ ] All project information displays correctly
- [ ] No "undefined" or "null" values
- [ ] Parcel count is accurate
- [ ] Date format is DD/MM/YYYY

---

### **Step 11: Test Different Project Types**

#### **Test 11.1: Township Subdivision**
**Project Data:**
```javascript
{
  designation: "1-60",
  township: "Widdicombe",
  district: "Salisbury"
}
```

**Expected Title Block:**
```
"GENERAL PLAN"
of
STANDS 1-60 WIDDICOMBE TOWNSHIP

The figure N1, N2 ............... N1 represents
Widdicombe Township comprising 60 stands and public places
being the whole/the remainder/a portion* of Widdicombe,
situate in the district of Salisbury.
```

#### **Test 11.2: Multiple Ranges**
**Project Data:**
```javascript
{
  designation: "565-594, 601-620",
  township: "Salisbury",
  district: "Salisbury"
}
```

**Expected:**
```
STANDS 565-594, 601-620 SALISBURY TOWNSHIP
```

#### **Test 11.3: Farm Blocks**
**Project Data:**
```javascript
{
  designation: "ALPHA, BETA, GAMMA",
  township: "",
  district: "Darwin"
}
```

**Expected:**
```
ALPHA, BETA, GAMMA
```

---

### **Step 12: Test Edge Cases**

#### **Test 12.1: Missing Data**
**Scenario:** Project with minimal information

**Expected Behavior:**
- Fallback to default values
- No errors in console
- "Stand Number", "Township Name", "District" placeholders

#### **Test 12.2: Long Names**
**Scenario:** Very long township or designation names

**Expected Behavior:**
- Text wraps properly
- No overflow outside title block
- Maintains readability

#### **Test 12.3: Single Parcel**
**Scenario:** Project with only 1 parcel

**Expected:**
- "comprising 1 stand and public places" (singular)
- Not "1 stands" (incorrect)

---

### **Step 13: Performance Check**

1. **Load a large project** (many parcels)
2. **Change settings rapidly** (sheet size, scale)
3. **Expected:**
   - No lag or freezing
   - Smooth updates
   - No console errors

---

### **Step 14: Browser Compatibility**

Test in multiple browsers:
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if available)

**Verify:**
- Font rendering is consistent
- Layout is identical
- No browser-specific issues

---

## 🐛 Common Issues & Solutions

### **Issue 1: Title Block Not Showing**
**Symptoms:** Title block overlay is missing

**Check:**
1. `showOverlays.value` is `true`
2. `intelligentPreview.value` has data
3. No JavaScript errors in console

**Solution:**
```javascript
// Check in console:
console.log('showOverlays:', showOverlays.value)
console.log('intelligentPreview:', intelligentPreview.value)
```

---

### **Issue 2: Formatting Functions Not Working**
**Symptoms:** Designation shows as "STAND NUMBER" or raw input

**Check:**
1. `formatDesignation()` function is defined
2. `projectInfo` prop has data
3. No TypeScript errors

**Solution:**
```javascript
// Check in console:
console.log('projectInfo:', projectInfo)
console.log('formatDesignation result:', formatDesignation(projectInfo))
```

---

### **Issue 3: Styling Not Applied**
**Symptoms:** Title block looks plain, no SI 727 styling

**Check:**
1. CSS class `.title-block-si727` is applied
2. Styles are in `<style scoped>` section
3. No CSS conflicts

**Solution:**
- Inspect element in DevTools
- Check computed styles
- Verify class names match

---

### **Issue 4: Adaptive Scaling Not Working**
**Symptoms:** Title block doesn't resize with sheet size changes

**Check:**
1. `overlayScaling` computed property is defined
2. `:style` binding is correct
3. `intelligentPreview.value` updates

**Solution:**
```javascript
// Check in console:
console.log('overlayScaling:', overlayScaling.value)
```

---

### **Issue 5: Surveyor Info Missing**
**Symptoms:** Surveyor block is empty or shows defaults

**Check:**
1. `projectInfo.surveyorName` has value
2. `config.surveyorName` fallback works
3. Props are passed correctly

**Solution:**
- Check parent component props
- Verify workflow state data
- Add console logs in template

---

## ✅ Success Criteria

The SI 727 title block implementation is successful if:

- [x] **Displays all SI 727 required elements**
- [x] **Formats designations correctly** (stands, lots, farms)
- [x] **Shows accurate parcel count**
- [x] **Displays surveyor information** (name, license, date)
- [x] **Adapts to sheet size** (Small/Medium/Large)
- [x] **Adapts to map scale** (1:500 to 1:5000+)
- [x] **Uses professional typography** (Times New Roman, proper sizing)
- [x] **Is draggable** and repositionable
- [x] **Works with margin guides** and print layout mode
- [x] **Has no console errors**
- [x] **Matches SI 727 regulatory examples**

---

## 📸 Screenshot Checklist

Take screenshots of:

1. **Default view** - Title block with real project data
2. **Small sheet** - Title block at 85% scale
3. **Large sheet** - Title block at 120% scale
4. **With margin guides** - Title block within SI 727 margins
5. **Print layout mode** - Complete professional layout
6. **Different designations** - Stands, lots, farms

---

## 📝 Test Report Template

```markdown
# SI 727 Title Block Test Report

**Date:** [Date]
**Tester:** [Name]
**Browser:** [Browser + Version]
**Project:** [Project Name/ID]

## Test Results

### Visual Display
- [ ] Title block displays correctly
- [ ] All elements present
- [ ] Typography is professional
- [ ] Spacing is appropriate

### Formatting
- [ ] Designation formatted correctly
- [ ] Description line accurate
- [ ] Location line complete
- [ ] Surveyor info displayed

### Adaptive Scaling
- [ ] Small sheet: 85% scale works
- [ ] Medium sheet: 100% baseline works
- [ ] Large sheet: 120% scale works
- [ ] Scale changes: 1:500 to 1:5000 work

### Functionality
- [ ] Draggable
- [ ] Works with margin guides
- [ ] Works with print layout mode
- [ ] No console errors

### Issues Found
[List any issues or bugs]

### Screenshots
[Attach screenshots]

### Overall Assessment
[ ] PASS - Ready for production
[ ] FAIL - Needs fixes
```

---

## 🚀 Next Steps After Testing

Once testing is complete and successful:

1. **Document any issues** found during testing
2. **Fix critical bugs** before proceeding
3. **Proceed with data integration** (Phase 1)
4. **Implement enhanced exports** (PDF, PNG, DXF)

---

**Last Updated:** 2025-12-14 16:20  
**Status:** 🧪 Ready for Testing  
**File:** `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`
