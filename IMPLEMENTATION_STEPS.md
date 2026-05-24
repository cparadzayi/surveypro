# 🚀 Implementation Steps - Project-Scoped QGIS Workflow

## ✅ Step 1: Create Database Function (5 minutes)

1. **Open pgAdmin**
2. **Run** `create_project_views_function.sql`
3. **Verify** views were created:
   ```sql
   SELECT * FROM pg_views WHERE viewname LIKE '%_project_26';
   ```

## ✅ Step 2: Restart Backend (1 minute)

The backend routes have been updated with new endpoints:
- `POST /api/spatial/create-project-views` - Creates project views
- `GET /api/spatial/db-connection?project_id=X` - Returns view names

**Restart the backend:**
```bash
cd app-backend
# Stop current server (Ctrl+C)
npm run dev
```

## ✅ Step 3: Test the Workflow (10 minutes)

### 3.1 Select Project
1. Open SurveyPro → Lite → Areas
2. Select "Avondale - Survey Points" (project_id = 26)
3. **Check console** - should see: "✅ Project views created"

### 3.2 Get QGIS Connection Info
1. Click "📡 QGIS Connection" button
2. **Note the view names:**
   - `coordinate_points_project_26`
   - `land_parcels_project_26`
3. Copy connection URI

### 3.3 Connect QGIS
1. Open QGIS
2. Layer → Add PostGIS Layer
3. Create new connection with copied URI
4. **Add ONLY these views:**
   - ✅ `coordinate_points_project_26` (reference)
   - ✅ `land_parcels_project_26` (digitize here)
5. Set CRS to EPSG:22291

### 3.4 Digitize Polygons
1. Toggle editing on `land_parcels_project_26`
2. Digitize a test polygon
3. Set `stand` attribute (e.g., "Test 1")
4. Save edits
5. **project_id = 26 is set automatically!**

### 3.5 Verify in SurveyPro
1. Click "🔄 Refresh" button
2. **Should see your polygon** with auto-calculated area!

---

## 🔧 Current Status

### ✅ Completed
- [x] Database function created
- [x] Backend endpoints added
- [x] Spatial routes updated

### ⏳ Remaining (Optional Frontend Updates)
- [ ] Update `spatial.ts` service to call new endpoints
- [ ] Update `onProjectChange()` to auto-create views
- [ ] Update QGIS modal to show project-specific view names

---

## 📝 Manual Workflow (Works Now!)

Even without the frontend updates, you can use the workflow manually:

### Step 1: Create Views (One-time per project)
```sql
SELECT create_project_views(26);
```

### Step 2: Connect QGIS
Use these view names:
- `coordinate_points_project_26`
- `land_parcels_project_26`

### Step 3: Digitize
- project_id is automatically set to 26
- No manual entry needed!

### Step 4: Refresh in SurveyPro
Click refresh to see new parcels

---

## 🎯 Benefits

1. **No manual project_id entry** - Automatic via views
2. **Filtered data** - Only see project 26 points
3. **Data integrity** - Can't save to wrong project
4. **Clean workflow** - One SQL command to set up

---

## 🐛 Troubleshooting

### Issue: Views not created
**Solution:** Run SQL manually:
```sql
SELECT create_project_views(26);
```

### Issue: QGIS shows all points
**Solution:** Make sure you're using the VIEW, not the table:
- ✅ `coordinate_points_project_26` (view)
- ❌ `coordinate_points` (table)

### Issue: project_id is NULL
**Solution:** You're editing the base table, not the view:
- ✅ Edit `land_parcels_project_26`
- ❌ Don't edit `land_parcels`

### Issue: Parcels don't appear in SurveyPro
**Solution:** Check project_id in database:
```sql
SELECT id, project_id, stand FROM land_parcels ORDER BY id DESC LIMIT 10;
```

If project_id is wrong, you edited the base table instead of the view.

---

## 🚀 Next Steps

1. **Test the manual workflow** (works now!)
2. **Optional:** Update frontend to auto-create views
3. **Optional:** Update QGIS modal to show view names

The core functionality is ready to use!
