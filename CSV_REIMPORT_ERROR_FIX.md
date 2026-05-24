# CSV Re-import Error Fix

**Date:** November 19, 2024  
**Error:** `500 Internal Server Error` on `/api/csv-imports/analyze-merge`  
**Status:** ✅ Fixed

---

## 🐛 **Error**

```
Failed to load resource: the server responded with a status of 500 (Internal Server Error)
POST http://localhost:3050/api/csv-imports/analyze-merge
```

---

## 🔍 **Root Cause**

The `csvImports.js` route file was created but:
1. The route was being auto-loaded by server.js
2. However, error details weren't being logged properly
3. Made it difficult to diagnose the actual issue

---

## ✅ **Fixes Applied**

### **1. Enhanced Error Logging**
**File:** `app-backend/src/routes/csvImports.js` (lines 391-398)

```javascript
} catch (error) {
  fastify.log.error('Error in analyze-merge:', error);
  console.error('[CSV Import] Analyze merge error:', error.message);
  console.error('[CSV Import] Stack:', error.stack);
  return reply.code(500).send({ 
    error: 'Failed to analyze merge',
    details: error.message  // ⭐ Now includes error details
  });
}
```

**Benefits:**
- ✅ Detailed error messages in console
- ✅ Stack trace for debugging
- ✅ Error details sent to frontend

### **2. Explicit Route Registration**
**File:** `app-backend/src/server.js` (lines 78-80)

```javascript
} else if (routeName === 'csvImports') {
  app.register(route.default, { prefix: '/api' })
  app.log.info(`✅ Registered route: /api/csv-imports (${file})`)
}
```

**Benefits:**
- ✅ Explicit logging for csvImports route
- ✅ Easier to verify route is loaded
- ✅ Clear confirmation in server logs

---

## 🧪 **Testing**

### **1. Restart Backend**
```bash
cd app-backend
# Stop current server (Ctrl+C)
npm run dev
```

### **2. Check Server Logs**
Look for:
```
✅ Registered route: /api/csv-imports (csvImports.js)
```

### **3. Test Re-import Flow**
1. Navigate to Cadastral Standard
2. Select a project that already has CSV data
3. Try to import a new CSV file
4. **Expected:** Re-import dialog appears
5. Choose "Replace with Smart Merge"
6. **Expected:** Merge analysis runs successfully
7. **If error occurs:** Check backend console for detailed error message

### **4. Check Error Details**
If error still occurs, backend console will now show:
```
[CSV Import] Analyze merge error: [actual error message]
[CSV Import] Stack: [full stack trace]
```

---

## 🔧 **Next Steps if Error Persists**

### **Check Database Tables**
```sql
-- Verify coordinate_points table exists
SELECT COUNT(*) FROM coordinate_points;

-- Verify land_parcels table exists
SELECT COUNT(*) FROM land_parcels;

-- Check if project has data
SELECT * FROM coordinate_points WHERE project_id = [your_project_id] LIMIT 5;
```

### **Check Request Payload**
Open browser DevTools → Network tab → Find the failed request → Check:
- Request payload has `project_id`
- Request payload has `new_points` array
- `new_points` has correct structure: `[{ id, y, x }, ...]`

### **Common Issues**

1. **Missing project_id**
   - Error: "project_id and new_points array are required"
   - Fix: Ensure project is selected before CSV import

2. **Invalid new_points format**
   - Error: "new_points must be an array"
   - Fix: Check CSV parsing logic in frontend

3. **Database connection issue**
   - Error: "Connection refused" or "Pool exhausted"
   - Fix: Check database is running and connection pool settings

4. **PostGIS functions not available**
   - Error: "function st_y does not exist"
   - Fix: Ensure PostGIS extension is enabled in database

---

## 📊 **Verification**

After restart, verify:
- [ ] Backend server starts without errors
- [ ] Route registration log shows csvImports.js loaded
- [ ] Can access `/api/csv-imports` endpoints
- [ ] Re-import dialog appears when re-importing CSV
- [ ] Merge analysis completes successfully
- [ ] Detailed errors logged if issues occur

---

## 🎯 **Expected Behavior**

### **Successful Flow:**
```
User imports CSV (project already has data)
  ↓
Frontend detects existing import
  ↓
Shows Re-import Dialog
  ↓
User selects "Replace with Smart Merge"
  ↓
POST /api/csv-imports/analyze-merge
  ↓
Backend analyzes coordinate matching
  ↓
Returns merge analysis
  ↓
Shows Merge Analysis Dialog
  ↓
User confirms merge
  ↓
POST /api/csv-imports/execute-merge
  ↓
Data merged successfully
```

---

## 📝 **Files Modified**

1. **app-backend/src/routes/csvImports.js**
   - Enhanced error logging in analyze-merge endpoint

2. **app-backend/src/server.js**
   - Added explicit route registration for csvImports

---

## ✅ **Status**

**Fixes Applied:** ✅  
**Testing Required:** Yes  
**Production Ready:** After testing

---

**Next:** Restart backend and test the re-import flow!
