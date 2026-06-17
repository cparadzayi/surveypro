# Troubleshooting Control Points Not Loading

## Issue
Control points are not fetching when selecting a central meridian in the project form.

## Diagnostic Steps

### 1. Check if Backend is Running
```bash
# Backend should be running on port 3042
curl http://localhost:3042/api/control-points?limit=1
```

Expected response:
```json
{
  "data": [...],
  "pagination": { "total": 7451, ... }
}
```

### 2. Test API Endpoint Directly
```bash
cd app-backend
node test-control-points-api.js
```

This will test:
- ✅ Fetching all control points
- ✅ Fetching by meridian (Lo31)
- ✅ Checking all meridians (27, 29, 31, 33)
- ✅ Filtering by type

### 3. Check Database Connection
```bash
# Verify control points exist
psql -U postgres -d surveypro_v1 -c "SELECT COUNT(*), gauss_lo FROM control_points GROUP BY gauss_lo ORDER BY gauss_lo;"
```

Expected output:
```
 count | gauss_lo 
-------+----------
  1234 |       27
  2345 |       29
  3456 |       31
   416 |       33
```

### 4. Check Browser Console
1. Open browser DevTools (F12)
2. Go to Console tab
3. Navigate to Settings → Projects → Add Project
4. Select a central meridian (e.g., Lo31)
5. Look for console logs:

```
[ControlPointSelector] Fetching control points for Lo31
[ControlPointSelector] API URL: http://localhost:3042/api/control-points?gauss_lo=31&limit=1000
[ControlPointSelector] Response: { data: [...], pagination: {...} }
[ControlPointSelector] Found 3456 control points
```

### 5. Check Network Tab
1. Open browser DevTools (F12)
2. Go to Network tab
3. Select a central meridian
4. Look for request to `/api/control-points?gauss_lo=31&limit=1000`
5. Check:
   - Status: Should be 200
   - Response: Should contain `data` array
   - Headers: Check CORS headers

## Common Issues & Solutions

### Issue 1: No Control Points in Database
**Symptom:** API returns empty array `{ data: [], pagination: { total: 0 } }`

**Solution:**
```bash
cd app-backend
node scripts/import-control-points.js "C:/mataranyika/SurveyPro - Copy (6)/cadastral-standard/zimgausscontrolpoints.csv"
```

### Issue 2: Wrong Database
**Symptom:** API returns 404 or connection error

**Solution:** Check `.env` file has `DB_NAME=surveypro_v1`
```bash
# Check current database
node scripts/test-connection.js

# Should show:
# Current database: surveypro_v1
# ✅ control_points table EXISTS
```

### Issue 3: Backend Not Running
**Symptom:** Network error in browser console

**Solution:**
```bash
cd app-backend
npm run dev
```

### Issue 4: CORS Error
**Symptom:** Browser console shows CORS policy error

**Solution:** Check backend CORS configuration in `server.js`:
```javascript
await app.register(cors, { 
  origin: true,
  credentials: true
})
```

### Issue 5: Port Mismatch
**Symptom:** Connection refused

**Check:**
- Backend running on port 3042 (check `app-backend/.env`)
- Frontend API_BASE pointing to correct port (check `app-frontend/.env`)

**Frontend .env:**
```
VITE_API_BASE=http://localhost:3042/api
```

**Backend .env:**
```
PORT=3042
```

### Issue 6: Route Not Registered
**Symptom:** 404 Not Found

**Check:** `app-backend/src/routes/control-points.js` exists and exports default function

**Verify:**
```bash
cd app-backend/src/routes
ls -la control-points.js
```

## Quick Fix Checklist

- [ ] Backend is running (`npm run dev` in app-backend)
- [ ] Frontend is running (`npm run dev` in app-frontend)
- [ ] Database is `surveypro_v1` (not `surveypro`)
- [ ] Control points are imported (check with SQL query)
- [ ] `.env` files are configured correctly
- [ ] Browser console shows no errors
- [ ] Network tab shows successful API calls

## Testing Commands

```bash
# 1. Check database
psql -U postgres -d surveypro_v1 -c "SELECT COUNT(*) FROM control_points;"

# 2. Test API
curl "http://localhost:3042/api/control-points?gauss_lo=31&limit=5"

# 3. Run diagnostic script
cd app-backend
node test-control-points-api.js

# 4. Check backend logs
# Look for errors in terminal where backend is running

# 5. Test connection
cd app-backend
node scripts/test-connection.js
```

## Expected Behavior

When working correctly:
1. User selects central meridian (e.g., Lo31)
2. Component makes API call: `GET /api/control-points?gauss_lo=31&limit=1000`
3. API returns control points for that meridian
4. Component displays list of control points
5. User can search/filter and select points

## Debug Output

With the updated component, you should see console logs:
```
[ControlPointSelector] Fetching control points for Lo31
[ControlPointSelector] API URL: http://localhost:3042/api/control-points?gauss_lo=31&limit=1000
[ControlPointSelector] Response: { data: [Array(3456)], pagination: {...} }
[ControlPointSelector] Found 3456 control points
```

If you see:
```
[ControlPointSelector] Found 0 control points
```

Then either:
- Control points not imported
- Wrong database
- Wrong meridian value in database

## Contact Points

If issue persists:
1. Check all console logs (both browser and backend)
2. Verify database has data
3. Test API endpoint directly
4. Check network requests in browser DevTools
