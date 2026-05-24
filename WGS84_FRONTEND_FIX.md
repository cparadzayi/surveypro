# 🔧 WGS84 Coordinates Not Showing in Frontend - Fix Guide

## 🚨 **Problem**

After running the correct WGS84 conversion, the frontend shows:
```
⚠️ 4393 control points skipped (missing WGS84 coordinates)
Points with WGS84 coordinates: 0
```

But the database conversion was successful (7,369 points converted).

---

## 🔍 **Root Cause**

The issue is **NOT** with the database or backend code. The problem is:

1. ✅ Database has WGS84 coordinates
2. ✅ Backend API includes `lat_wgs84, lng_wgs84` in queries
3. ❌ **Frontend has cached old API responses** (before conversion)
4. ❌ **OR Backend server needs restart** to clear connection pool

---

## ✅ **Solution Steps**

### **Step 1: Verify Database Has WGS84 Coordinates**

```bash
cd app-backend
npm run check:wgs84
```

**Expected output:**
```
 monu_num | lat_wgs84  | lng_wgs84 | status
----------+------------+-----------+---------
 1036/S   | -18.331083 | 26.450414 | ✅ Valid
 1039/S   | -20.338076 | 28.227845 | ✅ Valid
 ...

 gauss_lo | total | with_wgs84 | percent_complete
----------+-------+------------+------------------
       27 |   164 |        164 |           100.00
       29 |  2239 |       2239 |           100.00
       31 |  4393 |       4393 |           100.00
       33 |   573 |        573 |           100.00
```

If you see `percent_complete: 100.00` → Database is fine! ✅

---

### **Step 2: Restart Backend Server**

The backend might have cached database connections with old schema.

```bash
# Stop backend (Ctrl+C if running)
cd app-backend

# Restart backend
npm run dev
```

**Look for:**
```
Server listening on http://localhost:3050
```

---

### **Step 3: Clear Frontend Cache & Restart**

```bash
# Stop frontend (Ctrl+C if running)
cd app-frontend

# Clear Vite cache
rm -rf node_modules/.vite

# Restart frontend
npm run dev
```

---

### **Step 4: Hard Refresh Browser**

1. Open browser DevTools (F12)
2. Go to **Network** tab
3. Check **Disable cache**
4. Hard refresh: **Ctrl+Shift+R** (Windows) or **Cmd+Shift+R** (Mac)

---

### **Step 5: Test API Directly**

Open browser and navigate to:
```
http://localhost:3050/api/control-points?gauss_lo=31&limit=5
```

**Check the response JSON:**
```json
{
  "data": [
    {
      "id": 1,
      "monu_num": "1036/S",
      "monu_name": "MATONGA",
      "gauss_lo": 31,
      "y_gauss": 58060.67,
      "x_gauss": 2027415.98,
      "lat_wgs84": -18.331083,  // ✅ Should be present!
      "lng_wgs84": 26.450414,   // ✅ Should be present!
      "area_nm": "Hwange"
    }
  ]
}
```

**If `lat_wgs84` and `lng_wgs84` are NULL:**
- Backend needs restart
- Database connection pool is cached

**If they are present:**
- Frontend cache issue
- Browser needs hard refresh

---

### **Step 6: Check Frontend Console**

After restarting everything, go to Control Point Selection and check console:

**Expected:**
```
[ControlPointSelection] ✅ Loaded 4393 control points for Lo31
[ControlPointSelection] Points with WGS84 coordinates: 4393  // ✅ Should be > 0
[ControlPointSelection] ✅ Auto-selected 15 control points within 20km
```

---

## 🎯 **Quick Fix Checklist**

- [ ] Run `npm run check:wgs84` to verify database
- [ ] Restart backend server (`npm run dev`)
- [ ] Restart frontend server (`npm run dev`)
- [ ] Hard refresh browser (Ctrl+Shift+R)
- [ ] Test API endpoint directly
- [ ] Check frontend console logs

---

## 🔧 **Advanced Troubleshooting**

### **If API Returns NULL for WGS84**

Check if backend is using correct database:

```bash
# In app-backend/.env
DB_NAME=surveypro_v1  # ✅ Correct
# NOT surveypro_app   # ❌ Wrong
```

Restart backend after changing `.env`.

---

### **If Frontend Still Shows 0 Points**

Add debug logging to see what API returns:

**In `ControlPointSelectionView.vue` (line 347):**
```typescript
if (response.data && Array.isArray(response.data.data)) {
  controlPoints.value = response.data.data
  
  // 🔍 DEBUG: Log first point to see structure
  console.log('[DEBUG] First control point:', response.data.data[0])
  console.log('[DEBUG] Has lat_wgs84?', response.data.data[0]?.lat_wgs84)
  console.log('[DEBUG] Has lng_wgs84?', response.data.data[0]?.lng_wgs84)
  
  console.log(`[ControlPointSelection] ✅ Loaded ${controlPoints.value.length} control points for Lo${loZone}`)
  // ...
}
```

This will show you exactly what the API is returning.

---

### **If Database Shows Missing WGS84**

Re-run the conversion:

```bash
cd app-backend
npm run convert:wgs84:correct
```

---

## 📊 **Verification**

After fixing, you should see:

### **Console Output:**
```
[ControlPointSelection] ✅ Loaded 4393 control points for Lo31
[ControlPointSelection] 🎯 Auto-selecting control points within 20km of survey center...
[ControlPointSelection] Survey center: [-20.320459, 30.072915]
[ControlPointSelection] Total control points available: 4393
[ControlPointSelection] Points with WGS84 coordinates: 4393  ✅
[ControlPointSelection] ✅ Auto-selected 15 control points within 20km
[ControlPointSelection] Nearest 5 points:
  1. 1234/S (-20.3201°, 30.0729°) - 0.05km away
  2. 5678/S (-20.3301°, 30.0829°) - 1.23km away
  ...
```

### **UI:**
- ✅ Green success banner appears
- ✅ Control points list shows selected points
- ✅ Map displays control points in correct locations

---

## 🎉 **Success Criteria**

- ✅ `npm run check:wgs84` shows 100% coverage
- ✅ API endpoint returns `lat_wgs84` and `lng_wgs84` values
- ✅ Frontend console shows "Points with WGS84 coordinates: 4393"
- ✅ Auto-selection finds nearby points
- ✅ Map displays control points correctly

---

## 📝 **Common Mistakes**

### **1. Forgot to Restart Backend**
❌ Backend still has old database connection pool  
✅ Always restart after database changes

### **2. Browser Cache**
❌ Browser serving old API responses  
✅ Hard refresh (Ctrl+Shift+R) or disable cache in DevTools

### **3. Wrong Database**
❌ Backend connected to `surveypro_app` instead of `surveypro_v1`  
✅ Check `.env` file and restart

### **4. Frontend Cache**
❌ Vite cached old modules  
✅ Delete `node_modules/.vite` and restart

---

## 🔗 **Related Files**

- **Backend API**: `app-backend/src/routes/control-points.js` (lines 98-104)
- **Frontend Component**: `app-frontend/src/views/modules/cadastral-standard/ControlPointSelectionView.vue`
- **Database Script**: `app-backend/scripts/populate-wgs84-cape-datum-correct.sql`
- **Verification Script**: `app-backend/scripts/check-wgs84-sample.sql`

---

**Last Updated**: November 23, 2025  
**Status**: ✅ Troubleshooting Guide Ready
