# 🔍 Test API Response - Manual Check

## **Problem**
Frontend shows all 4,393 control points are missing WGS84 coordinates, even after successful database conversion.

## **Manual Test Steps**

### **Step 1: Open Browser DevTools**
1. Press **F12** to open DevTools
2. Go to **Network** tab
3. Clear network log (trash icon)

### **Step 2: Trigger API Call**
1. In your app, navigate to Control Point Selection
2. The API call should appear in Network tab

### **Step 3: Inspect API Response**
1. Click on the request: `control-points?gauss_lo=31&limit=5000`
2. Click **Response** tab
3. Look for the first item in `data` array

### **Expected Response (CORRECT)**
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
      "lat_wgs84": -18.331083,  // ✅ Should be a NUMBER
      "lng_wgs84": 26.450414,   // ✅ Should be a NUMBER
      "area_nm": "Hwange"
    }
  ]
}
```

### **Wrong Response (PROBLEM)**
```json
{
  "data": [
    {
      "id": 1,
      "monu_num": "1036/S",
      "lat_wgs84": null,  // ❌ NULL means database doesn't have it
      "lng_wgs84": null   // ❌ NULL means database doesn't have it
    }
  ]
}
```

---

## **Alternative: Test with Browser**

Open this URL directly in your browser:
```
http://localhost:3050/api/control-points?gauss_lo=31&limit=3
```

You should see JSON with `lat_wgs84` and `lng_wgs84` as numbers (not null).

---

## **What to Check**

### **If lat_wgs84 and lng_wgs84 are NULL:**
❌ Database doesn't have the coordinates
- Re-run: `npm run convert:wgs84:correct` in app-backend
- Backend might be connected to wrong database

### **If lat_wgs84 and lng_wgs84 are NUMBERS:**
✅ Backend is working correctly
- Problem is in frontend
- Clear browser cache
- Hard refresh (Ctrl+Shift+R)

---

## **Console Debug Output**

After adding debug logging, you should see:
```
[ControlPointSelection] 🔍 DEBUG - First control point: {id: 1, monu_num: "1036/S", ...}
[ControlPointSelection] 🔍 DEBUG - Has lat_wgs84? -18.331083
[ControlPointSelection] 🔍 DEBUG - Has lng_wgs84? 26.450414
[ControlPointSelection] 🔍 DEBUG - lat_wgs84 type: number
[ControlPointSelection] 🔍 DEBUG - lng_wgs84 type: number
```

**If you see `null` or `undefined`:**
- Backend is not returning the data
- Check backend logs for errors
- Verify database connection

---

## **Quick Database Check**

You can manually check the database using pgAdmin or psql:

```sql
SELECT 
  monu_num,
  lat_wgs84,
  lng_wgs84
FROM control_points
WHERE gauss_lo = 31
LIMIT 5;
```

**Expected:**
```
 monu_num | lat_wgs84  | lng_wgs84
----------+------------+-----------
 1036/S   | -18.331083 | 26.450414
 1039/S   | -20.338076 | 28.227845
```

**If you see NULL:**
- Conversion didn't work
- Re-run the conversion script

---

**Check these and report back what you see!**
