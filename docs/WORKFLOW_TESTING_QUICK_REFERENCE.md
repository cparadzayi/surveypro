# 🧪 Workflow Testing - Quick Reference Guide

## 🚀 **Quick Start Testing**

### **1. Start Servers**
```bash
# Terminal 1 - Backend
cd app-backend
npm run dev

# Terminal 2 - Frontend  
cd app-frontend
npm run dev
```

### **2. Login & Navigate**
1. Open browser: `http://localhost:5173`
2. Login with your credentials
3. Select a Cadastral project (or create new)
4. Click "Start Workflow" or navigate to `/modules/cadastral-standard/workflow`

---

## ✅ **Step-by-Step Test Sequence**

### **Step 0: Project Setup** ⭐ NEW!

**Should See:**
- Project Setup form (NOT CSV Import)
- Project name field (required)
- District field (optional)
- Working directory selector
- Central meridian dropdown (default: Lo 31)

**Test Actions:**
1. Enter project name: `Test_Project_Nov_17`
2. Enter district: `Gwelo`
3. Click "Generate" for working directory
4. Verify path shows: `Documents/SurveyPro/Projects/Test_Project_Nov_17_2025-11-17`
5. Select central meridian: `Lo 31`
6. Click "Complete Setup & Proceed to Import CSV"

**Expected Result:**
- ✅ Console shows: `✅ Project setup completed:`
- ✅ Auto-navigates to CSV Import
- ✅ Dashboard shows Project Setup ✅ complete

**If Error:**
- Check browser console for errors
- Verify backend running on port 3050
- Check network tab for failed API calls

---

### **Step 1: CSV Import**

**Should See:**
- CSV Import welcome screen
- Project already selected
- Working directory already set (from Step 0)

**Test Actions:**
1. Click "Import Coordinates"
2. Select sample CSV file
3. Verify points loaded
4. Check console for: `💾 [Product Storage] Auto-saving products for step: import_csv`
5. Verify CSV saved to: `{workingDirectory}/input/`

**Expected Result:**
- ✅ Points displayed in table
- ✅ CSV auto-saved to project folder
- ✅ Console shows save confirmation

---

### **Step 2: Field Book**

**Test Actions:**
1. Click "Continue to Field Book"
2. Fill surveyor information
3. Click "Generate Field Book"
4. Verify Field Book generated

**Expected Result:**
- ✅ Field Book metadata includes project name from Step 0
- ✅ Workflow advances to Calculations Part 1

**Note:** Field Book auto-save currently deferred (manual download)

---

### **Step 3: Calculations Part 1**

**Test Actions:**
1. Fill calculations form
2. Select control points (if needed)
3. Click "Generate Calculations Part 1"
4. Check console for auto-save

**Expected Result:**
- ✅ Two PDFs generated (Calculations + Coordinate List)
- ✅ Auto-saved to `/output/calculations/` and `/output/coordinate-list/`
- ✅ Central meridian from Step 0 used correctly

---

### **Step 4-7: Remaining Steps**

Test each step similarly:
- Complete the step
- Verify auto-save
- Check console logs
- Verify files in project folder

---

## 🎯 **Quick Validation Checklist**

- [ ] **Project Setup appears first** (not CSV Import)
- [ ] **Can complete setup form** (validation works)
- [ ] **Data saved to workflow state** (check console)
- [ ] **Auto-navigation to CSV Import** works
- [ ] **Working directory persists** through all steps
- [ ] **CSV auto-saved** to `/input/` folder
- [ ] **PDFs auto-saved** to `/output/` folders
- [ ] **Console shows** success messages
- [ ] **Workflow dashboard** shows correct progress
- [ ] **All 8 steps** can be completed

---

## 🔍 **Quick Debugging**

### **Problem: Project Setup not showing**
- Clear browser cache and refresh
- Check `workflowState.currentStep` in Vue DevTools
- Verify backend updated (`current_step: 'project_setup'`)

### **Problem: Form validation not working**
- Check ProjectSetupView.vue imported correctly
- Verify button disabled until fields filled
- Check browser console for Vue errors

### **Problem: Data not saving**
- Check network tab for 403/500 errors
- Verify authentication token valid
- Check backend logs for errors

### **Problem: Auto-save not working**
- Verify working directory set in Step 0
- Check console for `💾 [Product Storage]` messages
- Verify backend `/api/documents/save` endpoint working

---

## 📊 **Expected Console Output**

**Good workflow run:**
```
✅ Project setup completed: {...}
[PATCH /workflow] Step 'project_setup' completed
✅ Project setup complete. Ready to import CSV.

💾 [Product Storage] Auto-saving products for step: import_csv
✅ [Product Storage] Saved raw-data to: C:/Users/.../input/...
✅ [Product Storage] Saved 1/1 products successfully

💾 [Product Storage] Auto-saving products for step: calculations_part1
💾 [Product Storage] Batch saving 2 products...
✅ [Product Storage] Saved calculations-part1 to: ...
✅ [Product Storage] Saved coordinate-list to: ...
✅ [Product Storage] Saved 2/2 products successfully
```

---

## 🚨 **Common Issues & Fixes**

| Issue | Cause | Fix |
|-------|-------|-----|
| Step 0 not appearing | Type not updated | Check `cadastral.ts` includes `'project-setup'` |
| Button always disabled | Validation error | Check v-model bindings in ProjectSetupView |
| Data not persisting | DB not updated | Check backend `requiredSteps` includes `project_setup` |
| Auto-save failing | Directory issue | Verify working directory path is absolute |
| PDF not generating | Missing dependency | Check workflow state has required data |

---

## ✅ **Success Indicators**

**You've successfully implemented everything if:**

1. ✅ Workflow starts at Project Setup (not CSV Import)
2. ✅ Can fill out and submit project setup form
3. ✅ Auto-navigates to CSV Import after setup
4. ✅ CSV auto-saves to `/input/` folder
5. ✅ PDFs auto-save to `/output/` folders
6. ✅ Working directory from Step 0 used everywhere
7. ✅ Dashboard shows all steps including Project Setup
8. ✅ Backend recognizes `project_setup` as required step

---

## 📞 **Need Help?**

**Check Documentation:**
- `PROJECT_SETUP_IMPLEMENTATION_COMPLETE.md` - Full implementation details
- `AUTO_SAVE_INTEGRATION_COMPLETE.md` - Auto-save integration guide
- `WORKFLOW_AUTO_SAVE_IMPLEMENTATION.md` - Original implementation guide

**Verify Files:**
- `ProjectSetupView.vue` - Component exists
- `CadastralStandardView.vue` - Import and handler added
- `cadastral.ts` - Type includes `'project-setup'`
- `survey-projects.js` - Backend updated

**Test in isolation:**
- Test ProjectSetupView standalone
- Test workflow navigation
- Test backend API calls with Postman
- Test auto-save service separately

---

**Happy Testing!** 🚀
