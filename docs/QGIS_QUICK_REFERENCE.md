# 🎯 QGIS Quick Reference Card - Parcel Digitization

## ⚡ Essential Keyboard Shortcuts

| Action | Shortcut | Notes |
|--------|----------|-------|
| **Toggle Editing** | `Ctrl+E` | Start/stop editing mode |
| **Add Polygon** | Click toolbar | Or use `Ctrl+.` after setup |
| **Save Edits** | `Ctrl+S` | Save every 10-20 parcels! |
| **Undo** | `Ctrl+Z` | Fix mistakes |
| **Redo** | `Ctrl+Y` | Restore undone action |
| **Delete Feature** | `Delete` | Remove selected polygon |
| **Pan Map** | `Space + Drag` | Move around canvas |
| **Zoom In** | `Ctrl+Scroll Up` | Or use mouse wheel |
| **Zoom Out** | `Ctrl+Scroll Down` | Or use mouse wheel |
| **Snapping Options** | `S` | Toggle snapping panel |

---

## 📍 Snapping Settings (CRITICAL!)

**Enable These:**
- ✅ Enable Snapping (toggle ON)
- ✅ Snap to: **Vertex**
- ✅ Layer: **coordinate_points**
- ✅ Tolerance: **5 meters**
- ✅ Topological Editing
- ✅ Snapping on Intersection

**Visual Indicator:** Pink cross = snapped to point ✅

---

## 🔄 Digitization Workflow (Per Parcel)

1. **Zoom in** to parcel area (1:500 scale)
2. **Click "Add Polygon"** tool
3. **Click corners** in order (watch for pink cross!)
   - Example: 1438A → 1438B → 1438C → 1439A
4. **Right-click** to finish polygon (don't click first point again)
5. **Enter attributes:**
   - `designation`: STAND 1438
   - `stand_number`: 1438
6. **Click OK**
7. **Repeat** for next parcel

**Time per parcel:** 30-60 seconds

---

## 🎨 Layer Styling Tips

**Coordinate Points:**
- Symbol: Circle
- Size: 2-3mm
- Color: Red (visible against parcels)
- Labels: Black text, white buffer

**Parcels:**
- Fill: Semi-transparent (50% opacity)
- Outline: Black, 0.5mm
- Color: Green (valid), Yellow (in progress)

---

## 🐛 Common Issues & Quick Fixes

### **Points not snapping**
→ Press `S`, check snapping enabled, increase tolerance to 10m

### **Polygon won't close**
→ Right-click to finish (don't click first point)

### **Can't see labels**
→ Layer Properties → Labels → Increase font size

### **Wrong CRS**
→ Must be EPSG:22291 (Cape / Lo31)

### **Topology errors**
→ Use Topology Checker, fix gaps/overlaps

---

## 📊 Progress Tracking

**Total Parcels:** 160

**Batches:**
- Batch 1 (1438-1447): ☐ 10 parcels
- Batch 2 (1448-1467): ☐ 20 parcels
- Batch 3 (1468-1487): ☐ 20 parcels
- Batch 4 (1488-1507): ☐ 20 parcels
- Batch 5 (1508-1527): ☐ 20 parcels
- Batch 6 (1528-1547): ☐ 20 parcels
- Batch 7 (1548-1567): ☐ 20 parcels
- Batch 8 (1568-1587): ☐ 20 parcels
- Batch 9 (1588-1597): ☐ 10 parcels

**Save after each batch!** (Ctrl+S)

---

## 🎯 Quality Checklist

Before finishing:
- [ ] All 160 parcels digitized
- [ ] No gaps between parcels
- [ ] No overlaps
- [ ] All corners snapped to points
- [ ] Topology validation passed
- [ ] Saved to database

---

## 💡 Pro Tips

1. **Work systematically** - Left to right, top to bottom
2. **Save frequently** - Every 10-20 parcels
3. **Zoom in close** - 1:500 scale when clicking corners
4. **Use dual monitors** - QGIS + SurveyPro side-by-side
5. **Take breaks** - Every 30-40 parcels (stretch!)
6. **Check snapping** - Pink cross should appear on every click

---

## 🔢 Stand Number Patterns

**Complete corners (A, B, C, D):**
- STAND 1438: 1438A, 1438B, 1438C, 1439A (shared)
- STAND 1447: 1447A, 1447E (5 corners)

**Incomplete corners (A, C only):**
- STAND 1439: 1439A only → Estimate B, D
- STAND 1440: 1440A only → Estimate B, D

**Strategy:** Create rectangle using perpendicular lines

---

## 📐 Coordinate Reference System

**MUST USE:** EPSG:22291 (Cape / Lo31)

**Verify:**
- Bottom-right corner of QGIS: Should show "EPSG:22291"
- Layer Properties → CRS: Cape / Lo31

**If wrong:** Right-click layer → Set CRS → Search "22291"

---

## 🚀 Speed Optimization

**Fastest workflow:**
1. Set up snapping once (beginning)
2. Configure labels once (beginning)
3. Create attribute form template (auto-fill project_id)
4. Use keyboard shortcuts (Ctrl+E, Ctrl+S)
5. Work in batches of 10-20 parcels
6. Don't zoom in/out excessively

**Target:** 2-3 parcels per minute = 160 parcels in 60-90 minutes

---

## 📞 Emergency Contacts

**Database Connection:**
- Host: localhost
- Port: 5432
- Database: surveypro
- Username: postgres

**QGIS Help:**
- Press `F1` for context help
- Help → User Guide
- https://docs.qgis.org

---

## ✅ Final Export Steps

1. **Save all edits** (Ctrl+S)
2. **Toggle editing off** (Ctrl+E)
3. **Verify count:** Open attribute table → 160 rows
4. **Export to database:**
   - Right-click layer → Export → PostGIS
   - Table: land_parcels
   - CRS: EPSG:22291
5. **Return to SurveyPro:**
   - Refresh Parcels
   - Run Batch Computation
   - Verify closure errors < 0.5m

---

## 🎉 Success Metrics

**Excellent Quality:**
- ✅ 160/160 parcels digitized
- ✅ Closure errors < 0.1m
- ✅ No topology errors
- ✅ All corners snapped

**Good Quality:**
- ✅ 160/160 parcels digitized
- ✅ Closure errors < 0.5m
- ✅ Minor topology errors fixed
- ✅ Most corners snapped

**Acceptable Quality:**
- ✅ 160/160 parcels digitized
- ✅ Closure errors < 1.0m
- ✅ All topology errors fixed
- ✅ Corners aligned reasonably

---

**Print this card and keep it next to your keyboard!** 📄

**Estimated Time:** 2-3 hours  
**Difficulty:** Intermediate  
**Result:** Professional-grade cadastral data ✨
