# Quick Test Checklist - Area Computation Module

## 🚀 Start Servers

```bash
# Terminal 1 - Backend
cd app-backend
npm start

# Terminal 2 - Frontend  
cd app-frontend
npm run dev
```

**Important:** After code changes, **hard refresh** the browser: `Ctrl + Shift + R`

---

## ✅ Quick Test (5 minutes)

### 1. Navigate to Module
- Login → Cadastral Standard → Import CSV
- Complete: Field Book → Calculations Part 1 → Coordinate List
- Navigate to **Area Computation**

### 2. Verify Map Loads
- [ ] 10 blue points visible
- [ ] Points are CLEAR and LARGE (not tiny dots)
- [ ] Labels show: ST1, ST2, P1, P2, etc.
- [ ] Can zoom in/out smoothly
- [ ] "Fit View" button works

### 3. Draw One Parcel
- [ ] Click "Draw Polygon"
- [ ] Click 4 points (ST1 → ST2 → P2 → P1)
- [ ] Press ESC
- [ ] Enter "LOT 1"
- [ ] Area displays automatically
- [ ] Parcel appears in results list

### 4. Save & Export
- [ ] Click "Save to Database" → Success message
- [ ] Click "Export PDF" → PDF downloads
- [ ] Open PDF → Verify content

---

## 🔍 What to Check in PDF

- [ ] Cover page with project name
- [ ] Summary with total area
- [ ] Parcel table with LOT 1
- [ ] Detailed breakdown with coordinates
- [ ] Surveyor signature block

---

## ⚠️ If Map Zoom Not Working

1. **Clear Browser Cache:**
   - Press `F12` → Console tab
   - Right-click Refresh icon → "Empty Cache and Hard Reload"

2. **Verify File Saved:**
```bash
# Check last modified time
ls -l app-frontend/src/views/modules/cadastral-standard/AreaComputationView.vue
```

3. **Check Console for Errors:**
   - Press `F12` → Console tab
   - Look for red error messages

---

## 📊 Expected Values (Test Data)

**Parcel: ST1 → ST2 → P2 → P1**
- Points: 4
- Area: ~15,000-20,000 m² (1.5-2.0 ha)
- Closure Error: < 0.5 m (should be "Good" quality)

---

## 🐛 Common Issues

| Problem | Solution |
|---------|----------|
| Map empty/blank | Hard refresh browser (Ctrl+Shift+R) |
| Points too small | Code changes not applied - refresh again |
| Can't zoom in enough | Check maxZoom in code = 20 |
| Save fails | Check backend server running |
| PDF blank | Check browser console for errors |

---

## ✨ Success Criteria

✅ Points clearly visible on map
✅ Can zoom in very close (to see point details)
✅ Can draw polygon and get area
✅ Can save to database
✅ Can generate PDF report

**If all 5 pass → Module is working!** 🎉
