# 🧹 Project Cleanup Implementation - Complete File & Database Deletion

**Date:** November 19, 2025  
**Feature:** Comprehensive project deletion including database records AND physical files  
**Status:** ✅ Fully Implemented

---

## 📋 Overview

When a project is permanently deleted, the system now removes:
1. **Database Records** - All project data across 8+ tables
2. **Physical Files** - All project directories and generated documents

This ensures complete cleanup with no orphaned data or files.

---

## 🗂️ What Gets Deleted

### **Database Tables (8 tables):**
```
1. coordinate_point_history
2. coordinate_points
3. land_parcels
4. parcels (legacy)
5. project_csv_imports
6. project_control_points
7. project_meridian_cache
8. survey_projects
```

### **File System:**
```
{working_directory}/
├── input/
│   └── (CSV files, control points)
├── output/
│   ├── field-book/        (Field Book PDFs)
│   ├── calculations/      (Calculations PDFs)
│   ├── coordinate-list/   (Coordinate List PDFs)
│   ├── reports/           (Report on Survey PDFs)
│   └── certificates/      (DSG Certificate PDFs)
└── README.txt
```

**Example Path:**
```
C:/Users/User/Documents/SurveyPro/Projects/Elon_Estates_Gwelo_2025-10-28/
```

---

## 🔧 Implementation Details

### **1. Directory Deletion Utility**
**File:** `app-backend/src/utils/projectDirectories.js`

**New Function:** `deleteProjectDirectory(workingDirectory)`

**Features:**
- ✅ Recursive deletion of all files and subdirectories
- ✅ Safety checks to prevent accidental system directory deletion
- ✅ Path validation (must be within user's home directory or Documents/SurveyPro/Projects)
- ✅ Graceful handling if directory doesn't exist
- ✅ Detailed logging of deletion operations

**Safety Checks:**
```javascript
// Only allows deletion within:
// 1. Documents/SurveyPro/Projects/
// 2. User's home directory
// Prevents accidental deletion of system directories
```

**Algorithm:**
```javascript
function deleteDirRecursive(dirPath) {
  1. Check if directory exists
  2. Read all entries (files + subdirectories)
  3. For each entry:
     - If directory: Recursively delete
     - If file: Delete file
  4. Delete the now-empty directory
}
```

---

### **2. Backend Integration**
**File:** `app-backend/src/routes/survey-projects.js`

**Enhanced DELETE Endpoint:**
```javascript
DELETE /api/survey-projects/:id?permanent=true
```

**Deletion Flow:**
```
1. Verify user owns the project (403 if not)
2. Check if permanent=true query parameter
3. If permanent:
   a. Delete all database records (transaction-safe)
   b. If working_directory exists:
      - Call deleteProjectDirectory()
      - Log success/failure
   c. Return appropriate message
4. If not permanent:
   - Soft delete (set status='archived')
```

**Response Messages:**
- ✅ `"Survey project and all files permanently deleted"` - Complete success
- ⚠️ `"Survey project deleted from database, but some files may remain"` - DB deleted, file cleanup failed
- ℹ️ `"Survey project permanently deleted (no files to clean up)"` - No working directory specified

---

## 🔒 Security & Safety

### **Path Validation:**
```javascript
// Allowed paths:
✅ C:/Users/User/Documents/SurveyPro/Projects/MyProject_2025-11-19/
✅ C:/Users/User/MyProjects/Survey123/
✅ Documents/SurveyPro/Projects/Test_Project/

// Blocked paths:
❌ C:/Windows/System32/
❌ C:/Program Files/
❌ /etc/
❌ ../../../important-files/
```

### **Ownership Verification:**
- User must own the project to delete it
- Backend verifies `surveyor_profile_id` matches authenticated user
- Returns 403 Forbidden if unauthorized

### **Transaction Safety:**
- Database deletions wrapped in transactions
- All deletions succeed or all fail (atomic)
- File deletion happens AFTER database deletion succeeds
- If file deletion fails, database is already cleaned up (logged as warning)

---

## 📊 Deletion Order

### **Step 1: Database Cleanup**
```sql
BEGIN TRANSACTION;

-- 1. Delete coordinate point history
DELETE FROM coordinate_point_history 
WHERE point_id IN (SELECT id FROM coordinate_points WHERE project_id = ?);

-- 2. Delete coordinate points
DELETE FROM coordinate_points WHERE project_id = ?;

-- 3. Delete land parcels
DELETE FROM land_parcels WHERE project_id = ?;

-- 4. Delete legacy parcels
DELETE FROM parcels WHERE project_id = ?;

-- 5. Delete CSV import history
DELETE FROM project_csv_imports WHERE project_id = ?;

-- 6. Delete control point selections
DELETE FROM project_control_points WHERE project_id = ?;

-- 7. Delete meridian cache
DELETE FROM project_meridian_cache WHERE project_id = ?;

-- 8. Delete project
DELETE FROM survey_projects WHERE id = ?;

COMMIT;
```

### **Step 2: File System Cleanup**
```
1. Resolve working_directory to absolute path
2. Validate path is within allowed directories
3. Recursively delete all files and subdirectories
4. Delete the project root directory
```

---

## 🧪 Testing Scenarios

### **Test 1: Complete Deletion**
```
Given: Project with working directory and generated files
When: User clicks Delete → Confirms permanent deletion
Then: 
  ✅ All database records deleted
  ✅ All files and directories deleted
  ✅ Message: "Survey project and all files permanently deleted"
```

### **Test 2: Database-Only Project**
```
Given: Project without working_directory field
When: User clicks Delete → Confirms permanent deletion
Then:
  ✅ All database records deleted
  ✅ No file operations attempted
  ✅ Message: "Survey project permanently deleted (no files to clean up)"
```

### **Test 3: Directory Already Deleted**
```
Given: Project with working_directory, but directory manually deleted
When: User clicks Delete → Confirms permanent deletion
Then:
  ✅ All database records deleted
  ✅ File deletion gracefully skipped (already gone)
  ✅ Message: "Survey project and all files permanently deleted"
```

### **Test 4: File Deletion Fails**
```
Given: Project with locked/in-use files
When: User clicks Delete → Confirms permanent deletion
Then:
  ✅ All database records deleted
  ⚠️ File deletion fails (logged as warning)
  ⚠️ Message: "Survey project deleted from database, but some files may remain"
```

### **Test 5: Archive (Soft Delete)**
```
Given: Any project
When: User clicks Archive → Confirms
Then:
  ✅ Project status set to 'archived'
  ✅ All files preserved
  ✅ All data preserved
  ✅ Project hidden from list
```

---

## 🎨 User Experience

### **Delete Confirmation Modal:**
```
┌─────────────────────────────────────────┐
│ ⚠️ Permanently Delete Project?          │
│                                         │
│ Project Name: Elon Estates Gwelo        │
│                                         │
│ ┌─────────────────────────────────────┐ │
│ │ ⚠️ This action cannot be undone!    │ │
│ │                                     │ │
│ │ The following will be deleted:      │ │
│ │ • Project information               │ │
│ │ • Control point selections          │ │
│ │ • CSV import history                │ │
│ │ • Coordinate points                 │ │
│ │ • Land parcels                      │ │
│ │ • Workflow state                    │ │
│ │ • ALL FILES in project directory    │ │
│ │   (Field Books, Calculations, etc.) │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ [Delete Permanently] [Cancel]           │
└─────────────────────────────────────────┘
```

### **Success Messages:**
- 🗑️ **Complete Deletion:** "Survey project and all files permanently deleted"
- ⚠️ **Partial Deletion:** "Survey project deleted from database, but some files may remain"
- ℹ️ **Database Only:** "Survey project permanently deleted (no files to clean up)"

---

## 📝 Logging

### **Backend Logs:**
```
[DELETE] Permanently deleting project 24 (Elon Estates Gwelo)
[DELETE] Deleting project directory: Documents/SurveyPro/Projects/Elon_Estates_Gwelo_2025-10-28
[deleteProjectDirectory] Attempting to delete: C:/Users/User/Documents/SurveyPro/Projects/Elon_Estates_Gwelo_2025-10-28
[deleteProjectDirectory] Successfully deleted: C:/Users/User/Documents/SurveyPro/Projects/Elon_Estates_Gwelo_2025-10-28
[DELETE] ✅ Successfully deleted project directory: C:/Users/User/Documents/SurveyPro/Projects/Elon_Estates_Gwelo_2025-10-28
```

### **Frontend Logs:**
```
[useSurveyors] Permanently deleting project 24
[ProjectsView] Permanently deleting project 24: Elon Estates Gwelo
[ProjectsView] Project deleted successfully
```

---

## ⚠️ Important Warnings

### **Data Loss:**
Permanent deletion removes:
- ✅ All database records (8+ tables)
- ✅ All project files (PDFs, CSVs, etc.)
- ✅ All generated documents
- ✅ All workflow progress
- ✅ All digitized parcels
- ✅ All coordinate points

**This action CANNOT be undone!**

### **File System Impact:**
- Deletes entire project directory tree
- Includes all subdirectories and files
- No recycle bin / trash recovery
- Permanent deletion from disk

### **Recommendations:**
1. **Use Archive** for completed projects you might need later
2. **Use Delete** only for test projects or mistakes
3. **Backup important files** before permanent deletion
4. **Double-check** the project name before confirming

---

## 🔄 Comparison: Archive vs Delete

| Feature | Archive (Soft Delete) | Delete (Permanent) |
|---------|----------------------|-------------------|
| Database Records | ✅ Preserved | ❌ Deleted |
| Project Files | ✅ Preserved | ❌ Deleted |
| Can Restore | ✅ Yes (future feature) | ❌ No |
| Disk Space | 📦 Used | 💾 Freed |
| Use Case | Completed projects | Test/mistake projects |
| Safety | 🟢 Safe | 🔴 Destructive |

---

## 📁 Files Modified

### **Backend:**
1. `app-backend/src/utils/projectDirectories.js`
   - Added `deleteDirRecursive()` helper
   - Added `deleteProjectDirectory()` function
   - Added safety checks and path validation

2. `app-backend/src/routes/survey-projects.js`
   - Imported `deleteProjectDirectory`
   - Enhanced DELETE endpoint with file cleanup
   - Added detailed logging

3. `app-backend/src/models/SurveyProject.js`
   - Fixed `permanentDelete()` with correct table names
   - Added all related table deletions

### **Frontend:**
- No changes needed (already implemented)

---

## 🚀 Usage Guide

### **For End Users:**

**To Permanently Delete a Project:**
1. Navigate to **Settings → Projects**
2. Find the project you want to delete
3. Click the 🗑️ **Delete** button (red)
4. **Read the warning carefully**
5. Confirm you understand data will be lost
6. Click **Delete Permanently**
7. Wait for confirmation message
8. Project and all files are gone

**To Archive a Project:**
1. Navigate to **Settings → Projects**
2. Find the project you want to archive
3. Click the 📦 **Archive** button (amber)
4. Confirm archiving
5. Project is hidden but data preserved

---

## 🐛 Troubleshooting

### **Problem: "Some files may remain" message**
**Cause:** Files are locked or in use by another program  
**Solution:** 
1. Close any open PDFs from the project
2. Close QGIS if connected to project database
3. Try deletion again
4. Manually delete remaining files if needed

### **Problem: Directory not deleted**
**Cause:** Insufficient permissions or path outside allowed directories  
**Solution:**
1. Check backend logs for specific error
2. Verify working_directory path is correct
3. Ensure user has write permissions
4. Manually delete if necessary

### **Problem: Database deleted but files remain**
**Cause:** File deletion failed after database deletion  
**Solution:**
1. Project is already removed from database
2. Manually delete the project directory:
   - Navigate to `Documents/SurveyPro/Projects/`
   - Find the project folder
   - Delete manually

---

## ✅ Summary

**What Changed:**
- ✅ Added recursive directory deletion utility
- ✅ Integrated file cleanup into permanent delete
- ✅ Added safety checks to prevent system directory deletion
- ✅ Enhanced logging for debugging
- ✅ Graceful error handling

**User Benefits:**
- 🧹 Complete cleanup - no orphaned files
- 💾 Reclaim disk space
- 🔒 Safe with path validation
- 📝 Clear feedback on what was deleted
- ⚠️ Strong warnings prevent accidents

**Developer Benefits:**
- 🛡️ Transaction-safe database deletion
- 🔍 Comprehensive logging
- 🧪 Easy to test and debug
- 📚 Well-documented code
- 🔄 Reusable utility functions

---

**Implemented by:** Cascade AI  
**Date:** November 19, 2025  
**Status:** ✅ Complete and ready for testing  
**Next Steps:** Test with real projects, verify file cleanup works correctly
