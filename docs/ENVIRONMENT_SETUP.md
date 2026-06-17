# SurveyPro Environment Setup Guide

This guide explains how to configure the backend and frontend environments for development and production.

## 📋 Quick Start (Development)

### 1. Backend Setup

```bash
cd app-backend

# Copy environment template
cp .env.example .env

# Edit .env and update these critical values:
# - DB_PASSWORD: Your PostgreSQL password
# - DATABASE_URL: Full connection string with your password
# - JWT_SECRET: (optional in dev, mandatory in production)

# Install dependencies
npm install

# Run migrations
npm run migrate

# Start development server
npm run dev
```

Expected output:
```
Server running at http://127.0.0.1:3050
```

### 2. Frontend Setup

```bash
cd app-frontend

# Copy environment template
cp .env.example .env

# For development, keep the default value:
# VITE_API_BASE=/api

# Install dependencies
npm install

# Start development server
npm run dev
```

Expected output:
```
VITE v5.x.x  ready in xxx ms
➜  Local:   http://localhost:5173/
```

### 3. Verify Connection

1. Open browser to `http://localhost:5173`
2. Open browser console (F12)
3. Navigate to any page that makes API calls
4. Check Network tab - requests to `/api/*` should return 200 OK

---

## 🔧 Environment Variables Reference

### Backend (`app-backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3050` | Backend server port |
| `HOST` | No | `127.0.0.1` | Server hostname |
| `JWT_SECRET` | **Yes** | - | Secret key for JWT tokens (change in production!) |
| `DATABASE_URL` | **Yes** | - | PostgreSQL connection string |
| `DB_HOST` | No | `localhost` | PostgreSQL host |
| `DB_PORT` | No | `5432` | PostgreSQL port |
| `DB_NAME` | **Yes** | `surveypro_app` | Database name |
| `DB_USER` | **Yes** | `postgres` | Database user |
| `DB_PASSWORD` | **Yes** | - | Database password |

### Frontend (`app-frontend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE` | No | `/api` | Backend API base URL |

**Development:** Use `/api` (Vite proxy forwards to backend)  
**Production:** Use full URL like `https://api.yourdomain.com/api`

---

## 🌐 How the Connection Works

### Development Mode

```
Browser (localhost:5173)
    ↓
    GET /api/auth/login
    ↓
Vite Dev Proxy (vite.config.ts)
    ↓
    Forwards to: http://127.0.0.1:3050/api/auth/login
    ↓
Fastify Backend (localhost:3050)
    ↓
    Returns JSON response
```

**Benefits:**
- ✅ No CORS issues
- ✅ Single port in browser (5173)
- ✅ Backend logs show all requests

### Production Mode

```
Browser (https://yourdomain.com)
    ↓
    GET https://api.yourdomain.com/api/auth/login
    ↓
Fastify Backend (Production Server)
    ↓
    Returns JSON response (CORS headers must allow origin)
```

---

## 🚀 Production Deployment

### Backend Deployment

1. **Set environment variables on your server:**

```bash
# Required variables
export PORT=3050
export HOST=0.0.0.0  # Allow external connections
export JWT_SECRET="your-production-secret-here"
export DATABASE_URL="postgres://user:pass@db-host:5432/surveypro_app"
export NODE_ENV=production
```

2. **Generate secure JWT secret:**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

3. **Start backend:**

```bash
npm run start
```

### Frontend Deployment

1. **Update `.env` for production:**

```env
VITE_API_BASE=https://api.yourdomain.com/api
```

2. **Build production bundle:**

```bash
npm run build
```

3. **Deploy `dist/` folder** to:
   - Static hosting (Netlify, Vercel, S3)
   - Nginx/Apache server
   - CDN

4. **Configure web server** to serve `index.html` for all routes (SPA routing)

**Nginx example:**

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    root /path/to/dist;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

---

## 🐛 Troubleshooting

### Backend won't start

**Error:** `Database connection error`

**Solution:**
1. Verify PostgreSQL is running: `pg_isready`
2. Check DATABASE_URL is correct
3. Ensure database exists: `createdb surveypro_app`
4. Check credentials are correct

---

### Frontend can't connect to backend

**Error:** `Network Error` or `ERR_CONNECTION_REFUSED`

**Solution:**

1. **Development:**
   - Ensure backend is running on port 3050
   - Check `VITE_API_BASE=/api` in `.env`
   - Verify `vite.config.ts` proxy target is `http://127.0.0.1:3050`

2. **Production:**
   - Verify `VITE_API_BASE` includes full backend URL
   - Check CORS settings in backend
   - Test backend endpoint directly: `curl https://api.yourdomain.com/api/health`

---

### CORS errors in production

**Error:** `Access-Control-Allow-Origin` header missing

**Solution:**

Update backend CORS configuration in `server.js`:

```javascript
await app.register(cors, { 
  origin: 'https://yourdomain.com',  // Your frontend domain
  credentials: true
})
```

Or allow multiple origins:

```javascript
await app.register(cors, { 
  origin: ['https://yourdomain.com', 'https://www.yourdomain.com'],
  credentials: true
})
```

---

## 📝 Port Configuration Summary

| Service | Port | URL |
|---------|------|-----|
| **Backend (Dev)** | 3050 | http://127.0.0.1:3050 |
| **Frontend (Dev)** | 5173 | http://localhost:5173 |
| **Backend (Prod)** | 3050 or 80/443 | https://api.yourdomain.com |
| **Frontend (Prod)** | 80/443 | https://yourdomain.com |

**Note:** The documented port 3042 in system memory was incorrect. The actual default is **3050**.

---

## ✅ Configuration Checklist

Before running the application:

- [ ] PostgreSQL is installed and running
- [ ] Database `surveypro_app` exists
- [ ] Backend `.env` file created with correct DATABASE_URL
- [ ] Backend `.env` has JWT_SECRET set
- [ ] Frontend `.env` file created
- [ ] Frontend `VITE_API_BASE` configured correctly for environment
- [ ] All dependencies installed (`npm install` in both folders)
- [ ] Migrations run (`npm run migrate` in backend)

---

## 🔒 Security Best Practices

1. **Never commit `.env` files** to version control
2. **Use strong JWT_SECRET** in production (64+ random characters)
3. **Set NODE_ENV=production** in production
4. **Use HTTPS** in production
5. **Restrict CORS origins** in production (don't use `origin: true`)
6. **Use environment variables** for all secrets (never hardcode)
7. **Regularly rotate** JWT_SECRET and database credentials

---

For additional help, see:
- [Fastify Documentation](https://fastify.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
