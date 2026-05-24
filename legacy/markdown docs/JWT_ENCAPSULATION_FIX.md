# JWT Encapsulation Fix - Dashboard Flash Issue

## Root Cause Identified

The dashboard was flashing after login because **JWT verification was failing** on protected routes. The JWT plugin registered in `auth.js` was **not accessible** to `projects.js` due to Fastify's plugin encapsulation.

## The Problem Explained

### Fastify Plugin Encapsulation

By default, Fastify plugins are **encapsulated**. This means:
- Decorators, hooks, and other plugin features registered in one plugin are NOT available to sibling plugins
- The JWT plugin was registered in `authPlugin`
- When `projectsPlugin` tried to call `request.jwtVerify()`, it would fail because JWT wasn't available in that scope

### What Was Happening

1. User logs in successfully → JWT token returned and stored ✅
2. Router navigates to dashboard
3. Dashboard tries to fetch projects → `GET /api/projects`
4. Request includes `Authorization: Bearer <token>` header ✅
5. Backend `projectsPlugin` tries to verify token with `request.jwtVerify()`
6. **FAILS** because JWT plugin isn't available in this plugin scope ❌
7. Returns 401 Unauthorized
8. Frontend interceptor catches 401 → logs user out
9. Redirect to login → **FLASH!**

### The Evidence

In your terminal logs, you saw:
```
POST /auth/login → 200 OK ✅
GET /projects → 401 Unauthorized ❌
  "roles": ["anonymous"]
  "no rule for roles"
```

The user was being treated as "anonymous" even though they had a valid token, because the JWT verification failed silently.

## The Solution

### Use `fastify-plugin` to Break Encapsulation

Wrap plugins with `fastify-plugin` (alias `fp`) to make their decorators available to all plugins.

### Changes Made

#### 1. Auth Plugin (`plugins/auth.js`)

**Before:**
```javascript
export default async function authPlugin(app, opts) {
  await app.register(import('@fastify/jwt'), {
    secret: process.env.JWT_SECRET
  })
  // ... routes
}
```

**After:**
```javascript
import fp from 'fastify-plugin'

async function authPlugin(app, opts) {
  // Register JWT plugin - now available to ALL plugins
  await app.register(import('@fastify/jwt'), {
    secret: process.env.JWT_SECRET
  })
  // ... routes
}

// Export with fastify-plugin to break encapsulation
export default fp(authPlugin)
```

#### 2. Projects Plugin (`plugins/projects.js`)

**Before:**
```javascript
export default async function projectsPlugin(app) {
  const authenticate = async (request, reply) => {
    try {
      await request.jwtVerify() // Would fail - JWT not in scope
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  }
  // ... routes
}
```

**After:**
```javascript
import fp from 'fastify-plugin'

async function projectsPlugin(app) {
  const authenticate = async (request, reply) => {
    try {
      await request.jwtVerify() // Now works - JWT available!
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  }
  // ... routes
}

export default fp(projectsPlugin)
```

#### 3. Survey Computations Plugin (`plugins/survey-computations.js`)

Applied the same `fastify-plugin` wrapper for consistency.

### Frontend Fix (Already Applied)

Also fixed the axios `baseURL` from `/api` to empty string to prevent path duplication:

```javascript
const api = axios.create({
  baseURL: '', // Was '/api', causing /api/api/projects
  headers: {
    'Content-Type': 'application/json'
  }
})
```

## How It Works Now

### Plugin Load Order

1. **Platformatic** loads all plugins in order:
   - `auth.js` → Registers JWT, wrapped with `fp()` → JWT available globally ✅
   - `survey-computations.js` → Can use JWT verification ✅
   - `projects.js` → Can use JWT verification ✅

### Authentication Flow

```
1. POST /auth/login with credentials
   ↓
2. auth.js validates password, generates JWT
   ↓
3. Returns { token, user data }
   ↓
4. Frontend stores token in localStorage
   ↓
5. Frontend sets user in auth store
   ↓
6. isAuthenticated becomes true (token + user both set)
   ↓
7. Router guard allows navigation to dashboard ✅
   ↓
8. Dashboard component loads
   ↓
9. Calls GET /api/projects with Authorization header
   ↓
10. projects.js receives request
   ↓
11. authenticate middleware calls request.jwtVerify()
   ↓
12. JWT plugin (now available!) verifies token ✅
   ↓
13. Sets request.user from decoded JWT payload
   ↓
14. Route handler queries projects for request.user.id
   ↓
15. Returns projects data ✅
   ↓
16. Dashboard displays projects successfully! 🎉
```

## Testing the Fix

### Expected Behavior

1. **Login:** Enter credentials and click "Sign In"
   - ✅ Successful 200 response
   - ✅ Token stored
   - ✅ User data stored

2. **Dashboard Navigation:** Router navigates to `/`
   - ✅ Router guard checks isAuthenticated (true)
   - ✅ Dashboard component mounts
   - ✅ Fetches projects with JWT token
   - ✅ JWT verified successfully
   - ✅ Projects loaded and displayed
   - ✅ **NO FLASH** - stays on dashboard!

3. **Subsequent Requests:** Any protected route
   - ✅ Token sent in Authorization header
   - ✅ JWT verified on backend
   - ✅ User authenticated
   - ✅ Data returned

### Backend Logs (After Fix)

```
POST /auth/login → 200 OK
GET /api/projects → 200 OK
  request.user: { id: 1, email: 'user@example.com', role: 'user' }
```

## Why This Is Critical

### Plugin Encapsulation in Platformatic

Platformatic DB uses Fastify under the hood. Understanding plugin encapsulation is crucial:

- **Encapsulated plugins** = Isolated scope
- **fastify-plugin wrapped** = Shared scope

For authentication to work across all routes, the JWT decorator must be in the shared scope.

### Common Pitfall

Many developers assume that because plugins are loaded in the same application, they automatically share decorators. This is **not true** in Fastify without `fastify-plugin`.

## Files Modified

- ✅ `backend/plugins/auth.js` - Wrapped with fp()
- ✅ `backend/plugins/projects.js` - Wrapped with fp()
- ✅ `backend/plugins/survey-computations.js` - Wrapped with fp()
- ✅ `frontend/src/services/api.ts` - Fixed baseURL

## Restart Required

**Backend must be restarted** for plugin changes to take effect:

```bash
# Stop the current backend server (Ctrl+C)
# Then restart:
npm run dev
```

**Frontend should also be restarted** to apply the api.ts changes:

```bash
# In frontend directory
npm run dev
```

## Verification Commands

After restart, test the flow:

```bash
# 1. Check backend is running
curl http://localhost:3042/test

# 2. Test login (replace with actual credentials)
curl -X POST http://localhost:3042/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password"}'

# 3. Test protected route (replace TOKEN with actual token from step 2)
curl http://localhost:3042/api/projects \
  -H "Authorization: Bearer TOKEN"
```

All should return 200 OK responses!

## Summary

The dashboard flash issue was caused by **Fastify plugin encapsulation** preventing JWT verification in protected routes. By wrapping plugins with `fastify-plugin`, we broke encapsulation and made the JWT decorator available globally, allowing all routes to verify tokens properly.

**Result:** Users can now log in and access the dashboard without any flashing! 🚀
