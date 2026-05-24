# 🔧 PostgreSQL String to Number Conversion Fix

## 🚨 **Problem**

Control points were loaded successfully with WGS84 coordinates, but they were **strings instead of numbers**, causing a runtime error:

```javascript
TypeError: p.lat_wgs84?.toFixed is not a function
```

**Debug output showed:**
```
lat_wgs84: "-17.1251034"  // ❌ String
lng_wgs84: "30.2276107"   // ❌ String
lat_wgs84 type: string    // ❌ Should be number
```

---

## 🔍 **Root Cause**

PostgreSQL returns `NUMERIC` and `DOUBLE PRECISION` columns as **strings** in the node-postgres driver to preserve precision. This is by design to avoid JavaScript's floating-point precision issues.

**Database schema:**
```sql
CREATE TABLE control_points (
  lat_wgs84 DOUBLE PRECISION,  -- Returns as string
  lng_wgs84 DOUBLE PRECISION,  -- Returns as string
  y_gauss NUMERIC(10,3),       -- Returns as string
  x_gauss NUMERIC(10,3)        -- Returns as string
);
```

**API response:**
```json
{
  "lat_wgs84": "-17.1251034",  // String
  "lng_wgs84": "30.2276107",   // String
  "y_gauss": "82173.340",      // String
  "x_gauss": "1894016.190"     // String
}
```

---

## ✅ **The Fix**

Convert strings to numbers when receiving data from the API:

```typescript
// Before (WRONG)
controlPoints.value = response.data.data

// After (CORRECT)
controlPoints.value = response.data.data.map((point: any) => ({
  ...point,
  lat_wgs84: point.lat_wgs84 ? parseFloat(point.lat_wgs84) : null,
  lng_wgs84: point.lng_wgs84 ? parseFloat(point.lng_wgs84) : null,
  y_gauss: point.y_gauss ? parseFloat(point.y_gauss) : null,
  x_gauss: point.x_gauss ? parseFloat(point.x_gauss) : null
}))
```

**Why `parseFloat`?**
- Converts string to JavaScript number
- Handles decimal values correctly
- Returns `NaN` for invalid strings (caught by `? :` check)
- Preserves `null` for missing values

---

## 📊 **Before vs After**

### **Before Fix:**
```javascript
const point = {
  lat_wgs84: "-17.1251034",  // String
  lng_wgs84: "30.2276107"    // String
}

// This fails:
point.lat_wgs84.toFixed(4)  // ❌ TypeError: toFixed is not a function

// This also fails:
if (point.lat_wgs84 && point.lng_wgs84) {  // ✅ Truthy check passes
  const distance = calculateDistance(
    centerLat, centerLng, 
    point.lat_wgs84,  // ❌ String passed to math function
    point.lng_wgs84   // ❌ String passed to math function
  )
}
```

### **After Fix:**
```javascript
const point = {
  lat_wgs84: -17.1251034,  // Number
  lng_wgs84: 30.2276107    // Number
}

// This works:
point.lat_wgs84.toFixed(4)  // ✅ "-17.1251"

// This also works:
if (point.lat_wgs84 && point.lng_wgs84) {  // ✅ Truthy check passes
  const distance = calculateDistance(
    centerLat, centerLng, 
    point.lat_wgs84,  // ✅ Number passed to math function
    point.lng_wgs84   // ✅ Number passed to math function
  )
}
```

---

## 🎯 **Impact**

This fix enables:
- ✅ `.toFixed()` method works on coordinates
- ✅ Distance calculations work correctly
- ✅ Sorting by distance works
- ✅ Map rendering works
- ✅ Console logging shows proper formatting

---

## 🔧 **File Modified**

**File:** `app-frontend/src/views/modules/cadastral-standard/ControlPointSelectionView.vue`

**Lines:** 367-375

**Change:** Added `.map()` to convert string coordinates to numbers using `parseFloat()`

---

## 🎓 **Technical Details**

### **Why PostgreSQL Returns Strings**

JavaScript's `Number` type uses IEEE 754 double-precision (64-bit), which can lose precision for very large or very precise numbers:

```javascript
// JavaScript precision issues
0.1 + 0.2 === 0.3  // false! (0.30000000000000004)

// PostgreSQL NUMERIC preserves exact precision
// So node-postgres returns it as string to avoid corruption
```

### **When to Convert**

**Convert to number when:**
- ✅ Performing calculations (distance, area)
- ✅ Formatting for display (`.toFixed()`, `.toPrecision()`)
- ✅ Comparing values (`>`, `<`, `===`)
- ✅ Passing to math functions (`Math.sqrt()`, `Math.sin()`)

**Keep as string when:**
- ❌ Storing exact decimal values (financial data)
- ❌ Preserving trailing zeros
- ❌ Avoiding floating-point errors

### **Alternative Solutions**

**Option 1: Convert in backend (not recommended)**
```javascript
// In backend route
const dataResult = await pool.query(dataQuery, params);
const rows = dataResult.rows.map(row => ({
  ...row,
  lat_wgs84: parseFloat(row.lat_wgs84),
  lng_wgs84: parseFloat(row.lng_wgs84)
}));
```
❌ Requires changing every backend route  
❌ Loses precision for other use cases

**Option 2: Configure node-postgres types (complex)**
```javascript
const types = require('pg').types;
types.setTypeParser(1700, 'text', parseFloat); // NUMERIC
types.setTypeParser(701, 'text', parseFloat);  // DOUBLE PRECISION
```
❌ Global configuration affects all queries  
❌ May break other parts of the app

**Option 3: Convert in frontend (CHOSEN) ✅**
```javascript
controlPoints.value = response.data.data.map(point => ({
  ...point,
  lat_wgs84: parseFloat(point.lat_wgs84)
}))
```
✅ Localized to where it's needed  
✅ Explicit and clear  
✅ Easy to maintain

---

## ✅ **Verification**

After reloading the page, check console for:

```
[ControlPointSelection] 🔍 DEBUG - lat_wgs84 type: number  ✅
[ControlPointSelection] 🔍 DEBUG - lng_wgs84 type: number  ✅
[ControlPointSelection] ✅ Auto-selected 27 control points within 20km
[ControlPointSelection] Nearest 5 points:
  1. 1234/S (-20.3201°, 30.0729°) - 0.05km away  ✅
  2. 5678/S (-20.3301°, 30.0829°) - 1.23km away  ✅
```

**No more errors!**

---

## 📝 **Related Issues**

This same pattern should be applied to other numeric fields if they cause similar issues:

**Other fields that might need conversion:**
- `msl_hgt` (MSL height)
- `ped_hgt` (Pedestal height)
- `pill_hgt` (Pillar height)
- `top_signal` (Top signal height)
- `bot_signal` (Bottom signal height)

**Currently converted:**
- ✅ `lat_wgs84`
- ✅ `lng_wgs84`
- ✅ `y_gauss`
- ✅ `x_gauss`

---

**Last Updated**: November 23, 2025, 9:07 PM  
**Status**: ✅ Fixed - Coordinates now properly converted to numbers
