# 🚨 Deleted Project Error Handling

## Issue: Errors When Using Deleted Projects

### **Symptoms:**
```
POST /api/projects/33/meridian-cache - 500 (Internal Server Error)
PATCH /api/survey-projects/33/workflow - 404 (Not Found)
```

### **Root Cause:**
Project 33 was permanently deleted, but the frontend still has it cached or selected. When trying to save data for a non-existent project, the backend returns errors.

---

## ✅ Solution Implemented

### **1. Better Error Messages**
**File:** `app-backend/src/routes/project-meridian-cache.js`

**Before:**
```
500 Internal Server Error
"Failed to update meridian cache"
```

**After:**
```
404 Not Found
"Project 33 not found. It may have been deleted."
```

**Changes:**
- ✅ Check if project exists before saving cache
- ✅ Return 404 with clear message if project deleted
- ✅ Handle foreign key constraint violations (error code 23503)
- ✅ Log warnings for debugging

---

## 🔧 How to Fix When You See These Errors

### **Step 1: Identify the Problem**
Look at the error message:
```
POST /api/projects/33/meridian-cache - 404
Error: "Project 33 not found. It may have been deleted."
```

This means you're trying to work with a deleted project.

### **Step 2: Clear Your Session**
The frontend might have cached the deleted project. Options:

**Option A: Select a Different Project**
1. Go to the workflow/module you're using
2. Look for project selector dropdown
3. Select an existing project

**Option B: Create a New Project**
1. Go to Settings → Projects
2. Click "Add New Project"
3. Fill in project details
4. Use the new project

**Option C: Clear Browser Cache**
1. Open browser DevTools (F12)
2. Go to Application → Storage
3. Clear localStorage
4. Refresh page

### **Step 3: Verify Project Exists**
Check Settings → Projects to see all active projects.

---

## 🛡️ Prevention

### **For Users:**
1. **Don't delete projects you're currently working on**
   - Close all workflow tabs before deleting
   - Ensure no one else is using the project

2. **Use Archive instead of Delete**
   - Archive preserves data
   - Can be restored later
   - Safer for active projects

3. **Check project list before starting work**
   - Verify project exists
   - Select correct project

### **For Developers:**
The backend now provides clear error messages:
- ✅ 404 with "Project not found" message
- ✅ Distinguishes between deleted and never-existed
- ✅ Logs warnings for debugging

---

## 📊 Error Codes Reference

| Code | Meaning | User Action |
|------|---------|-------------|
| 404 | Project not found | Select different project or create new one |
| 500 | Server error | Check backend logs, may be database issue |
| 403 | Access denied | You don't own this project |
| 400 | Invalid data | Check request parameters |

---

## 🔍 Debugging Tips

### **Backend Logs:**
Look for these messages:
```
[meridian-cache] Project 33 not found
[PATCH /workflow] Updating workflow for project 33
Failed to update workflow state
```

### **Frontend Console:**
```
[ControlPointSelector] Failed to save cache to database
❌ Failed to save workflow state
```

### **Database Check:**
```sql
-- Check if project exists
SELECT id, name, status FROM survey_projects WHERE id = 33;

-- Check if it was deleted (archived)
SELECT id, name, status FROM survey_projects WHERE id = 33 AND status = 'archived';
```

---

## 🎯 Quick Reference

**Problem:** Getting 404/500 errors for project operations  
**Cause:** Project was deleted  
**Solution:** Select a different project or create new one  
**Prevention:** Use Archive instead of Delete for active projects  

---

## 📝 Related Documentation

- **Project Deletion:** `PROJECT_DELETION_FEATURE.md`
- **File Cleanup:** `PROJECT_CLEANUP_IMPLEMENTATION.md`
- **Quick Reference:** `DELETION_QUICK_REFERENCE.md`

---

**Updated:** November 19, 2025  
**Status:** ✅ Error handling improved
