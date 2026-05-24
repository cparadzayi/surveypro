# Debug Authentication Issue - 401/404 Errors

## Current Situation
- Backend logs show **401 Unauthorized** for `/api/survey-projects`
- Frontend reports **404 error** in browser console
- Database fix completed successfully ✅
- Axios fix completed successfully ✅
- **BUT**: Authentication is failing

## Root Cause
The JWT token is either:
1. Not being sent from the frontend
2. Invalid or expired (4-hour session timeout)
3. Not properly stored in localStorage

## Quick Fix - Try This First

### Step 1: Check Browser Console
Open browser DevTools (F12) and run in the Console:

```javascript
// Check if token exists
localStorage.getItem('token')

// Check last activity
new Date(parseInt(localStorage.getItem('lastActivity')))

// Check full auth state
JSON.parse(localStorage.getItem('userProfile') || 'null')
```

### Step 2: If Token is Missing or Expired
**Log out and log back in:**
1. Click "Logout" button
2. Go to `/landing`
3. Login with Charles Paradzayi's credentials
4. Complete profile if needed
5. Navigate to Dashboard

### Step 3: Check Network Tab
1. Open DevTools → Network tab
2. Refresh the dashboard
3. Find the request to `/api/survey-projects`
4. Check the **Headers** section:
   - Should see: `Authorization: Bearer <long-token-string>`
   - If missing → Token not being sent!

## Detailed Debugging

### Issue 1: Token Not Stored After Login

**Check the login response in Network tab:**
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1...",  ← Should exist
  "user": { ...  }
}
```

**If token is missing from response**, check backend auth route:
```bash
# File: app-backend/src/routes/auth.js
# Should return token in login/register response
```

### Issue 2: Session Expired (4-Hour Timeout)

The app has a 4-hour inactivity timeout. Check:
```javascript
// In browser console
const lastActivity = parseInt(localStorage.getItem('lastActivity'))
const now = Date.now()
const hoursSinceActivity = (now - lastActivity) / (1000 * 60 * 60)
console.log(`Hours since last activity: ${hoursSinceActivity}`)
```

If > 4 hours → Session expired, need to re-login

### Issue 3: Token Malformed or Invalid

**Check token format** (should be JWT):
```javascript
const token = localStorage.getItem('token')
const parts = token.split('.')
console.log(`Token parts: ${parts.length}`) // Should be 3 (header.payload.signature)
```

**Decode token** (JWT is base64):
```javascript
const token = localStorage.getItem('token')
const payload = JSON.parse(atob(token.split('.')[1]))
console.log('Token payload:', payload)
console.log('Token expires:', new Date(payload.exp * 1000))
```

## Solution Steps

### Option 1: Fresh Login (Recommended)

1. **Clear all auth data:**
   ```javascript
   localStorage.removeItem('token')
   localStorage.removeItem('userProfile')
   localStorage.removeItem('lastActivity')
   ```

2. **Reload the page** (Ctrl+F5)

3. **Login again:**
   - Email: `charles.paradzayi@example.com` (or whatever his email is)
   - Password: (his password)

4. **Verify token is stored:**
   ```javascript
   localStorage.getItem('token') // Should return a long JWT string
   ```

5. **Navigate to Dashboard** - should now see projects

### Option 2: Verify Backend Auth Route

Check if the auth endpoint is working:
```bash
# In a terminal or using Postman/Insomnia
curl -X POST http://localhost:3050/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "charles.paradzayi@example.com",
    "password": "password123"
  }'
```

Expected response:
```json
{
  "ok": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "charles.paradzayi@example.com",
    ...
  }
}
```

### Option 3: Check JWT Secret

Make sure the backend `.env` file has:
```env
JWT_SECRET=your-secret-key-here
```

If this is missing or changed, existing tokens won't work!

## Expected Flow

1. **User logs in** → Backend returns JWT token
2. **Frontend stores token** → `localStorage.setItem('token', token)`
3. **API request made** → Axios interceptor adds token to headers
4. **Backend receives request** → Verifies token with JWT secret
5. **If valid** → Returns data (200)
6. **If invalid** → Returns 401 Unauthorized

## Browser Console Commands for Debugging

```javascript
// 1. Check auth store state
const authStore = JSON.parse(localStorage.getItem('auth'))
console.log('Auth store:', authStore)

// 2. Check if token is being sent
// (Open Network tab, find any /api request, check Headers)

// 3. Manually test API with token
fetch('/api/survey-projects', {
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('token')}`
  }
})
.then(r => r.json())
.then(data => console.log('Projects:', data))
.catch(err => console.error('Error:', err))

// 4. Check last activity timestamp
const lastActivityMs = parseInt(localStorage.getItem('lastActivity'))
const lastActivityDate = new Date(lastActivityMs)
console.log('Last activity:', lastActivityDate.toLocaleString())
console.log('Hours ago:', (Date.now() - lastActivityMs) / (1000 * 60 * 60))
```

## Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized | No token or invalid token | Re-login to get fresh token |
| 404 Not Found | Wrong endpoint or proxy issue | Check Vite proxy config |
| Token expired | Session > 4 hours old | Re-login |
| Token malformed | Corrupted localStorage | Clear storage, re-login |
| No Authorization header | Axios not using api instance | Already fixed! |

## If Still Not Working

1. **Restart both servers:**
   ```bash
   # Kill both servers (Ctrl+C)
   # Backend
   cd app-backend
   npm run dev

   # Frontend (in new terminal)
   cd app-frontend
   npm run dev
   ```

2. **Hard refresh browser:**
   - Windows: Ctrl+Shift+R or Ctrl+F5
   - Mac: Cmd+Shift+R

3. **Check backend is running:**
   ```bash
   curl http://localhost:3050/api/auth/health
   ```

4. **Check frontend can reach backend:**
   - Open http://localhost:5173
   - DevTools → Network tab
   - Should see requests to `/api/*` getting proxied

## Next Steps

Try the "Fresh Login" solution first (Option 1 above). If that doesn't work, run the browser console commands to diagnose exactly what's happening with the token.

Let me know what you find!
