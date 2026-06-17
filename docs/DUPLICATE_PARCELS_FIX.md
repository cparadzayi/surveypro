# 🔧 Land Parcels Duplicate Cleanup Guide

## 🎯 **Problem**

Your `land_parcels` table has duplicate entries:
- Same stand numbers repeated within projects
- Potentially overlapping polygon boundaries

---

## ✅ **Solution**

I've created **Migration 024** which will:
1. **Clean up existing duplicates** (keeps most recent)
2. **Add unique constraint** (prevents duplicate stand numbers)
3. **Add overlap detection** (prevents overlapping polygons)

---

## 🚀 **Quick Start**

### **Step 1: Check Current Duplicates**

Run this query in your database to see what will be cleaned:

```sql
-- See how many duplicates you have
SELECT 
  project_id,
  stand,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ' ORDER BY created_at DESC) as parcel_ids
FROM land_parcels
GROUP BY project_id, stand
HAVING COUNT(*) > 1
ORDER BY project_id, stand;
```

**Example Output:**
```
project_id | stand | duplicate_count | parcel_ids
-----------+-------+-----------------+------------
     23    | 2836  |        3        | 11, 10, 9
```

This means Stand 2836 in Project 23 has 3 duplicates. The migration will keep ID 11 (most recent) and delete IDs 10 and 9.

---

### **Step 2: Run the Migration**

**Option A: Using npm (recommended)**
```bash
cd app-backend
npm run migrate up 024
```

**Option B: Manual psql**
```bash
cd app-backend
psql -U postgres -d surveypro < migrations/024.do.sql
```

---

### **Step 3: Verify Results**

The migration will show you:
```
🔍 Found 3 duplicate stand numbers across projects
  → Project 23, Stand 2836: 3 parcels (keeping ID: 11, deleting: 10, 9)
🗑️  Deleted 2 duplicate parcels
✅ Added unique constraint on (project_id, stand)
✅ Created spatial overlap prevention trigger
```

---

## 📊 **What Happens During Migration**

### **1. Backup Created**
All existing data is backed up to `land_parcels_backup_024`
```sql
-- View backup
SELECT * FROM land_parcels_backup_024;
```

### **2. Duplicates Identified**
```
Finding duplicates...
Project 23:
  Stand 2836: 3 parcels
    - Keep: ID 11 (created 2025-11-12 07:00:00)
    - Delete: ID 10 (created 2025-11-12 06:55:00)
    - Delete: ID 9 (created 2025-11-12 06:50:00)
```

### **3. Duplicates Deleted**
Keeps the most recent parcel (latest `created_at`)

### **4. Constraints Added**
- **Unique constraint** on `(project_id, stand)`
- **Spatial trigger** to detect overlaps

---

## 🛡️ **After Migration**

### **✅ What's Now Protected**

**Duplicate Stand Numbers:**
```javascript
// Before: ✅ Both would be saved
createParcel({ projectId: 23, stand: '2428' })
createParcel({ projectId: 23, stand: '2428' })  // Duplicate!

// After: ❌ Second one fails
createParcel({ projectId: 23, stand: '2428' })  // ✅ Success
createParcel({ projectId: 23, stand: '2428' })  // ❌ Error!
// Error: "Parcel with stand "2428" already exists in this project"
```

**Overlapping Polygons:**
```javascript
// Before: ✅ Both would be saved (overlapping!)
createParcel({ stand: '2428', geom: polygon1 })
createParcel({ stand: '2429', geom: polygon2 })  // Overlaps polygon1!

// After: ❌ Second one fails if overlap > 1m²
createParcel({ stand: '2428', geom: polygon1 })  // ✅ Success
createParcel({ stand: '2429', geom: polygon2 })  // ❌ Error!
// Error: "Parcel "2429" overlaps with existing parcel "2428" by 15.60 m²"
```

---

## 🔍 **Verification Queries**

### **Check No Duplicates Remain**
```sql
SELECT project_id, stand, COUNT(*) as count
FROM land_parcels
GROUP BY project_id, stand
HAVING COUNT(*) > 1;
```
**Expected:** 0 rows

---

### **Check for Polygon Overlaps**
```sql
SELECT 
  a.project_id,
  a.stand as parcel_a,
  b.stand as parcel_b,
  ROUND(ST_Area(ST_Intersection(a.geom, b.geom))::numeric, 2) as overlap_m2
FROM land_parcels a
JOIN land_parcels b ON a.project_id = b.project_id AND a.id < b.id
WHERE ST_Overlaps(a.geom, b.geom)
  AND ST_Area(ST_Intersection(a.geom, b.geom)) > 1.0
ORDER BY overlap_m2 DESC;
```
**Expected:** 0 rows (or only small overlaps < 1m²)

---

### **View Deleted Duplicates**
```sql
-- See what was deleted (compare with backup)
SELECT b.* 
FROM land_parcels_backup_024 b
LEFT JOIN land_parcels p ON p.id = b.id
WHERE p.id IS NULL
ORDER BY b.project_id, b.stand;
```

---

## 🔄 **Rollback (If Needed)**

If something goes wrong:

```bash
cd app-backend
npm run migrate down 024
```

Or manually:
```bash
psql -U postgres -d surveypro < migrations/024.undo.sql
```

**Note:** Rollback removes constraints but does NOT restore deleted duplicates. Use the backup table for manual restoration:

```sql
-- Restore specific parcel
INSERT INTO land_parcels 
SELECT * FROM land_parcels_backup_024 
WHERE id = 10;  -- Replace with actual ID
```

---

## 🧪 **Testing the Constraints**

### **Test 1: Try Creating Duplicate**

```javascript
// In browser console or frontend
const response1 = await createLandParcel({
  projectId: 23,
  stand: 'TEST-001',
  geom: { /* ... */ }
});
console.log('First parcel:', response1);  // ✅ Success

const response2 = await createLandParcel({
  projectId: 23,
  stand: 'TEST-001',  // Same stand!
  geom: { /* ... */ }
});
// ❌ Should fail with: "Parcel with stand "TEST-001" already exists"
```

---

### **Test 2: Different Projects OK**

```javascript
const response1 = await createLandParcel({
  projectId: 23,
  stand: 'TEST-001',
  geom: { /* ... */ }
});
// ✅ Success

const response2 = await createLandParcel({
  projectId: 24,  // Different project!
  stand: 'TEST-001',  // Same stand is OK
  geom: { /* ... */ }
});
// ✅ Success (allowed in different project)
```

---

## 📝 **Current Database Status**

Run this to see your current situation:

```sql
-- Total parcels
SELECT COUNT(*) as total_parcels FROM land_parcels;

-- Parcels by project
SELECT project_id, COUNT(*) as parcel_count
FROM land_parcels
GROUP BY project_id
ORDER BY project_id;

-- Check for duplicates
SELECT 
  project_id,
  stand,
  COUNT(*) as count,
  MIN(created_at) as oldest,
  MAX(created_at) as newest
FROM land_parcels
GROUP BY project_id, stand
HAVING COUNT(*) > 1;
```

---

## 🎯 **Recommendation**

**Run the migration during off-hours:**
- Migration is fast (< 1 second for small datasets)
- Creates backup automatically
- No downtime required
- Rollback available if needed

**Steps:**
1. Run verification queries (check current duplicates)
2. Run migration: `npm run migrate up 024`
3. Verify no duplicates remain
4. Test creating new parcels
5. Done! ✨

---

## 📞 **Need Help?**

If you see any errors:

1. **Check the migration log** - Shows what was deleted
2. **View backup table** - `SELECT * FROM land_parcels_backup_024;`
3. **Check constraints** - `\d land_parcels` in psql
4. **Rollback if needed** - `npm run migrate down 024`

---

## 🎉 **Expected Results**

After migration:
- ✅ All duplicate parcels cleaned up
- ✅ No stand can be repeated in same project
- ✅ Overlapping parcels (>1m²) blocked
- ✅ Clear error messages to users
- ✅ Backup available for recovery
- ✅ QGIS digitization still works normally

---

**Ready to run? Execute:** `npm run migrate up 024` 🚀✨🛡️

See `app-backend/migrations/024.README.md` for full technical details.
