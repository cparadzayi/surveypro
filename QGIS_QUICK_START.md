# QGIS Integration - Quick Start Guide

## 🚀 5-Minute Setup

### **For First-Time Users**

```
1. Run Migration
   cd app-backend
   npm run migrate

2. Start Application
   Backend:  npm run dev (port 3050)
   Frontend: npm run dev (port 5173)

3. Create Project
   Login → Dashboard → Create Project

4. Start Workflow
   Cadastral Standard → Import CSV → Export to PostGIS
```

---

## 📋 User Workflow Checklist

### **In SurveyPro:**

- [ ] Import coordinate CSV file
- [ ] Click "Export to PostGIS Database"
- [ ] Click "🎯 Open QGIS Manager"
- [ ] Click "Create Project-Specific Views"
- [ ] Copy layer names to clipboard
- [ ] Note the connection details

### **In QGIS:**

- [ ] Layer → Add Layer → Add PostGIS Layers
- [ ] Click "New" connection
- [ ] Enter connection details:
  - Name: SurveyPro - [Your Project]
  - Host: localhost
  - Port: 5432
  - Database: surveypro
  - Username: postgres
  - Password: [your password]
- [ ] Click "Test Connection" → "OK"
- [ ] Add ONLY these layers:
  - ✅ `coordinate_points_project_X` (reference)
  - ✅ `land_parcels_project_X` (digitize here)
- [ ] Set CRS to EPSG:22291
- [ ] Enable labels on coordinate layer
- [ ] Enable snapping (0.01m tolerance)
- [ ] Toggle editing on land_parcels layer
- [ ] Digitize parcels
- [ ] Save edits

### **Back in SurveyPro:**

- [ ] Click "Refresh Parcels"
- [ ] Verify parcel count updated
- [ ] Click "Continue to Area Computation"
- [ ] Review calculated areas

---

## ⚠️ Common Mistakes to Avoid

| ❌ Don't Do This | ✅ Do This Instead |
|---|---|
| Add `coordinate_points` base table | Add `coordinate_points_project_63` view |
| Add `land_parcels` base table | Add `land_parcels_project_63` view |
| Skip "Create Views" button | Always create views first |
| Mix data from multiple projects | One project per QGIS session |
| Forget to enable snapping | Enable 0.01m snapping tolerance |
| Skip saving in QGIS | Save edits frequently |

---

## 🎯 Which Layers to Use

### **✅ CORRECT - Project-Specific Views:**
```
coordinate_points_project_63  ← Your reference layer (read-only)
land_parcels_project_63       ← Your digitization layer (editable)
```

### **❌ WRONG - Base Tables:**
```
coordinate_points  ← Shows ALL projects' data
land_parcels       ← Shows ALL projects' data
```

**Rule:** Always use layers with `_project_X` suffix!

---

## 🔍 Quick Troubleshooting

### **"Views not appearing in QGIS"**
→ Click "Refresh" in QGIS connection or restart QGIS

### **"Cannot edit layer"**
→ Verify you added the VIEW (with `_project_X`), not the base table

### **"project_id is NULL"**
→ You're editing the base table instead of the project view

### **"Status shows Setup Required"**
→ Click "Create Project-Specific Views" button first

---

## 📞 Need Help?

1. Check `QGIS_PROJECT_ISOLATION_GUIDE.md` for full documentation
2. Review database logs: `tail -f /var/log/postgresql/postgresql.log`
3. Check browser console: F12 → Console tab
4. Verify migration 035 ran: `SELECT * FROM schema_migrations WHERE version = 35;`

---

## ✨ Success Indicators

You're doing it right when you see:

✅ QGIS Manager shows "✅ Views Ready"  
✅ Layer names include `_project_X` suffix  
✅ Coordinate layer shows your project's points only  
✅ Digitized parcels appear in "Refresh Parcels"  
✅ Areas calculate automatically  
✅ Status displays "🔒 Project Isolated"  

---

**Time Investment:** 5 minutes setup, 30 seconds per parcel digitization  
**Benefits:** 100% project isolation, zero cross-project data leakage, intelligent guidance
