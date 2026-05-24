# 🗑️ Project Deletion - Quick Reference

## Two Deletion Options

### 📦 **Archive (Soft Delete)**
- **What it does:** Hides project from list
- **Data:** ✅ All preserved
- **Files:** ✅ All preserved
- **Reversible:** ✅ Yes (can restore later)
- **Use for:** Completed projects you might need

**How to Archive:**
1. Settings → Projects
2. Click 📦 Archive button (amber)
3. Confirm

---

### 🗑️ **Delete (Permanent)**
- **What it does:** Complete removal
- **Data:** ❌ All deleted (8+ database tables)
- **Files:** ❌ All deleted (entire project directory)
- **Reversible:** ❌ No - CANNOT be undone
- **Use for:** Test projects, mistakes

**How to Delete:**
1. Settings → Projects
2. Click 🗑️ Delete button (red)
3. **Read warning carefully**
4. Confirm permanent deletion

---

## What Gets Deleted (Permanent)

### Database (8 tables):
- ✅ survey_projects
- ✅ coordinate_points
- ✅ coordinate_point_history
- ✅ land_parcels
- ✅ parcels
- ✅ project_csv_imports
- ✅ project_control_points
- ✅ project_meridian_cache

### Files (entire directory):
```
Documents/SurveyPro/Projects/{project_name}/
├── input/                    ❌ DELETED
├── output/
│   ├── field-book/          ❌ DELETED
│   ├── calculations/        ❌ DELETED
│   ├── coordinate-list/     ❌ DELETED
│   ├── reports/             ❌ DELETED
│   └── certificates/        ❌ DELETED
└── README.txt               ❌ DELETED
```

---

## Safety Features

✅ **Ownership Check:** Can only delete your own projects  
✅ **Path Validation:** Cannot delete system directories  
✅ **Transaction Safety:** All database deletions succeed or all fail  
✅ **Clear Warnings:** Modal shows exactly what will be deleted  
✅ **Detailed Logging:** All operations logged for debugging  

---

## Quick Decision Guide

**Choose Archive if:**
- ✅ Project is complete
- ✅ Might need data later
- ✅ Want to keep records
- ✅ Unsure about deleting

**Choose Delete if:**
- ✅ Test project
- ✅ Created by mistake
- ✅ Need to free disk space
- ✅ 100% sure you don't need it

---

## Troubleshooting

**"Some files may remain" message:**
- Files are locked/in-use
- Close PDFs, QGIS, etc.
- Try again or manually delete

**Directory not deleted:**
- Check backend logs
- Verify permissions
- Manually delete if needed

**Database deleted but files remain:**
- Project already removed from database
- Manually delete: `Documents/SurveyPro/Projects/{project_name}/`

---

## Documentation

- **Full Feature Guide:** `PROJECT_DELETION_FEATURE.md`
- **Implementation Details:** `PROJECT_CLEANUP_IMPLEMENTATION.md`
- **This Quick Reference:** `DELETION_QUICK_REFERENCE.md`

---

**⚠️ REMEMBER: Permanent deletion CANNOT be undone!**
