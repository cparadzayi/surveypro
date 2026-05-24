# Land Parcel Map Overlay - Diagnostic Guide 🏘️

## ✅ **Feature Status: IMPLEMENTED**

Land parcels are already coded to display on the map! If you're not seeing them, let's debug.

---

## 🔍 **Expected Console Output:**

After refreshing the page and navigating to Calculations Part 2, you should see:

```javascript
// Parcel loading:
🔍 [Areas2View] Loading land parcels for project 23...
✅ [Areas2View] Loaded 3 land parcels
   Sample: {id: 1, stand: "Stand 2399", geom: {...}, ...}

// Map rendering:
[DataMap] 🏘️ Rendering 3 land parcels on map
[DataMap] First parcel sample: {id: 1, stand: "Stand 2399", ...}
[DataMap] Parcel Stand 2399: Using parcel.geom, coords count: 4
[DataMap] ✅ Created polygon for parcel Stand 2399, vertices: 4
[DataMap] Rendered parcel: Stand 2399
[DataMap] Parcel Stand 2400: Using parcel.geom, coords count: 4
[DataMap] ✅ Created polygon for parcel Stand 2400, vertices: 4
[DataMap] Rendered parcel: Stand 2400
[DataMap] Parcel Stand 2401: Using parcel.geom, coords count: 4
[DataMap] ✅ Created polygon for parcel Stand 2401, vertices: 4
[DataMap] Rendered parcel: Stand 2401
```

---

## 🎨 **Expected Visual:**

### **On the Map:**

1. **Violet polygon borders** (thick, 3px width)
2. **Semi-transparent violet fill** (25% opacity)
3. **Purple stand labels** at polygon centers (e.g., "Stand 2399")
4. **Click polygon** → Popup with area, owner, notes

### **In the UI:**

```
Points Layer: ✓ MSU 2 - Coordinate List Points ✓ Automatic
SRID 22289   📍 542 points on map
🏘️ 3 land parcels   [🔄 Refresh]  ← Shows parcel count
```

---

## 🧪 **Diagnostic Steps:**

### **Step 1: Check Console**

1. Open browser console (F12)
2. Refresh page (Ctrl+Shift+R)
3. Navigate to Calculations Part 2
4. **Look for:**
   - `✅ [Areas2View] Loaded X land parcels`
   - `[DataMap] 🏘️ Rendering X land parcels on map`
   - `[DataMap] ✅ Created polygon for parcel...`

### **Step 2: Check Parcel Count Badge**

Look for the purple badge in the UI:
```
🏘️ 3 land parcels   [🔄 Refresh]
```

**If it shows "🏘️ 0 land parcels":**
- No parcels in database for this project
- Click "🔄 Refresh" to reload
- Check database: `SELECT * FROM land_parcels WHERE project_id = 23`

### **Step 3: Check Map Rendering**

**If parcels loaded but NOT visible on map:**

1. **Check console for errors** (red text)
2. **Check geometry format:**
   ```javascript
   [DataMap] First parcel sample: {...}
   ```
   - Should have `geom` or `geometry` property
   - Should be GeoJSON format: `{type: "Polygon", coordinates: [[[...]]]}`

3. **Check coordinate system:**
   - Parcels must use same SRID as points (22289)
   - Console shows coordinate conversion

4. **Zoom out** - parcels might be outside current view
   - Use map controls or mouse wheel

### **Step 4: Check Polygon Visibility**

**Parcels render with:**
- Color: `#7c3aed` (violet-600)
- Fill: `#a78bfa` (violet-400)
- Opacity: 25%
- Border weight: 3px

**If still not visible:**
- Check browser zoom level (100%?)
- Check if other map layers are covering them
- Try clicking on the map where parcels should be

---

## 📊 **Sample Parcel Data Structure:**

```json
{
  "id": 1,
  "project_id": 23,
  "stand": "Stand 2399",
  "geom": {
    "type": "Polygon",
    "coordinates": [
      [
        [8224772.45, 2103456.78],
        [8224780.12, 2103465.34],
        [8224785.67, 2103470.89],
        [8224772.45, 2103456.78]
      ]
    ]
  },
  "area_sqm": 10234.56,
  "owner": "John Doe",
  "notes": "Created from Areas2View"
}
```

---

## 🔧 **Common Issues:**

### **Issue 1: No parcels loaded**
```
✅ [Areas2View] Loaded 0 land parcels
```

**Cause:** No parcels in database for this project

**Solution:**
1. Create parcels in QGIS (digitize on `land_parcels` layer)
2. OR compute area in SurveyPro with designation
3. Click "🔄 Refresh" button

---

### **Issue 2: Parcels loaded but not rendered**
```
✅ [Areas2View] Loaded 3 land parcels
(No DataMap rendering logs)
```

**Cause:** Parcels not being passed to DataMap

**Solution:** Check console for errors, verify `:parcels` prop binding

---

### **Issue 3: Invalid geometry warning**
```
[DataMap] Invalid parcel geometry: Stand 2399 {...}
```

**Cause:** Malformed GeoJSON or missing coordinates

**Solution:**
- Check database: `SELECT stand, ST_AsGeoJSON(geom) FROM land_parcels`
- Verify polygon has at least 3 vertices
- Re-digitize in QGIS if corrupted

---

### **Issue 4: Parcels render but not visible**
```
[DataMap] ✅ Created polygon for parcel Stand 2399, vertices: 4
```

**Cause:** Parcels outside map viewport or styling issue

**Solution:**
1. Zoom out to see full project area
2. Check polygon color/opacity settings
3. Try clicking where parcels should be
4. Check browser developer tools for CSS issues

---

## 🎁 **Features:**

| Feature | Status | Description |
|---------|--------|-------------|
| **Load parcels** | ✅ | Auto-loads on mount and project change |
| **Display count** | ✅ | Shows "🏘️ X land parcels" badge |
| **Render polygons** | ✅ | Violet polygons on map |
| **Stand labels** | ✅ | Purple labels at centroids |
| **Popups** | ✅ | Click polygon for area/owner info |
| **Refresh button** | ✅ | Reload after QGIS edits |
| **Styling** | ✅ | Violet theme, distinct from points |

---

## 🧪 **Quick Test:**

```bash
# 1. Check database
SELECT project_id, stand, ST_NumPoints(geom) as vertices, area_sqm 
FROM land_parcels 
WHERE project_id = 23;

# Expected: 3 rows with stand names and area values
```

```javascript
// 2. Check browser console
// Should see:
✅ [Areas2View] Loaded 3 land parcels
[DataMap] 🏘️ Rendering 3 land parcels on map
```

```
3. Check UI
🏘️ 3 land parcels   [🔄 Refresh]  ← Should show count
```

```
4. Check Map
Look for violet polygons with purple stand labels
```

---

## 📋 **What to Send for Debugging:**

If parcels still not visible, send:

1. **Console output** (full text from F12)
2. **Screenshot** of map area
3. **Parcel count badge** value (0, 3, etc.)
4. **Database query result:**
   ```sql
   SELECT stand, ST_AsGeoJSON(geom) as geometry
   FROM land_parcels 
   WHERE project_id = 23 
   LIMIT 1;
   ```

---

## 🎉 **Expected Result:**

**Map should show:**
- ✅ 542 blue coordinate points (background)
- ✅ 3 violet parcel polygons (with borders)
- ✅ Purple stand labels ("Stand 2399", etc.)
- ✅ Clickable polygons (popup on click)

**All automatic - no manual setup needed!** 🗺️✨🏘️

---

**Refresh the page, open console (F12), and check the diagnostic output!** 🔍📊
