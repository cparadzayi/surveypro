# 🗑️ Project Deletion Feature Implementation

**Date:** November 19, 2025  
**Feature:** Archive and Permanent Delete options for survey projects  
**Location:** Settings → Projects

---

## 📋 Overview

Added comprehensive project deletion functionality with two options:
1. **Archive** (Soft Delete) - Hides project but preserves all data
2. **Permanent Delete** (Hard Delete) - Completely removes project and all related data

---

## ✨ Features Implemented

### **1. Backend - Permanent Delete Method**
**File:** `app-backend/src/models/SurveyProject.js`

Added `permanentDelete()` method that cascades deletion:
```javascript
static async permanentDelete(id) {
  // Deletes in order:
  // 1. Project control points
  // 2. CSV imports
  // 3. Area parcels
  // 4. Coordinate points
  // 5. Survey project itself
}
```

**Transaction Safety:**
- Uses database transactions (BEGIN/COMMIT/ROLLBACK)
- All deletions succeed or all fail (atomic operation)
- Respects foreign key constraints

---

### **2. Backend - Enhanced DELETE Endpoint**
**File:** `app-backend/src/routes/survey-projects.js`

Updated `DELETE /survey-projects/:id` endpoint:
- **Query Parameter:** `?permanent=true` for hard delete
- **Default:** Soft delete (archive) if parameter not provided
- **Logging:** Different log levels (INFO for archive, WARN for permanent)
- **Ownership Verification:** Ensures user owns the project before deletion

**API Usage:**
```javascript
// Archive (soft delete)
DELETE /survey-projects/123

// Permanent delete
DELETE /survey-projects/123?permanent=true
```

---

### **3. Frontend - Service Functions**
**File:** `app-frontend/src/composables/useSurveyors.ts`

Added two new functions:
```typescript
archiveSurveyProject(id: number): Promise<boolean>
deleteSurveyProject(id: number): Promise<boolean>
```

**Features:**
- Separate functions for clarity
- Auto-refresh project list after deletion
- Error handling with user-friendly messages
- Console logging for debugging

---

### **4. Frontend - Enhanced UI**
**File:** `app-frontend/src/views/modules/settings/ProjectsView.vue`

**Project Card Actions:**
- ✏️ **Edit** (blue) - Edit project details
- 📦 **Archive** (amber) - Soft delete
- 🗑️ **Delete** (red) - Permanent delete

**Confirmation Modal:**

**Archive Mode:**
- 📦 Amber theme
- Clear message: "Data will be preserved"
- Can be restored later

**Delete Mode:**
- ⚠️ Red theme with warning icon
- Lists all data that will be deleted:
  - Project information
  - Control point selections
  - Project meridian cache
  - CSV import history
  - Coordinate points and their history
  - Land parcels
  - Parcels (legacy)
  - Workflow state and documents
- ⚠️ "This action cannot be undone!" warning

---

## 🎨 UI/UX Design

### **Color Coding:**
- **Blue** (Edit) - Safe, informational action
- **Amber** (Archive) - Caution, reversible action
- **Red** (Delete) - Danger, irreversible action

### **Modal States:**
```
Archive Modal:
┌─────────────────────────────────┐
│ 📦 Archive Project?             │
│                                 │
│ Project Name                    │
│ ┌─────────────────────────────┐ │
│ │ 📦 Data will be preserved   │ │
│ │ and can be restored later   │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Archive] [Cancel]              │
└─────────────────────────────────┘

Delete Modal:
┌─────────────────────────────────┐
│ ⚠️ Permanently Delete Project?  │
│                                 │
│ Project Name                    │
│ ┌─────────────────────────────┐ │
│ │ ⚠️ Cannot be undone!         │ │
│ │                             │ │
│ │ Will delete:                │ │
│ │ • Project information       │ │
│ │ • Control points            │ │
│ │ • CSV imports               │ │
│ │ • Coordinate points         │ │
│ │ • Land parcels              │ │
│ │ • Workflow state            │ │
│ └─────────────────────────────┘ │
│                                 │
│ [Delete Permanently] [Cancel]   │
└─────────────────────────────────┘
```

---

## 🔒 Security Features

### **Ownership Verification:**
- Backend verifies user owns project before deletion
- Returns 403 Forbidden if user doesn't own project
- Uses authenticated user's surveyor profile

### **Transaction Safety:**
- All deletions wrapped in database transactions
- Rollback on any error
- Prevents partial deletions

### **Audit Trail:**
- Logs all deletion attempts
- Includes project ID and name
- Different log levels for archive vs delete

---

## 📊 Data Cascade

When permanently deleting a project, data is removed in this order:

```
1. coordinate_point_history (references coordinate_points)
   ↓
2. coordinate_points (foreign key to survey_projects)
   ↓
3. land_parcels (foreign key to survey_projects)
   ↓
4. parcels (foreign key to survey_projects)
   ↓
5. project_csv_imports (foreign key to survey_projects)
   ↓
6. project_control_points (foreign key to survey_projects)
   ↓
7. project_meridian_cache (foreign key to survey_projects)
   ↓
8. survey_projects (main table)
```

**Why This Order?**
- Respects foreign key constraints (child tables first)
- Prevents orphaned data
- Ensures clean deletion
- Handles both old and new schema tables

---

## 🧪 Testing Checklist

### **Archive (Soft Delete):**
- [ ] Click Archive button
- [ ] See amber-themed confirmation modal
- [ ] Click Archive
- [ ] Project disappears from list
- [ ] Project status set to 'archived' in database
- [ ] All related data preserved

### **Permanent Delete:**
- [ ] Click Delete button (red trash icon)
- [ ] See red-themed warning modal
- [ ] Review list of data to be deleted
- [ ] Click Delete Permanently
- [ ] Project disappears from list
- [ ] Project removed from database
- [ ] All related data removed:
  - [ ] project_control_points deleted
  - [ ] csv_imports deleted
  - [ ] area_parcels deleted
  - [ ] coordinate_points deleted

### **Security:**
- [ ] Cannot delete another user's project
- [ ] 403 error if attempting unauthorized deletion
- [ ] Transaction rollback on error

### **UI/UX:**
- [ ] Loading states show during deletion
- [ ] Error messages display if deletion fails
- [ ] List refreshes after successful deletion
- [ ] Cancel button works in both modals

---

## 🚀 Usage Guide

### **For Users:**

**To Archive a Project:**
1. Go to Settings → Projects
2. Find the project you want to archive
3. Click the 📦 (Archive) button
4. Confirm in the modal
5. Project is hidden but data is preserved

**To Permanently Delete a Project:**
1. Go to Settings → Projects
2. Find the project you want to delete
3. Click the 🗑️ (Delete) button
4. **Read the warning carefully**
5. Confirm deletion
6. Project and all data are permanently removed

---

## 📝 API Reference

### **Archive Project (Soft Delete)**
```http
DELETE /api/survey-projects/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "ok": true,
  "message": "Survey project archived successfully"
}
```

---

### **Permanently Delete Project**
```http
DELETE /api/survey-projects/:id?permanent=true
Authorization: Bearer <token>
```

**Response:**
```json
{
  "ok": true,
  "message": "Survey project permanently deleted"
}
```

---

## ⚠️ Important Notes

### **Data Loss Warning:**
Permanent deletion removes:
- ✅ Project metadata (name, client, district, etc.)
- ✅ Control point selections
- ✅ All CSV imports
- ✅ All coordinate points
- ✅ All digitized land parcels
- ✅ Workflow state and progress
- ✅ Generated documents metadata
- ✅ **ALL FILES in project directory** (Field Books, Calculations, Reports, etc.)
- ✅ **Project directory structure** (input/, output/, subdirectories)

**This action CANNOT be undone!**

### **File System Cleanup:**
When permanently deleting a project, the system also removes the entire project directory:
```
Documents/SurveyPro/Projects/{project_name}/
├── input/
├── output/
│   ├── field-book/
│   ├── calculations/
│   ├── coordinate-list/
│   ├── reports/
│   └── certificates/
└── README.txt
```

**Safety Features:**
- Path validation prevents deletion of system directories
- Only deletes directories within user's home or Documents/SurveyPro/Projects
- Graceful handling if directory doesn't exist
- Detailed logging of all deletion operations

See `PROJECT_CLEANUP_IMPLEMENTATION.md` for complete details.

### **Recommendation:**
- Use **Archive** for projects you might need later
- Use **Delete** only for test projects or mistakes
- Always double-check before permanent deletion

---

## 🔄 Future Enhancements

### **Potential Additions:**
1. **Restore Archived Projects**
   - Add "Show Archived" toggle
   - Restore button for archived projects
   - Update status back to 'active'

2. **Bulk Operations**
   - Select multiple projects
   - Bulk archive/delete
   - Confirmation with count

3. **Deletion Confirmation Input**
   - Require typing project name to confirm
   - Extra safety for permanent deletion

4. **Audit Log**
   - Track who deleted what and when
   - Separate audit_log table
   - View deletion history

5. **Soft Delete Expiration**
   - Auto-delete archived projects after X days
   - Configurable retention period
   - Warning before auto-deletion

---

## 📁 Files Modified

### **Backend:**
- `app-backend/src/models/SurveyProject.js` - Added `permanentDelete()` method
- `app-backend/src/routes/survey-projects.js` - Enhanced DELETE endpoint

### **Frontend:**
- `app-frontend/src/composables/useSurveyors.ts` - Added archive/delete functions
- `app-frontend/src/views/modules/settings/ProjectsView.vue` - Enhanced UI with dual options

---

## ✅ Summary

**What Changed:**
- ✅ Added permanent delete functionality
- ✅ Enhanced archive (soft delete) with better UI
- ✅ Clear visual distinction between archive and delete
- ✅ Comprehensive warning for permanent deletion
- ✅ Transaction-safe cascade deletion
- ✅ Ownership verification

**User Benefits:**
- 🎯 Clean up test projects permanently
- 📦 Archive completed projects without data loss
- ⚠️ Clear warnings prevent accidental deletion
- 🔒 Secure - can only delete own projects

**Developer Benefits:**
- 🧹 Clean codebase with proper cascade deletion
- 🔄 Reusable service functions
- 📝 Well-documented API
- 🛡️ Transaction safety

---

**Implemented by:** Cascade AI  
**Date:** November 19, 2025  
**Status:** ✅ Complete and ready for testing
