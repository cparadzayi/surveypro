# Authentication Flash Issue - Fix Documentation

## Problem Description

After a successful login, the dashboard would briefly flash on screen and then immediately redirect back to the login page, even though the login was successful.

## Root Cause Analysis

The issue was caused by multiple factors working together:

### 1. **Duplicate Auth Check on App Mount**
In `App.vue`, the `checkAuth()` function was being called in `onMounted()`, which would run AFTER the login completed and the user was redirected to the dashboard.

### 2. **Aggressive Logout on checkAuth Failure**
The `checkAuth()` function in the auth store would call `logout()` on ANY error, including network errors, not just authentication failures.

### 3. **Timing Issues**
The sequence of events was:
1. User logs in successfully ✅
2. Token and user stored in state ✅
3. Router navigates to dashboard ✅
4. App.vue mounts and calls checkAuth()
5. If checkAuth() failed for ANY reason (network error, timing, etc.), it would logout
6. User gets redirected back to login ❌

## The Fix

### 1. **Moved Auth Initialization to main.ts**
**File:** `frontend/src/main.ts`

```typescript
// Initialize auth state from localStorage before mounting
const authStore = useAuthStore()
if (authStore.token) {
  // Only check auth if we have a token
  authStore.checkAuth().finally(() => {
    app.mount('#app')
  })
} else {
  app.mount('#app')
}
```

**Why:** This ensures the auth state is validated BEFORE the app mounts, preventing duplicate checks.

### 2. **Removed Duplicate Auth Check from App.vue**
**File:** `frontend/src/App.vue`

Removed the `onMounted()` hook that was calling `checkAuth()`, since it's now handled in main.ts.

**Why:** Prevents the auth check from running multiple times.

### 3. **Improved checkAuth Error Handling**
**File:** `frontend/src/stores/auth.ts`

```typescript
async function checkAuth() {
  if (!token.value) {
    return false
  }

  try {
    const response = await api.get('/auth/me')
    user.value = response.data
    return true
  } catch (err: any) {
    // Only logout on 401 (unauthorized), not on network errors
    if (err.response?.status === 401) {
      logout()
    }
    return false
  }
}
```

**Why:** Now only logs out on actual authentication failures (401), not on network errors or other issues.

### 4. **Improved API Interceptor**
**File:** `frontend/src/services/api.ts`

```typescript
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only redirect if we're not already on login/register pages
      const currentPath = window.location.pathname
      if (currentPath !== '/login' && currentPath !== '/register') {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)
```

**Why:** Prevents redirect loops and unnecessary redirects when already on authentication pages.

## New Authentication Flow

### Initial Page Load (with stored token)
```
1. App starts
2. Check if token exists in localStorage
3. If yes, call checkAuth() to validate token
4. If valid, set user data
5. Mount app with authenticated state
6. Router guard allows access to protected routes
```

### Initial Page Load (without token)
```
1. App starts
2. No token in localStorage
3. Mount app immediately
4. Router guard redirects to /login for protected routes
```

### Login Flow
```
1. User submits login form
2. API call to /auth/login
3. Receive token + user data
4. Store both in auth store + localStorage
5. Navigate to dashboard
6. Router guard checks isAuthenticated (true)
7. Access granted ✅
```

### Subsequent Page Loads
```
1. Token exists in localStorage
2. Call checkAuth() to validate
3. If 401 response, logout and redirect to login
4. If valid, set user data and mount app
5. User stays logged in ✅
```

## Testing the Fix

### Test Case 1: Fresh Login
1. Navigate to http://localhost:5173/login
2. Enter valid credentials
3. Click "Sign In"
4. **Expected:** Should successfully navigate to dashboard and STAY there

### Test Case 2: Page Refresh While Logged In
1. Log in successfully
2. Refresh the page (F5)
3. **Expected:** Should remain logged in and on the dashboard

### Test Case 3: Invalid Token
1. Log in successfully
2. Manually corrupt the token in localStorage
3. Refresh the page
4. **Expected:** Should redirect to login page

### Test Case 4: Network Error During Auth Check
1. Log in successfully
2. Disconnect from network
3. Refresh the page
4. **Expected:** Should handle gracefully without logging out

## Additional Improvements Made

1. **Better error handling** - Distinguishes between network errors and auth errors
2. **Cleaner initialization** - Single point of auth initialization in main.ts
3. **No duplicate checks** - Removed redundant auth validation
4. **Proper timing** - Auth validated before app mounts

## Files Modified

- ✅ `frontend/src/main.ts` - Auth initialization
- ✅ `frontend/src/App.vue` - Removed duplicate check
- ✅ `frontend/src/stores/auth.ts` - Improved error handling
- ✅ `frontend/src/services/api.ts` - Better interceptor logic

## Verification

The fix has been applied. To verify:

```bash
# Frontend should already be running on port 5173
# Backend should already be running on port 3042

# Test the login flow:
1. Open http://localhost:5173
2. Try logging in with valid credentials
3. Dashboard should load and stay loaded
```

If you still experience issues, check the browser console for any error messages and verify:
- Backend is running on port 3042
- Database has valid user accounts
- JWT_SECRET is set in backend .env file
