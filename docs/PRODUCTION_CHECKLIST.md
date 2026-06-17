# ✅ SurveyPro Production Launch Checklist

**Date:** _______________  
**Launched By:** _______________

---

## 📋 Pre-Launch (Do First)

### **1. Backup & Documentation**
- [ ] Backup current database (if needed)
- [ ] Document current state
- [ ] List any data to preserve
- [ ] Review migration files (27 total)
- [ ] Test reset on copy first (recommended)

### **2. Environment Preparation**
- [ ] PostgreSQL installed and running
- [ ] Node.js installed (v16+)
- [ ] npm packages installed (backend & frontend)
- [ ] Port 3050 available (backend)
- [ ] Port 5173 available (frontend dev)

---

## 🔄 Database Reset

### **3. Reset Procedure**
- [ ] Stop backend server
- [ ] Run reset script: `scripts\reset-database.bat`
- [ ] OR manually drop/create database
- [ ] Verify database created successfully
- [ ] Check no errors in console

**Commands:**
```bash
cd app-backend
scripts\reset-database.bat
```

---

## 🔐 Security Configuration

### **4. Generate Secrets**
- [ ] Generate JWT secret: `node scripts/generate-jwt-secret.js`
- [ ] Copy generated secret
- [ ] Update .env file with new JWT_SECRET
- [ ] Set strong database password
- [ ] Never commit .env to git

**Commands:**
```bash
cd app-backend
node scripts/generate-jwt-secret.js
notepad .env
```

### **5. Update .env for Production**
- [ ] `JWT_SECRET=<generated_secret>`
- [ ] `PLT_SERVER_LOGGER_LEVEL=warn`
- [ ] `HOST=0.0.0.0` (for external access)
- [ ] `DB_PASSWORD=<secure_password>`
- [ ] `DATABASE_URL` updated with correct password

**Example .env:**
```env
PORT=3050
HOST=0.0.0.0
PLT_SERVER_LOGGER_LEVEL=warn
JWT_SECRET=<your_128_char_secret>
DB_HOST=localhost
DB_PORT=5432
DB_NAME=surveypro_app
DB_USER=postgres
DB_PASSWORD=<secure_password>
DATABASE_URL=postgres://postgres:<secure_password>@localhost:5432/surveypro_app
```

---

## 🚀 Server Startup

### **6. Start Backend**
- [ ] Navigate to app-backend
- [ ] Run `npm start`
- [ ] Watch for migration messages
- [ ] Verify all 27 migrations complete
- [ ] Check "Server listening" message
- [ ] No error messages

**Expected Output:**
```
[INFO] Running migrations...
[INFO] Migration 001.do.sql - SUCCESS
...
[INFO] Migration 027.do.sql - SUCCESS
[INFO] Server listening at http://127.0.0.1:3050
```

### **7. Start Frontend**
- [ ] Navigate to app-frontend
- [ ] Run `npm run dev`
- [ ] Verify server starts
- [ ] Open http://localhost:5173
- [ ] Landing page loads correctly

---

## 📊 Data Seeding

### **8. Import Essential Data**
- [ ] Import control points (if available)
- [ ] Verify control points loaded
- [ ] Check count: `SELECT COUNT(*) FROM control_points;`

**Commands:**
```bash
# If you have control points SQL file:
psql -h localhost -U postgres -d surveypro_app -f setup-control-points-v1.sql

# Verify:
psql -h localhost -U postgres -d surveypro_app -c "SELECT COUNT(*) FROM control_points;"
```

---

## ✅ Verification Tests

### **9. Database Verification**
- [ ] Connect to database: `psql -h localhost -U postgres -d surveypro_app`
- [ ] List tables: `\dt`
- [ ] Check migrations: `SELECT * FROM migrations;`
- [ ] Verify 27 migrations completed
- [ ] Check control points count (if imported)
- [ ] Exit: `\q`

**Expected Tables:**
- users
- surveyor_profiles
- survey_projects
- control_points
- csv_imports
- survey_points
- land_parcels
- area_parcels
- features
- layers
- workflow_steps
- And more...

### **10. API Verification**
- [ ] Test health: `curl http://localhost:3050/health`
- [ ] Response: `{"status":"ok"}`
- [ ] Test API base: `curl http://localhost:3050/api`
- [ ] No 500 errors

### **11. Frontend Verification**
- [ ] Landing page loads
- [ ] Register new user works
- [ ] Email validation works
- [ ] Password confirmation works
- [ ] Login works
- [ ] Profile completion page loads
- [ ] Can select surveyor type
- [ ] Dashboard loads after profile
- [ ] No console errors

### **12. Full Workflow Test**
- [ ] Create new project
- [ ] Project appears in dashboard
- [ ] Enter Cadastral Standard workflow
- [ ] Project selector works
- [ ] Import CSV file
- [ ] Points load correctly
- [ ] Generate Field Book
- [ ] Generate Calculations Part 1
- [ ] Generate Coordinate List
- [ ] Area Computation works
- [ ] Generate Report on Survey
- [ ] Generate DSG Certificate
- [ ] All PDFs download correctly

---

## 🔒 Production Hardening

### **13. Security Review**
- [ ] JWT_SECRET is strong (128+ characters)
- [ ] Database password is secure
- [ ] .env file not in git
- [ ] .gitignore includes .env
- [ ] No sensitive data in logs
- [ ] CORS configured correctly
- [ ] Rate limiting enabled (if applicable)

### **14. Performance Check**
- [ ] Database indexes created (automatic via migrations)
- [ ] Query performance acceptable
- [ ] Page load times < 3 seconds
- [ ] PDF generation < 10 seconds
- [ ] No memory leaks

### **15. Backup Strategy**
- [ ] Backup script created
- [ ] Backup schedule defined
- [ ] Backup location secured
- [ ] Restore procedure tested
- [ ] Backup retention policy set

**Daily Backup Script:**
```bash
# Create backup script
pg_dump -h localhost -U postgres -d surveypro_app -F c -f backup-$(date +%Y%m%d).dump
```

---

## 📱 Production Deployment (Optional)

### **16. Server Setup**
- [ ] Production server ready
- [ ] PostgreSQL installed on server
- [ ] Node.js installed on server
- [ ] Firewall configured
- [ ] Ports opened (3050, 5432)
- [ ] SSL certificate installed (if HTTPS)

### **17. Application Deployment**
- [ ] Code deployed to server
- [ ] Dependencies installed
- [ ] .env configured for production
- [ ] Database migrated
- [ ] Backend running as service (pm2)
- [ ] Frontend built and served
- [ ] Domain configured (if applicable)

### **18. Monitoring Setup**
- [ ] Log monitoring configured
- [ ] Error tracking enabled
- [ ] Performance monitoring active
- [ ] Uptime monitoring set
- [ ] Alert notifications configured

---

## 🎉 Go Live

### **19. Final Checks**
- [ ] All tests passing
- [ ] No critical errors
- [ ] Backup completed
- [ ] Team notified
- [ ] Documentation updated
- [ ] Support plan ready

### **20. Launch**
- [ ] Announce to users
- [ ] Monitor for first 24 hours
- [ ] Respond to issues quickly
- [ ] Collect user feedback
- [ ] Document any problems

---

## 📊 Post-Launch Monitoring

### **First 24 Hours**
- [ ] Check logs every 2 hours
- [ ] Monitor database performance
- [ ] Track user registrations
- [ ] Watch for errors
- [ ] Respond to user feedback

### **First Week**
- [ ] Daily log review
- [ ] Performance metrics
- [ ] User feedback analysis
- [ ] Bug tracking
- [ ] Feature requests

### **First Month**
- [ ] Weekly backups verified
- [ ] Performance optimization
- [ ] User training (if needed)
- [ ] Documentation updates
- [ ] Feature roadmap

---

## 🆘 Rollback Plan

### **If Issues Arise**
- [ ] Stop servers immediately
- [ ] Restore from backup
- [ ] Identify root cause
- [ ] Fix issue
- [ ] Test thoroughly
- [ ] Re-deploy

**Rollback Commands:**
```bash
# Stop servers
pm2 stop all

# Restore database
pg_restore -h localhost -U postgres -d surveypro_app backup-file.dump

# Restart servers
pm2 restart all
```

---

## 📝 Sign-Off

### **Completion**
- [ ] All checklist items completed
- [ ] Production launch successful
- [ ] No critical issues
- [ ] Team informed
- [ ] Documentation complete

**Signed:**

Name: _____________________  
Date: _____________________  
Role: _____________________

---

## 📞 Support Contacts

**Technical Issues:**
- Database: _____________________
- Backend: _____________________
- Frontend: _____________________

**Emergency:**
- On-call: _____________________
- Backup: _____________________

---

**Total Items:** 100+  
**Estimated Time:** 2-4 hours  
**Difficulty:** Medium  
**Risk Level:** Low (with proper testing)

---

**Good luck with your production launch!** 🚀
