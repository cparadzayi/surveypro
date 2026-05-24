# 🎯 Database Reset - Quick Summary

**Purpose:** Reset SurveyPro database for production launch  
**Time Required:** 5-10 minutes  
**Difficulty:** Easy

---

## 🚀 Fastest Method (RECOMMENDED)

### **Step 1: Run Reset Script**
```bash
cd c:/mataranyika/SurveyPro-nov-alpha/app-backend
scripts\reset-database.bat
```

### **Step 2: Generate JWT Secret**
```bash
node scripts/generate-jwt-secret.js
```

### **Step 3: Update .env**
```bash
notepad .env

# Update:
JWT_SECRET=<paste_generated_secret>
PLT_SERVER_LOGGER_LEVEL=warn
HOST=0.0.0.0
```

### **Step 4: Start Backend**
```bash
npm start

# Watch for "Migration 027.do.sql - SUCCESS"
```

### **Step 5: Start Frontend**
```bash
cd ../app-frontend
npm run dev

# Open: http://localhost:5173
```

**Done!** ✅

---

## 📚 Documentation Created

I've created **4 comprehensive guides** for you:

### **1. PRODUCTION_LAUNCH_GUIDE.md** (Main Guide)
- Complete step-by-step instructions
- All reset options explained
- Production configuration
- Deployment strategies
- Troubleshooting section
- **Read this for full details**

### **2. QUICK_RESET_GUIDE.md** (Quick Reference)
- Fast reset procedure
- Manual reset steps
- Verification checklist
- Common issues & fixes
- **Use this for quick reference**

### **3. PRODUCTION_CHECKLIST.md** (100+ Items)
- Pre-launch checklist
- Security configuration
- Verification tests
- Production hardening
- Post-launch monitoring
- **Use this to ensure nothing is missed**

### **4. DATABASE_RESET_SUMMARY.md** (This File)
- Quick overview
- Fastest method
- What to expect
- **Use this for quick start**

---

## 🛠️ Scripts Created

### **1. reset-database.bat**
**Location:** `app-backend/scripts/reset-database.bat`

**What it does:**
- ✅ Backs up current database (optional)
- ✅ Drops old database
- ✅ Creates fresh database
- ✅ Sets permissions
- ✅ Provides clear feedback

**Usage:**
```bash
cd app-backend
scripts\reset-database.bat
```

### **2. generate-jwt-secret.js**
**Location:** `app-backend/scripts/generate-jwt-secret.js`

**What it does:**
- ✅ Generates secure 128-character JWT secret
- ✅ Provides copy-paste ready output
- ✅ Shows security warnings

**Usage:**
```bash
cd app-backend
node scripts/generate-jwt-secret.js
```

---

## ⚠️ Important Notes

### **What Gets Deleted**
- ❌ All users and accounts
- ❌ All surveyor profiles
- ❌ All projects
- ❌ All CSV imports
- ❌ All survey points
- ❌ All land parcels
- ❌ All documents
- ❌ All workflow data

### **What Gets Recreated**
- ✅ Fresh database schema (27 migrations)
- ✅ All tables and indexes
- ✅ All constraints and relationships
- ✅ Clean, optimized structure

### **What You Need to Re-import**
- 📍 Control points (national trig network)
- 👤 User accounts (register new)
- 📁 Projects (create new)

---

## 🔐 Security Checklist

Before going live:

- [ ] Generate new JWT_SECRET
- [ ] Set strong database password
- [ ] Update .env for production
- [ ] Never commit .env to git
- [ ] Enable HTTPS (if applicable)
- [ ] Configure firewall
- [ ] Set up backups

---

## ✅ Verification Steps

After reset:

1. **Backend Check:**
   ```bash
   curl http://localhost:3050/health
   # Should return: {"status":"ok"}
   ```

2. **Database Check:**
   ```bash
   psql -h localhost -U postgres -d surveypro_app -c "SELECT COUNT(*) FROM migrations;"
   # Should return: 27
   ```

3. **Frontend Check:**
   - Open http://localhost:5173
   - Landing page loads ✅
   - Can register new user ✅
   - Dashboard loads ✅

---

## 🆘 If Something Goes Wrong

### **Reset Script Fails**
- Check PostgreSQL is running
- Verify no connections to database
- Stop backend server first
- Try manual reset (see QUICK_RESET_GUIDE.md)

### **Migrations Fail**
```bash
# Check which migration failed
psql -h localhost -U postgres -d surveypro_app -c "SELECT * FROM migrations;"

# Manually run failed migration
psql -h localhost -U postgres -d surveypro_app -f migrations/XXX.do.sql
```

### **Backend Won't Start**
- Check .env file exists
- Verify DATABASE_URL is correct
- Check PostgreSQL is running
- Review error messages

### **Frontend Won't Load**
- Check backend is running
- Verify port 5173 is available
- Check browser console for errors
- Try clearing browser cache

---

## 📊 Expected Timeline

| Task | Time |
|------|------|
| Backup current database | 1-2 min |
| Run reset script | 1 min |
| Generate JWT secret | 30 sec |
| Update .env | 1 min |
| Start backend (migrations) | 2-3 min |
| Start frontend | 30 sec |
| Verification | 2-3 min |
| **Total** | **8-12 min** |

---

## 🎉 Success Indicators

You'll know it worked when:

- ✅ Reset script completes without errors
- ✅ Backend starts and shows "Migration 027.do.sql - SUCCESS"
- ✅ Server listening message appears
- ✅ Frontend loads at http://localhost:5173
- ✅ Can register new user
- ✅ Dashboard loads after registration
- ✅ Can create new project
- ✅ Can import CSV file

---

## 📞 Next Steps

After successful reset:

1. **Import Control Points** (if you have them)
2. **Register First User** (will be admin)
3. **Create Test Project**
4. **Test Full Workflow**
5. **Configure for Production**
6. **Set Up Backups**
7. **Deploy to Production Server** (optional)

---

## 📚 Additional Resources

- **Full Guide:** PRODUCTION_LAUNCH_GUIDE.md
- **Quick Reference:** QUICK_RESET_GUIDE.md
- **Checklist:** PRODUCTION_CHECKLIST.md
- **Codebase Cleanup:** CODEBASE_CLEANUP_RESULTS.md

---

## 💡 Pro Tips

1. **Always backup first** (even if you don't think you need it)
2. **Test the reset** on a copy before production
3. **Generate strong JWT secret** (use the script)
4. **Document your configuration** (save .env template)
5. **Set up automated backups** (daily recommended)
6. **Monitor closely** for first 24 hours after launch
7. **Keep migration files** (never delete them)

---

## ✨ You're Ready!

Everything is prepared for your production launch:

- ✅ Reset scripts created
- ✅ Documentation complete
- ✅ Security tools ready
- ✅ Verification steps defined
- ✅ Troubleshooting covered
- ✅ Codebase cleaned up

**Just run the reset script and follow the steps!** 🚀

---

**Good luck with your production launch!** 🎉
