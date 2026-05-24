# Backend Not Reloading - Manual Restart Required

## Problem
The `--watch` mode is not picking up the route changes. The backend is still using the old cached routes.

## Solution

**Stop using `npm run dev` and start the server manually:**

```bash
# 1. Stop the current server (Ctrl+C)

# 2. Clear Node's module cache and start fresh:
cd app-backend
node src/server.js
```

**OR update package.json to not use --watch:**

Edit `app-backend/package.json`:
```json
"scripts": {
  "dev": "node src/server.js",  // Remove --watch
  "start": "node src/server.js"
}
```

Then:
```bash
npm run dev
```

## Why This Happens

Node's `--watch` mode sometimes doesn't detect changes in imported modules, especially when routes are dynamically loaded. A manual restart forces Node to reload all modules fresh.

## After Restart

Test the URL directly:
```
http://localhost:3050/api/control-points?gauss_lo=31&limit=1000
```

Should return JSON with control points data, NOT a validation error.
