# ⚡ Quick Database Reset Guide

**For:** Production Launch  
**Time Required:** 5-10 minutes

---

## 🚀 Quick Start (Automated)

### **Option 1: Use Reset Script (EASIEST)**

```bash
# Navigate to backend
cd c:/mataranyika/SurveyPro-nov-alpha/app-backend

# Run reset script
scripts\reset-database.bat

# Follow prompts:
# - Backup? (yes/no)
# - Confirm reset? (yes)
```

**That's it!** The script will:
- ✅ Backup current database (optional)
- ✅ Drop old database
- ✅ Create fresh database
- ✅ Set permissions

---

## 🔧 Manual Reset (If Script Fails)

### **Step 1: Stop Backend**
```bash
# Press Ctrl+C in terminal running backend
```

### **Step 2: Reset Database**
```bash
# Open psql
psql -h localhost -U postgres

# Run these commands:
DROP DATABASE IF EXISTS surveypro_app;
CREATE DATABASE surveypro_app;
GRANT ALL PRIVILEGES ON DATABASE surveypro_app TO postgres;
\q
```

### **Step 3: Generate JWT Secret**
```bash
cd app-backend
node scripts/generate-jwt-secret.js

# Copy the output
```

### **Step 4: Update .env**
```bash
notepad .env

# Update these lines:
JWT_SECRET=<paste_generated_secret>
PLT_SERVER_LOGGER_LEVEL=warn
HOST=0.0.0.0
```

### **Step 5: Start Backend**
```bash
npm start

# Watch for:
# ✅ "Running migrations..."
# ✅ "Migration 001.do.sql - SUCCESS"
# ✅ ...
# ✅ "Migration 027.do.sql - SUCCESS"
# ✅ "Server listening at http://127.0.0.1:3050"
```

### **Step 6: Start Frontend**
```bash
cd ../app-frontend
npm run dev

# Open: http://localhost:5173
```

---

## ✅ Verification Checklist

After reset, verify:

- [ ] Backend starts without errors
- [ ] All 27 migrations completed
- [ ] Frontend loads at http://localhost:5173
- [ ] Can register new user
- [ ] Can complete profile
- [ ] Dashboard loads
- [ ] Can create project
- [ ] Can import CSV

---

## 🆘 Troubleshooting

### **"Database already exists"**
```bash
# Force drop with:
psql -h localhost -U postgres -c "DROP DATABASE surveypro_app WITH (FORCE);"
```

### **"Connection refused"**
- Check PostgreSQL is running
- Verify port 5432 is open
- Check .env DATABASE_URL

### **"Migrations failed"**
```bash
# Check migration status:
psql -h localhost -U postgres -d surveypro_app -c "SELECT * FROM migrations;"

# Manually run failed migration:
psql -h localhost -U postgres -d surveypro_app -f migrations/XXX.do.sql
```

### **"JWT errors"**
- Regenerate JWT secret: `node scripts/generate-jwt-secret.js`
- Update .env file
- Restart backend

---

## 📊 What Gets Reset

### **Deleted:**
- ❌ All users and accounts
- ❌ All surveyor profiles
- ❌ All projects
- ❌ All CSV imports
- ❌ All survey points
- ❌ All land parcels
- ❌ All documents
- ❌ All workflow data

### **Preserved:**
- ✅ Database schema (recreated from migrations)
- ✅ Control points (if you re-import them)

---

## 🔐 Production Security

**Before going live, update .env:**

```env
# Generate new secret
JWT_SECRET=<run: node scripts/generate-jwt-secret.js>

# Production settings
PLT_SERVER_LOGGER_LEVEL=warn
HOST=0.0.0.0

# Secure password
DB_PASSWORD=<strong_password_here>
```

---

## 📞 Need Help?

1. Check logs: `npm start` (watch for errors)
2. Check database: `psql -h localhost -U postgres -d surveypro_app`
3. Review full guide: `PRODUCTION_LAUNCH_GUIDE.md`

---

**Total Time:** 5-10 minutes  
**Difficulty:** Easy  
**Risk:** Low (with backup)
