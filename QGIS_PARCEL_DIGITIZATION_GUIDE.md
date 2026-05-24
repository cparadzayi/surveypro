# 🗺️ QGIS Parcel Digitization Guide - Maglas Dataset

## 📋 Overview

This guide walks you through digitizing 160 land parcels in QGIS using the exported coordinate points from SurveyPro.

**Time Required:** 2-3 hours for 160 parcels  
**Skill Level:** Intermediate QGIS user  
**Result:** 100% accurate parcels with proper closure and areas

---

## 🚀 Quick Start Workflow

### **Step 1: Export Coordinate Points to Database** ✅

1. Open SurveyPro → Navigate to **Areas Module**
2. Select your project (Maglas dataset)
3. Click **"Export to Database"** button
4. Verify: 298 points exported to `coordinate_points` table

**Expected Result:**
```
✅ 298 coordinate points exported to PostgreSQL
✅ Points visible in coordinate_points table
✅ Geometry column populated (PostGIS)
```

---

### **Step 2: Connect QGIS to SurveyPro Database**

#### **2.1 Get Connection Details**

In SurveyPro:
1. Click **"Show QGIS Connection Info"**
2. Copy the connection URI (automatically copied to clipboard)

**Connection Details:**
```
Host: localhost (or 127.0.0.1)
Port: 5432
Database: surveypro
Username: postgres
Password: [your password]
```

#### **2.2 Add PostGIS Connection in QGIS**

1. Open **QGIS Desktop**
2. Go to **Layer** → **Add Layer** → **Add PostGIS Layers**
3. Click **"New"** to create new connection
4. Fill in connection details:
   - **Name:** SurveyPro
   - **Host:** localhost
   - **Port:** 5432
   - **Database:** surveypro
   - **Username:** postgres
   - **Password:** [your password]
   - ✅ Check "Store" for username/password
5. Click **"Test Connection"** → Should show "Connection successful"
6. Click **OK**

---

### **Step 3: Load Coordinate Points Layer**

1. In **Add PostGIS Layers** dialog:
   - Select **"SurveyPro"** connection
   - Click **"Connect"**
2. Find and select **`coordinate_points`** table
3. Click **"Add"**
4. Points should appear on map canvas

#### **3.1 Configure Point Labels**

1. Right-click `coordinate_points` layer → **Properties**
2. Go to **Labels** tab
3. Select **"Single Labels"**
4. **Value:** Choose `name` field (shows point IDs like "1438A", "1439A")
5. **Text** tab:
   - Font size: 8-10pt
   - Color: Black
   - Buffer: White (2px) for visibility
6. Click **OK**

**Result:** All 298 points labeled with their IDs (1438A, 1438B, 1438C, etc.)

---

### **Step 4: Create Parcels Layer**

#### **4.1 Create New Layer in Database**

1. Go to **Layer** → **Create Layer** → **New Shapefile Layer** (temporary)
   - **Geometry type:** Polygon
   - **CRS:** EPSG:22291 (Cape / Lo31) - **IMPORTANT!**
   - Add field: `designation` (Text, length 50)
   - Add field: `stand_number` (Integer)
   - Save as: `temp_parcels.shp`

2. **OR** Create directly in database:
   - **Database** → **DB Manager**
   - Select **PostGIS** → **surveypro**
   - **Database** → **SQL Window**
   - Run this SQL:

```sql
CREATE TABLE IF NOT EXISTS land_parcels_temp (
    id SERIAL PRIMARY KEY,
    project_id INTEGER,
    designation VARCHAR(100),
    stand_number INTEGER,
    geom GEOMETRY(Polygon, 22291),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_land_parcels_temp_geom ON land_parcels_temp USING GIST(geom);
```

3. Refresh layers → Load `land_parcels_temp` table

---

### **Step 5: Enable Snapping (CRITICAL)**

**This ensures corners align perfectly!**

1. Go to **Project** → **Snapping Options** (or press `S`)
2. Enable snapping:
   - ✅ **Enable Snapping** (toggle on)
   - **Snap to:** Vertex
   - **Layer:** `coordinate_points`
   - **Tolerance:** 5 meters
   - **Units:** Meters
3. ✅ Enable **Topological Editing** (prevents gaps/overlaps)
4. ✅ Enable **Snapping on Intersection**

**Visual Indicator:** Pink cross appears when cursor snaps to a point

---

### **Step 6: Digitize Parcels**

#### **6.1 Start Editing**

1. Select `land_parcels_temp` layer
2. Click **Toggle Editing** (pencil icon) or press `Ctrl+E`
3. Click **Add Polygon Feature** (polygon icon)

#### **6.2 Digitize First Parcel (STAND 1438)**

**Points to use:** 1438A, 1438B, 1438C, 1439A (shared corner)

1. **Click on 1438A** (should snap - pink cross appears)
2. **Click on 1438B** (snap to this point)
3. **Click on 1438C** (snap to this point)
4. **Click on 1439A** (shared corner with next stand)
5. **Right-click** to finish polygon
6. Enter attributes:
   - `designation`: STAND 1438
   - `stand_number`: 1438
7. Click **OK**

**Visual Check:**
- ✅ Polygon closes properly (no gaps)
- ✅ All corners snap to coordinate points
- ✅ Polygon fills with color

#### **6.3 Continue with Remaining Parcels**

**Strategy for efficiency:**

1. **Work sequentially** (1438 → 1439 → 1440 → ...)
2. **Reuse shared corners** (1439A is shared between 1438 and 1439)
3. **Use keyboard shortcuts:**
   - `Ctrl+.` : Repeat last values (for project_id)
   - `Ctrl+Z` : Undo
   - `Ctrl+S` : Save edits

**For stands with only A and C corners:**
- **Infer B and D corners** by creating a rectangle
- Use **Advanced Digitizing Toolbar** for perpendicular lines
- Or estimate based on adjacent parcels

**Time estimate:**
- Simple parcels (4 corners): 30-60 seconds each
- Complex parcels (5+ corners): 1-2 minutes each
- **Total: 2-3 hours for 160 parcels**

---

### **Step 7: Validate Topology**

After digitizing all parcels:

1. Go to **Vector** → **Topology Checker**
2. Configure rules:
   - ✅ **Must not have gaps** (parcels should be adjacent)
   - ✅ **Must not overlap** (no double-counting)
   - ✅ **Must not have invalid geometries**
3. Click **"Validate All"**
4. Fix any errors reported

---

### **Step 8: Export to SurveyPro Database**

#### **8.1 If using temporary shapefile:**

1. Right-click `temp_parcels` layer → **Export** → **Save Features As**
2. **Format:** PostGIS
3. **Connection:** SurveyPro
4. **Schema:** public
5. **Table:** land_parcels
6. **Geometry column:** geom
7. **CRS:** EPSG:22291
8. Click **OK**

#### **8.2 If already in database:**

Just save edits:
1. Click **Save Edits** (floppy disk icon)
2. Click **Toggle Editing** to finish

---

### **Step 9: Compute Areas in SurveyPro**

1. Return to **SurveyPro** → **Areas Module**
2. Click **"Refresh Parcels"** to load from database
3. Click **"Run Batch Computation"**
4. Review results:
   - ✅ Area (m²)
   - ✅ Area (ha)
   - ✅ Perimeter (m)
   - ✅ Closure error (should be ~0.00m with proper snapping)

---

## 🎯 **Tips for Efficient Digitization**

### **Keyboard Shortcuts**

| Action | Shortcut |
|--------|----------|
| Toggle Editing | `Ctrl+E` |
| Add Polygon | `Ctrl+.` |
| Save Edits | `Ctrl+S` |
| Undo | `Ctrl+Z` |
| Redo | `Ctrl+Y` |
| Delete Feature | `Delete` |
| Pan Map | Hold `Space` + drag |
| Zoom In | `Ctrl+Scroll Up` |

### **Digitization Best Practices**

1. ✅ **Always snap to coordinate points** (pink cross indicator)
2. ✅ **Work systematically** (left to right, top to bottom)
3. ✅ **Save frequently** (every 10-20 parcels)
4. ✅ **Zoom in close** when clicking corners (1:500 scale)
5. ✅ **Use attribute form** to auto-fill project_id
6. ✅ **Take breaks** every 30-40 parcels

### **Handling Special Cases**

#### **Stands with only A and C corners:**

**Option 1: Rectangle (if parcels are regular)**
1. Click A corner
2. Use **Advanced Digitizing** → **Perpendicular** mode
3. Create perpendicular line to estimate B
4. Mirror for D corner
5. Complete rectangle

**Option 2: Estimate from neighbors**
1. Look at adjacent parcels
2. Estimate where B and D should be
3. Create polygon
4. **Mark in notes** that corners were estimated

#### **Irregular parcels (5+ corners):**

Example: STAND 1448 (has A, C, D, E corners)
1. Click all known corners in order
2. Use topology to ensure no gaps with neighbors
3. Close polygon

---

## 📊 **Quality Control Checklist**

After digitizing all parcels:

- [ ] All 160 parcels digitized
- [ ] No gaps between adjacent parcels
- [ ] No overlaps between parcels
- [ ] All corners snap to coordinate points
- [ ] Designation field filled for all parcels
- [ ] Stand numbers are correct
- [ ] Topology validation passed
- [ ] Exported to SurveyPro database
- [ ] Batch computation completed
- [ ] Closure errors < 0.5m (ideally ~0.00m)

---

## 🐛 **Troubleshooting**

### **Problem: Points not snapping**

**Solution:**
1. Check snapping is enabled (`S` key)
2. Increase tolerance to 10-15 meters
3. Zoom in closer (1:200 scale)
4. Verify CRS matches (EPSG:22291)

### **Problem: Polygon won't close**

**Solution:**
1. Right-click to finish (don't click first point again)
2. Check you have at least 3 points
3. Verify no duplicate points

### **Problem: Can't see point labels**

**Solution:**
1. Layer Properties → Labels → Enable
2. Increase font size
3. Add white buffer for contrast
4. Zoom in closer

### **Problem: Database connection fails**

**Solution:**
1. Verify PostgreSQL is running
2. Check firewall settings
3. Test connection in pgAdmin
4. Verify credentials

---

## 📈 **Expected Results**

After completing this workflow:

```
✅ 160 parcels digitized in QGIS
✅ All corners aligned to coordinate points
✅ Topology validated (no gaps/overlaps)
✅ Areas computed accurately
✅ Closure errors ~0.00m (perfect closure)
✅ Data exported to SurveyPro database
✅ Ready for cadastral submission
```

---

## 🎓 **Next Steps**

1. **Generate reports** in SurveyPro (PDF/CSV)
2. **Export to DXF/DWG** for CAD software
3. **Create cadastral diagrams** with labels
4. **Submit to Surveyor General** 🎉

---

## 💡 **Pro Tips**

1. **Use dual monitors** - QGIS on one, SurveyPro on other
2. **Create QGIS project template** with snapping pre-configured
3. **Use attribute forms** to auto-increment stand numbers
4. **Save QGIS project** to resume later if needed
5. **Export intermediate backups** every 50 parcels

---

## 📞 **Need Help?**

If you encounter issues:
1. Check this guide's troubleshooting section
2. Verify all prerequisites are met
3. Test with a small sample (5-10 parcels) first
4. Consult QGIS documentation for advanced features

---

**Good luck with your digitization! You've got this! 🚀**

*Estimated completion time: 2-3 hours for 160 parcels*
*Quality: Professional-grade cadastral data*
