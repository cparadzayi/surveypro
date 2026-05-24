# SurveyPro Port Configuration Guide

## Summary

**Backend:** Port 3042 (Platformatic DB standard)  
**Frontend:** Port 5173 (Vite standard)

## Backend Configuration (Port 3042)

### Environment Variables (`.env`)
The backend uses environment variables defined in `.env`. Make sure your `.env` file contains:

```env
PORT=3042
PLT_SERVER_HOSTNAME=0.0.0.0
PLT_SERVER_LOGGER_LEVEL=info
DATABASE_URL=postgres://user:password@localhost:5432/surveypro
PLT_ADMIN_SECRET=your-secret-key-change-in-production
PLT_WATCH_ENABLED=true
JWT_SECRET=your-jwt-secret-change-in-production
NODE_ENV=development
```

### Configuration Files

**`platformatic.db.json`** (Main config)
- Port is set via `{PORT}` environment variable (resolves to 3042)
- CORS is enabled with `origin: true` and `credentials: true`
- All plugins are loaded from `./plugins/` directory

**`package.json`**
```json
{
  "scripts": {
    "start": "platformatic db start",
    "dev": "platformatic db start --watch"
  }
}
```

### API Endpoints
All backend endpoints are available at: `http://localhost:3042`

Examples:
- `POST http://localhost:3042/auth/login`
- `POST http://localhost:3042/auth/register`
- `GET http://localhost:3042/auth/me`

## Frontend Configuration (Port 5173)

### Vite Config (`vite.config.ts`)
```typescript
{
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3042',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
}
```

### How the Proxy Works

1. Frontend makes request to: `/api/auth/login`
2. Vite proxy intercepts and rewrites to: `/auth/login`
3. Request is forwarded to: `http://localhost:3042/auth/login`
4. Response is sent back to frontend

### API Service (`src/services/api.ts`)
```typescript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  // ...
})
```

The `baseURL` is set to `/api`, which triggers the Vite proxy in development.

## Starting the Servers

### Backend
```bash
cd backend
npm run dev
```
✅ Server will start on `http://localhost:3042`

### Frontend
```bash
cd frontend
npm run dev
```
✅ Server will start on `http://localhost:5173`

## Communication Flow

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (http://localhost:5173)                       │
│                                                          │
│  User clicks login → API call to /api/auth/login       │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │   Vite Proxy          │
            │   Rewrites path       │
            │   /api → /            │
            └───────────┬───────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Backend (http://localhost:3042)                        │
│                                                          │
│  Receives POST /auth/login                              │
│  Processes with auth.js plugin                          │
│  Returns JWT token                                       │
└─────────────────────────────────────────────────────────┘
```

## CORS Configuration

CORS is already configured in `platformatic.db.json`:
```json
{
  "server": {
    "cors": {
      "origin": true,
      "credentials": true
    }
  }
}
```

This allows:
- ✅ Requests from any origin (development mode)
- ✅ Credentials (cookies, authorization headers)

**Note:** For production, update `origin` to specific allowed domains.

## Troubleshooting

### Port Already in Use
If you get `EADDRINUSE` error:

**Windows (Git Bash):**
```bash
# Find process using port 3042
netstat -ano | findstr :3042

# Kill the process (replace PID with actual process ID)
taskkill //PID <PID> //F
```

**Alternative:** Close all Node.js processes from Task Manager (Ctrl+Shift+Esc)

### Backend Not Responding
1. Verify `.env` file exists with correct `PORT=3042`
2. Check database is running: `DATABASE_URL` is correct
3. Run migrations: `npm run migrate`
4. Check logs for errors

### Frontend Can't Connect to Backend
1. Verify backend is running on port 3042
2. Check Vite proxy configuration in `vite.config.ts`
3. Ensure API calls use `/api` prefix (handled by axios baseURL)
4. Check browser console for CORS errors

## Environment-Specific Configuration

### Development
- Frontend: Uses Vite proxy (configured)
- Backend: PORT=3042 (configured)
- CORS: Allows all origins (configured)

### Production
- Frontend: Build static files (`npm run build`)
- Backend: Serve frontend + API from same origin
- CORS: Restrict to specific domains
- Use environment variables for all secrets
