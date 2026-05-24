# 🚀 SurveyPro Production Launch Guide

**Date:** November 23, 2025  
**Purpose:** Complete database reset and production deployment

---

## 📋 Table of Contents

1. [Pre-Launch Checklist](#pre-launch-checklist)
2. [Database Reset Options](#database-reset-options)
3. [Step-by-Step Reset Procedure](#step-by-step-reset-procedure)
4. [Production Configuration](#production-configuration)
5. [Data Migration (Optional)](#data-migration-optional)
6. [Post-Reset Verification](#post-reset-verification)
7. [Production Deployment](#production-deployment)

---

## ✅ Pre-Launch Checklist

### **Before You Reset**

- [ ] **Backup existing data** (if you need to preserve anything)
- [ ] **Document current database name** (currently: `surveypro_app`)
- [ ] **List any test data to preserve** (control points, test projects, etc.)
- [ ] **Verify all migrations are working** (27 migrations found)
- [ ] **Test the reset procedure** on a copy first
- [ ] **Notify team members** (if applicable)
- [ ] **Schedule downtime window** (if app is already in use)

---

## 🔄 Database Reset Options

### **Option 1: Complete Fresh Start (RECOMMENDED for Production)**

**Best for:** Clean production launch with no legacy data

**Pros:**
- ✅ Cleanest approach
- ✅ No legacy data issues
- ✅ Fresh schema from migrations
- ✅ Optimal performance

**Cons:**
- ❌ Loses all existing data
- ❌ Need to re-import control points

**Steps:**
1. Drop existing database
2. Create new database
3. Run all migrations
4. Seed essential data (control points)

---

### **Option 2: Selective Reset (Keep Control Points)**

**Best for:** Preserving national control point data

**Pros:**
- ✅ Keeps control points (time-saving)
- ✅ Removes test/dev data only

**Cons:**
- ⚠️ More complex
- ⚠️ Risk of data inconsistencies

**Steps:**
1. Export control points
2. Drop database
3. Create new database
4. Run migrations
5. Re-import control points

---

### **Option 3: Truncate Tables (Keep Schema)**

**Best for:** Quick reset during development

**Pros:**
- ✅ Fast
- ✅ Keeps schema

**Cons:**
- ❌ May leave orphaned data
- ❌ Not recommended for production

---

## 🛠️ Step-by-Step Reset Procedure

### **RECOMMENDED: Option 1 - Complete Fresh Start**

#### **Step 1: Backup Current Database (Optional)**

```bash
# Navigate to backend directory
cd c:/mataranyika/SurveyPro-nov-alpha/app-backend

# Create backup (if needed)
pg_dump -h localhost -U postgres -d surveypro_app -F c -f backup-pre-production-$(date +%Y%m%d_%H%M%S).dump
```

---

#### **Step 2: Stop Backend Server**

```bash
# Stop the backend if running
# Press Ctrl+C in the terminal running the server
```

---

#### **Step 3: Drop and Recreate Database**

**Option A: Using psql (Command Line)**

```bash
# Connect to PostgreSQL
psql -h localhost -U postgres

# Drop existing database
DROP DATABASE IF EXISTS surveypro_app;

# Create fresh database
CREATE DATABASE surveypro_app;

# Grant permissions (if needed)
GRANT ALL PRIVILEGES ON DATABASE surveypro_app TO postgres;

# Exit psql
\q
```

**Option B: Using pgAdmin (GUI)**

1. Open pgAdmin
2. Right-click on `surveypro_app` database
3. Select **Delete/Drop**
4. Confirm deletion
5. Right-click on **Databases**
6. Select **Create > Database**
7. Name: `surveypro_app`
8. Owner: `postgres`
9. Click **Save**

---

#### **Step 4: Run All Migrations**

SurveyPro uses a migration system. The migrations will automatically run when you start the server.

**Check migration files:**
```bash
# List all migrations
ls app-backend/migrations/*.do.sql

# You should see:
# 001.do.sql through 027.do.sql
```

**Migrations include:**
- User authentication tables
- Surveyor profiles
- Survey projects
- Control points
- CSV imports
- Land parcels
- Spatial features
- Workflow tracking
- And more...

---

#### **Step 5: Update Environment Configuration**

**Edit `.env` file for production:**

```bash
cd app-backend
notepad .env
```

**Production Settings:**

```env
# ============================================
# SERVER CONFIGURATION
# ============================================
PORT=3050
HOST=0.0.0.0  # Allow external connections in production

# Fastify logger level
PLT_SERVER_LOGGER_LEVEL=warn  # Less verbose in production

# ============================================
# SECURITY - CRITICAL FOR PRODUCTION
# ============================================
# Generate a strong JWT secret:
# Run: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET=YOUR_GENERATED_SECRET_HERE

# ============================================
# DATABASE CONFIGURATION
# ============================================
DB_HOST=localhost
DB_PORT=5432
DB_NAME=surveypro_app
DB_USER=postgres
DB_PASSWORD=YOUR_SECURE_PASSWORD

# Full connection string
DATABASE_URL=postgres://postgres:YOUR_SECURE_PASSWORD@localhost:5432/surveypro_app
```

**⚠️ CRITICAL: Generate New JWT Secret**

```bash
# Run this command to generate a secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Copy the output and paste it as JWT_SECRET in .env
```

---

#### **Step 6: Start Backend Server**

```bash
cd app-backend
npm start
```

**Watch for:**
- ✅ "Server listening at http://127.0.0.1:3050"
- ✅ "Database connected successfully"
- ✅ Migrations running automatically
- ✅ No error messages

**Expected Output:**
```
[INFO] Running migrations...
[INFO] Migration 001.do.sql - SUCCESS
[INFO] Migration 002.do.sql - SUCCESS
...
[INFO] Migration 027.do.sql - SUCCESS
[INFO] All migrations completed successfully
[INFO] Server listening at http://127.0.0.1:3050
```

---

#### **Step 7: Seed Essential Data**

**A. Import Control Points (National Trig Network)**

If you have control points data:

```bash
# Option 1: Using SQL file (if you have one)
psql -h localhost -U postgres -d surveypro_app -f setup-control-points-v1.sql

# Option 2: Using the API endpoint
# POST to /api/control-points/batch
# with your control points JSON data
```

**B. Create First Admin User**

```bash
# Start frontend
cd ../app-frontend
npm run dev

# Navigate to: http://localhost:5173/landing
# Register first user (will be admin)
```

---

## ⚙️ Production Configuration

### **Frontend Configuration**

**Edit `app-frontend/.env`:**

```env
# Production API URL
VITE_API_BASE_URL=http://your-server-ip:3050/api

# Or if using domain:
VITE_API_BASE_URL=https://api.surveypro.com/api
```

### **Backend Security Checklist**

- [ ] **Strong JWT_SECRET** (64+ character random string)
- [ ] **Secure database password** (not default)
- [ ] **CORS configured** for production domain
- [ ] **Rate limiting enabled** (if applicable)
- [ ] **HTTPS enabled** (for production deployment)
- [ ] **Firewall rules** configured
- [ ] **Database backups** scheduled

---

## 💾 Data Migration (Optional)

### **If You Need to Preserve Specific Data**

#### **Export Control Points**

```sql
-- Export control points to CSV
COPY (
  SELECT * FROM control_points
) TO 'C:/temp/control_points_backup.csv' WITH CSV HEADER;
```

#### **Export User Accounts**

```sql
-- Export users (passwords are hashed, safe to export)
COPY (
  SELECT * FROM users
) TO 'C:/temp/users_backup.csv' WITH CSV HEADER;

-- Export surveyor profiles
COPY (
  SELECT * FROM surveyor_profiles
) TO 'C:/temp/surveyor_profiles_backup.csv' WITH CSV HEADER;
```

#### **Re-import After Reset**

```sql
-- Import control points
COPY control_points FROM 'C:/temp/control_points_backup.csv' WITH CSV HEADER;

-- Import users
COPY users FROM 'C:/temp/users_backup.csv' WITH CSV HEADER;

-- Import surveyor profiles
COPY surveyor_profiles FROM 'C:/temp/surveyor_profiles_backup.csv' WITH CSV HEADER;
```

---

## ✅ Post-Reset Verification

### **Database Verification**

```sql
-- Connect to database
psql -h localhost -U postgres -d surveypro_app

-- Check tables exist
\dt

-- Expected tables:
-- users
-- surveyor_profiles
-- survey_projects
-- control_points
-- csv_imports
-- survey_points
-- land_parcels
-- area_parcels
-- features
-- layers
-- workflow_steps
-- And more...

-- Check migration status
SELECT * FROM migrations ORDER BY id;

-- Should show all 27 migrations completed

-- Check control points (if imported)
SELECT COUNT(*) FROM control_points;

-- Exit
\q
```

### **API Verification**

```bash
# Test health endpoint
curl http://localhost:3050/health

# Expected: {"status":"ok"}

# Test API base
curl http://localhost:3050/api

# Expected: API documentation or welcome message
```

### **Frontend Verification**

1. **Open browser:** http://localhost:5173
2. **Landing page loads** ✅
3. **Register new user** ✅
4. **Complete profile** ✅
5. **Dashboard loads** ✅
6. **Create test project** ✅
7. **Import CSV** ✅
8. **Generate documents** ✅

---

## 🚀 Production Deployment

### **Deployment Options**

#### **Option 1: Local Server (Windows)**

**Backend as Windows Service:**

```bash
# Install pm2 globally
npm install -g pm2

# Start backend with pm2
cd app-backend
pm2 start npm --name "surveypro-backend" -- start

# Save pm2 configuration
pm2 save

# Setup pm2 to start on boot
pm2 startup
```

**Frontend Build:**

```bash
cd app-frontend
npm run build

# Serve with a web server (nginx, IIS, etc.)
# Build output is in: app-frontend/dist/
```

---

#### **Option 2: Docker Deployment**

**Create `docker-compose.yml`:**

```yaml
version: '3.8'

services:
  postgres:
    image: postgis/postgis:15-3.3
    environment:
      POSTGRES_DB: surveypro_app
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  backend:
    build: ./app-backend
    environment:
      DATABASE_URL: postgres://postgres:${DB_PASSWORD}@postgres:5432/surveypro_app
      JWT_SECRET: ${JWT_SECRET}
      PORT: 3050
    ports:
      - "3050:3050"
    depends_on:
      - postgres

  frontend:
    build: ./app-frontend
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  postgres_data:
```

**Deploy:**

```bash
# Build and start
docker-compose up -d

# Check logs
docker-compose logs -f

# Stop
docker-compose down
```

---

#### **Option 3: Cloud Deployment**

**Recommended Platforms:**
- **Heroku** - Easy deployment, PostgreSQL add-on
- **DigitalOcean** - App Platform or Droplet
- **AWS** - EC2 + RDS
- **Azure** - App Service + PostgreSQL
- **Google Cloud** - App Engine + Cloud SQL

---

## 📊 Production Monitoring

### **Setup Monitoring**

1. **Database Backups**
   ```bash
   # Daily backup script
   pg_dump -h localhost -U postgres -d surveypro_app -F c -f backup-$(date +%Y%m%d).dump
   ```

2. **Log Monitoring**
   - Backend logs: `pm2 logs surveypro-backend`
   - Database logs: Check PostgreSQL logs
   - Frontend errors: Browser console

3. **Performance Monitoring**
   - Database query performance
   - API response times
   - Frontend load times

---

## 🆘 Troubleshooting

### **Common Issues**

#### **Migrations Fail**

```bash
# Check migration status
psql -h localhost -U postgres -d surveypro_app -c "SELECT * FROM migrations;"

# Manually run failed migration
psql -h localhost -U postgres -d surveypro_app -f app-backend/migrations/XXX.do.sql
```

#### **Connection Refused**

- Check PostgreSQL is running
- Verify DATABASE_URL in .env
- Check firewall settings
- Verify port 5432 is open

#### **JWT Errors**

- Ensure JWT_SECRET is set in .env
- Regenerate JWT secret if needed
- Clear browser localStorage

---

## 📝 Production Checklist

### **Before Going Live**

- [ ] Database reset completed
- [ ] All migrations successful
- [ ] Control points imported
- [ ] JWT_SECRET generated and set
- [ ] Database password changed
- [ ] .env configured for production
- [ ] Frontend API URL updated
- [ ] HTTPS enabled (if applicable)
- [ ] Backup strategy in place
- [ ] Monitoring setup
- [ ] Test user registration
- [ ] Test project creation
- [ ] Test document generation
- [ ] Performance tested
- [ ] Security audit completed

---

## 🎉 Launch Day

### **Final Steps**

1. **Announce to users** (if applicable)
2. **Monitor closely** for first 24 hours
3. **Be ready to rollback** if issues arise
4. **Collect user feedback**
5. **Document any issues**

---

## 📞 Support

**If you encounter issues:**

1. Check logs: `pm2 logs surveypro-backend`
2. Check database: `psql -h localhost -U postgres -d surveypro_app`
3. Review this guide
4. Check error messages carefully

---

**Good luck with your production launch!** 🚀
