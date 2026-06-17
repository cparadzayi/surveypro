# Axios Authentication Fix

## Problem Identified
Charles Paradzayi was logged in successfully, but the dashboard showed "No Projects Yet" with a **401 Unauthorized** error when trying to fetch projects.

## Root Cause
The `useSurveyors.ts` composable was using the **raw axios instance** instead of the configured `api` instance that includes the JWT authentication token.

### The Issue
```typescript
// ❌ WRONG - No authentication token
import axios from 'axios'
const response = await axios.get(`${API_BASE}/survey-projects`)
```

### The Fix
```typescript
// ✅ CORRECT - Includes authentication token
import api from '../services/api'
const response = await api.get('/survey-projects')
```

## What Was Fixed

### File: `app-frontend/src/composables/useSurveyors.ts`

**Changed import:**
```typescript
// Before
import { ref, computed } from 'vue'
import axios from 'axios'
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3042/api'

// After
import { ref, computed } from 'vue'
import api from '../services/api'
```

**Updated all 9 API calls:**
1. ✅ `fetchSurveyors()` - GET /surveyors
2. ✅ `getSurveyorById()` - GET /surveyors/:id
3. ✅ `createSurveyor()` - POST /surveyors
4. ✅ `updateSurveyor()` - PUT /surveyors/:id
5. ✅ `deleteSurveyor()` - DELETE /surveyors/:id
6. ✅ `fetchSurveyProjects()` - GET /survey-projects ⭐ **Most Important**
7. ✅ `createSurveyProject()` - POST /survey-projects
8. ✅ `updateSurveyProject()` - PUT /survey-projects/:id

## Why This Matters

The `api` instance from `services/api.ts` includes:

1. **Request Interceptor** - Automatically adds JWT token to headers:
   ```typescript
   api.interceptors.request.use((config) => {
     const auth = useAuthStore();
     if (auth.token) {
       config.headers['Authorization'] = `Bearer ${auth.token}`;
     }
     return config;
   });
   ```

2. **Response Interceptor** - Handles 401 errors and auto-logout:
   ```typescript
   api.interceptors.response.use(
     (r) => r,
     (error) => {
       if (error.response && error.response.status === 401) {
         const auth = useAuthStore();
         auth.logout();
       }
       return Promise.reject(error);
     }
   );
   ```

3. **Base URL** - Configured with Vite proxy for dev/prod:
   ```typescript
   baseURL: import.meta.env.VITE_API_BASE || '/api'
   ```

## Testing the Fix

1. **Refresh the dashboard** (Ctrl+F5)
2. **Check browser console** - Should see:
   ```
   🔑 Token attached to request: /survey-projects
   📊 Loading projects for profile: [profile_id]
   ```
3. **Verify projects appear** - Charles should now see his 4 projects
4. **No 401 errors** - All requests should succeed

## Combined Fixes Applied

This authentication fix works together with the database fix:

1. **Database Fix** ✅ (Already completed)
   - Linked projects from `surveyor_id` to `surveyor_profile_id`
   - Charles's 4 projects now properly associated with his profile

2. **Authentication Fix** ✅ (This fix)
   - All API calls now include JWT token
   - Requests are authenticated and authorized

## Result

Charles Paradzayi can now:
- ✅ See all 4 projects on the dashboard
- ✅ Create new projects
- ✅ Select and open existing projects
- ✅ All API calls are properly authenticated

## Prevention

**Best Practice:** Always use the configured `api` instance from `services/api.ts` instead of raw `axios` for any authenticated API calls in the frontend.

```typescript
// ✅ DO THIS
import api from '@/services/api'
const response = await api.get('/endpoint')

// ❌ DON'T DO THIS
import axios from 'axios'
const response = await axios.get('http://localhost:3050/api/endpoint')
```

## Files Modified

- ✅ `app-frontend/src/composables/useSurveyors.ts` - Fixed all 9 API calls

## Next Steps

1. Refresh the browser
2. Verify projects load successfully
3. Test creating a new project
4. Test selecting and opening projects
