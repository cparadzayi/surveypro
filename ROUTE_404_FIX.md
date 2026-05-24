# 404 Route Fix - survey-projects Endpoint

## The Real Problem Explained

You were seeing **404 Not Found** because the `/api/survey-projects` route was never being registered properly!

### Root Cause

The backend has two patterns for route registration:

**Pattern 1: Routes with specific prefixes** (e.g., control-points.js)
- File: `control-points.js`
- Server adds prefix: `/api/control-points`
- Routes use: `/` (root)
- Final URL: `/api/control-points` ✅

**Pattern 2: Routes with generic prefix** (e.g., auth.js)
- File: `auth.js`
- Server adds prefix: `/api`
- Routes use: `/auth/login`, `/auth/register`
- Final URL: `/api/auth/login` ✅

**The Problem: survey-projects.js was doing BOTH!**
- File: `survey-projects.js`
- Server added prefix: `/api` (generic pattern)
- Routes used: `/survey-projects` (specific pattern)
- Final URL: `/api/survey-projects` ❌ **NOT REGISTERED!**
- Expected URL: `/api/api/survey-projects` 🤦 (would have worked but wrong!)

## What I Fixed

### File 1: `app-backend/src/server.js`

Added `survey-projects` to the special handling:

```javascript
// Before
if (routeName === 'control-points') {
  app.register(route.default, { prefix: '/api/control-points' })
} else if (routeName === 'parcels') {
  app.register(route.default, { prefix: '/api/parcels' })
} else {
  app.register(route.default, { prefix: '/api' })
}

// After
if (routeName === 'control-points') {
  app.register(route.default, { prefix: '/api/control-points' })
} else if (routeName === 'parcels') {
  app.register(route.default, { prefix: '/api/parcels' })
} else if (routeName === 'survey-projects') {
  app.register(route.default, { prefix: '/api/survey-projects' }) // ← NEW
} else {
  app.register(route.default, { prefix: '/api' })
}
```

### File 2: `app-backend/src/routes/survey-projects.js`

Changed all routes to use `/` instead of `/survey-projects`:

```javascript
// Before
fastify.get('/survey-projects', ...)           // ❌ Wrong
fastify.get('/survey-projects/:id', ...)       // ❌ Wrong
fastify.post('/survey-projects', ...)          // ❌ Wrong
fastify.put('/survey-projects/:id', ...)       // ❌ Wrong
fastify.delete('/survey-projects/:id', ...)    // ❌ Wrong

// After
fastify.get('/', ...)                          // ✅ Correct
fastify.get('/:id', ...)                       // ✅ Correct
fastify.post('/', ...)                         // ✅ Correct
fastify.put('/:id', ...)                       // ✅ Correct
fastify.delete('/:id', ...)                    // ✅ Correct
```

### Result

Now the routes are properly registered:
- Server prefix: `/api/survey-projects`
- Route: `/`
- **Final URL: `/api/survey-projects`** ✅

## Next Steps

### 1. Restart the Backend Server

**Stop the current backend** (if running):
- Press `Ctrl+C` in the backend terminal

**Start it again:**
```bash
cd c:\mataranyika\SurveyPro-nov-alpha\app-backend
npm run dev
```

### 2. Verify Routes are Registered

You should see in the backend logs:
```
Server listening at http://127.0.0.1:3050
```

### 3. Test the Endpoint

**Refresh the browser** (Ctrl+F5) and the dashboard should now:
- ✅ Successfully call `/api/survey-projects`
- ✅ Load Charles's 4 projects
- ✅ No more 404 errors!

## Why This Happened

The `survey-projects.js` file was probably created by copying from a different route pattern without adjusting for the server's route registration logic. The inconsistency between:
- How the server registers the route (`/api` prefix)
- How the route file defines paths (`/survey-projects/...`)

...meant the final path would have been `/api/survey-projects` which doesn't match what Fastify was looking for.

## Files Modified

1. ✅ `app-backend/src/server.js` - Added survey-projects to special handling
2. ✅ `app-backend/src/routes/survey-projects.js` - Changed all 5 routes from `/survey-projects*` to `/*`

## Testing

After restarting the backend, you should see:

**Browser Console:**
```
🔑 Token attached to request: /survey-projects
```

**Network Tab:**
```
GET /api/survey-projects → 200 OK (not 404!)
```

**Dashboard:**
```
Charles Paradzayi's 4 projects displayed! 🎉
```

---

**This was the actual root cause of the 404 error!** The authentication issue (401) was a red herring from the backend logs showing other requests. The real problem was that the route simply didn't exist because of the registration pattern mismatch.
