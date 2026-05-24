# API Proxy Configuration Fix

## Problem

After login, the dashboard was flashing and redirecting back to login. The logs showed:
```
POST /auth/login → 200 OK ✅
GET /projects → 401 Unauthorized ❌ (user treated as "anonymous")
```

## Root Cause

The Vite proxy was **rewriting** `/api` to `/` (removing the prefix):
- Frontend called: `/api/projects`
- Vite proxy rewrote to: `/projects`
- Backend received: `/projects` ← Hit auto-generated Platformatic route **without authentication**
- Custom authenticated route at: `/api/projects` was never reached

## Solution

### 1. Removed Proxy Rewrite
**File:** `frontend/vite.config.ts`

**Before:**
```typescript
'/api': {
  target: 'http://localhost:3042',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/api/, '') // ❌ This was the problem
}
```

**After:**
```typescript
'/api': {
  target: 'http://localhost:3042',
  changeOrigin: true // ✅ No rewrite - path stays as-is
}
```

### 2. Added Separate Proxies for Different Endpoints
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:3042',
    changeOrigin: true
  },
  '/auth': {
    target: 'http://localhost:3042',
    changeOrigin: true
  },
  '/computations': {
    target: 'http://localhost:3042',
    changeOrigin: true
  }
}
```

### 3. Updated Frontend API Calls
**File:** `frontend/src/stores/projects.ts`

Changed all project API calls from `/projects` to `/api/projects`:
- `GET /projects` → `GET /api/projects` ✅
- `POST /projects` → `POST /api/projects` ✅
- `PUT /projects/:id` → `PUT /api/projects/:id` ✅
- `DELETE /projects/:id` → `DELETE /api/projects/:id` ✅

## New Request Flow

### Authentication Requests
```
Frontend: POST /auth/login
  ↓
Vite Proxy: /auth → http://localhost:3042/auth
  ↓
Backend: POST /auth/login (auth.js plugin)
  ↓
Response: 200 OK with JWT token ✅
```

### Project Requests (Authenticated)
```
Frontend: GET /api/projects
  ↓
Vite Proxy: /api → http://localhost:3042/api
  ↓
Backend: GET /api/projects (projects.js plugin with JWT verification)
  ↓
JWT verified, user identified ✅
  ↓
Response: 200 OK with projects ✅
```

### Computation Requests
```
Frontend: POST /computations/inverse
  ↓
Vite Proxy: /computations → http://localhost:3042/computations
  ↓
Backend: POST /computations/inverse (survey-computations.js plugin)
  ↓
Response: 200 OK with computation results ✅
```

## Backend Route Structure

The backend has three types of routes:

1. **Auth Routes** (`plugins/auth.js`):
   - `/auth/register`
   - `/auth/login`
   - `/auth/me`

2. **Project Routes** (`plugins/projects.js`):
   - `/api/projects` (with JWT authentication)
   - `/api/projects/:id`

3. **Computation Routes** (`plugins/survey-computations.js`):
   - `/computations/inverse`
   - `/computations/forward`
   - `/computations/area`
   - `/computations/traverse`

4. **Auto-Generated Routes** (Platformatic DB):
   - `/projects` ← No authentication! This was the problem.
   - These routes are generated automatically but lack JWT verification

## Why This Fixes the Flash Issue

**Before:**
1. User logs in → JWT token stored ✅
2. Router navigates to dashboard
3. Dashboard calls `/api/projects`
4. Vite proxy rewrites to `/projects`
5. Hits unauthenticated Platformatic route → 401 ❌
6. Auth interceptor logs user out
7. Redirect to login → **FLASH!**

**After:**
1. User logs in → JWT token stored ✅
2. Router navigates to dashboard
3. Dashboard calls `/api/projects`
4. Vite proxy forwards to `/api/projects` (no rewrite)
5. Hits authenticated custom route ✅
6. JWT verified, user data returned ✅
7. Dashboard loads successfully! 🎉

## Files Modified

- ✅ `frontend/vite.config.ts` - Fixed proxy configuration
- ✅ `frontend/src/stores/projects.ts` - Updated API endpoints
- ✅ `frontend/src/stores/auth.ts` - Already using correct endpoints
- ✅ `frontend/src/main.ts` - Auth initialization (previous fix)
- ✅ `frontend/src/App.vue` - Removed duplicate auth check (previous fix)

## Next Steps

1. **Restart the frontend server** to apply the proxy configuration changes
2. **Test the login flow** - should work without flashing now!
3. **Verify project loading** - dashboard should load projects successfully

## Testing Commands

```bash
# In the backend terminal (already running)
# Keep it running at http://localhost:3042

# In a new frontend terminal
cd /c/mataranyika/SurveyPro/frontend
npm run dev
```

Then open `http://localhost:5173` and try logging in!
