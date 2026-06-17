# ✅ QGIS Workflow Checklist - Maglas Dataset

## 🎯 Goal
Digitize 160 land parcels in QGIS using coordinate points from SurveyPro.

**Time:** 2-3 hours  
**Quality:** 100% accurate with perfect closure

---

## 📋 Pre-Flight Checklist

### **Software Requirements**
- [ ] QGIS Desktop installed (version 3.x)
- [ ] PostgreSQL running (port 5432)
- [ ] SurveyPro backend running (port 3050)
- [ ] SurveyPro frontend running (port 5173)

### **Database Setup**
- [ ] PostgreSQL accessible at localhost:5432
- [ ] Database: `surveypro` exists
- [ ] PostGIS extension enabled
- [ ] Tables: `coordinate_points`, `land_parcels` exist

### **Data Preparation**
- [ ] Maglas dataset loaded (298 points)
- [ ] Project selected in SurveyPro
- [ ] Points visible in Areas module

---

## 🚀 Workflow Steps

### **Phase 1: Export Data (5 minutes)**

- [ ] Open SurveyPro → Areas Module
- [ ] Select Maglas project
- [ ] Click "Export to Database"
- [ ] Verify: "✅ 298 points exported" message
- [ ] Check in pgAdmin: `SELECT COUNT(*) FROM coordinate_points;` → 298

---

### **Phase 2: QGIS Setup (10 minutes)**

#### **Connect to Database**
- [ ] Open QGIS Desktop
- [ ] Layer → Add PostGIS Layers
- [ ] New connection: "SurveyPro"
  - Host: localhost
  - Port: 5432
  - Database: surveypro
  - Username: postgres
  - Password: [your password]
- [ ] Test Connection → Success
- [ ] Save connection

#### **Load Coordinate Points**
- [ ] Connect to SurveyPro database
- [ ] Add `coordinate_points` layer
- [ ] Points appear on canvas (298 points)

#### **Configure Labels**
- [ ] Right-click layer → Properties → Labels
- [ ] Enable "Single Labels"
- [ ] Value: `name` field
- [ ] Font: 8-10pt, Black, White buffer (2px)
- [ ] Apply → Labels visible (1438A, 1438B, etc.)

#### **Enable Snapping**
- [ ] Press `S` for Snapping Options
- [ ] Enable Snapping (toggle ON)
- [ ] Snap to: Vertex
- [ ] Layer: coordinate_points
- [ ] Tolerance: 5 meters
- [ ] Enable Topological Editing
- [ ] Enable Snapping on Intersection

---

### **Phase 3: Create Parcels Layer (5 minutes)**

**Option A: Temporary Shapefile**
- [ ] Layer → Create Layer → New Shapefile
- [ ] Geometry: Polygon
- [ ] CRS: EPSG:22291 (Cape / Lo31)
- [ ] Add field: `designation` (Text, 50)
- [ ] Add field: `stand_number` (Integer)
- [ ] Save as: `maglas_parcels.shp`

**Option B: Database Table** (Recommended)
- [ ] Database → DB Manager → SQL Window
- [ ] Run SQL to create `land_parcels_temp` table
- [ ] Refresh → Load table in QGIS

---

### **Phase 4: Digitize Parcels (2-3 hours)**

#### **Setup**
- [ ] Select parcels layer
- [ ] Toggle Editing (Ctrl+E)
- [ ] Zoom to first parcel area (STAND 1438)

#### **Digitization Progress**

**Batch 1: Stands 1438-1447 (10 parcels)**
- [ ] STAND 1438 (4 corners: A, B, C, 1439A)
- [ ] STAND 1439 (estimate B, D from A, C)
- [ ] STAND 1440
- [ ] STAND 1441
- [ ] STAND 1442
- [ ] STAND 1443
- [ ] STAND 1444
- [ ] STAND 1445
- [ ] STAND 1446
- [ ] STAND 1447
- [ ] **Save edits** (Ctrl+S)

**Batch 2: Stands 1448-1467 (20 parcels)**
- [ ] Complete 20 parcels
- [ ] **Save edits**

**Batch 3: Stands 1468-1487 (20 parcels)**
- [ ] Complete 20 parcels
- [ ] **Save edits**

**Batch 4: Stands 1488-1507 (20 parcels)**
- [ ] Complete 20 parcels
- [ ] **Save edits**

**Batch 5: Stands 1508-1527 (20 parcels)**
- [ ] Complete 20 parcels
- [ ] **Save edits**

**Batch 6: Stands 1528-1547 (20 parcels)**
- [ ] Complete 20 parcels
- [ ] **Save edits**

**Batch 7: Stands 1548-1567 (20 parcels)**
- [ ] Complete 20 parcels
- [ ] **Save edits**

**Batch 8: Stands 1568-1587 (20 parcels)**
- [ ] Complete 20 parcels
- [ ] **Save edits**

**Batch 9: Stands 1588-1597 (10 parcels)**
- [ ] Complete remaining parcels
- [ ] **Final save**

**Total Progress:** _____ / 160 parcels

---

### **Phase 5: Quality Control (15 minutes)**

#### **Visual Inspection**
- [ ] Zoom out to see all parcels
- [ ] Check for obvious gaps
- [ ] Check for overlaps
- [ ] Verify all parcels filled with color

#### **Topology Validation**
- [ ] Vector → Topology Checker
- [ ] Add rules:
  - Must not have gaps
  - Must not overlap
  - Must not have invalid geometries
- [ ] Validate All
- [ ] Fix any errors (should be 0 if snapping used correctly)

#### **Attribute Check**
- [ ] Open attribute table
- [ ] Verify all 160 rows present
- [ ] Check `designation` field filled
- [ ] Check `stand_number` field filled
- [ ] No NULL values

---

### **Phase 6: Export to Database (5 minutes)**

**If using shapefile:**
- [ ] Right-click layer → Export → Save Features As
- [ ] Format: PostGIS
- [ ] Connection: SurveyPro
- [ ] Table: land_parcels
- [ ] CRS: EPSG:22291
- [ ] Export complete

**If already in database:**
- [ ] Save edits (Ctrl+S)
- [ ] Toggle editing off
- [ ] Verify in pgAdmin: `SELECT COUNT(*) FROM land_parcels;` → 160

---

### **Phase 7: Compute Areas in SurveyPro (5 minutes)**

- [ ] Return to SurveyPro → Areas Module
- [ ] Click "Refresh Parcels" button
- [ ] Verify: 160 parcels loaded
- [ ] Click "Run Batch Computation"
- [ ] Review results:
  - [ ] All parcels have area > 0 m²
  - [ ] Closure errors < 0.5m (ideally ~0.00m)
  - [ ] No validation errors

---

## 📊 Final Verification

### **Data Quality Metrics**
- [ ] Total parcels: 160
- [ ] Parcels with closure error < 0.5m: _____ / 160
- [ ] Parcels with closure error < 0.1m: _____ / 160
- [ ] Average area: ~_____ m²
- [ ] Total area: ~_____ ha

### **Deliverables**
- [ ] 160 parcels digitized
- [ ] All parcels in database
- [ ] Areas computed
- [ ] Closure errors acceptable
- [ ] Ready for report generation

---

## 🎉 Success Criteria

✅ **Workflow Complete When:**
1. All 160 parcels digitized
2. No topology errors
3. All closure errors < 0.5m
4. Data exported to SurveyPro database
5. Batch computation successful
6. Ready for cadastral submission

---

## ⏱️ Time Tracking

| Phase | Estimated | Actual | Notes |
|-------|-----------|--------|-------|
| Export Data | 5 min | _____ | |
| QGIS Setup | 10 min | _____ | |
| Create Layer | 5 min | _____ | |
| Digitize (Batch 1-9) | 120-180 min | _____ | |
| Quality Control | 15 min | _____ | |
| Export to DB | 5 min | _____ | |
| Compute Areas | 5 min | _____ | |
| **TOTAL** | **165-225 min** | **_____** | |

---

## 📝 Notes & Issues

**Issues Encountered:**
- 
- 
- 

**Solutions Applied:**
- 
- 
- 

**Lessons Learned:**
- 
- 
- 

---

## 🔄 Next Time Improvements

- [ ] Create QGIS project template with snapping pre-configured
- [ ] Use attribute forms to auto-increment stand numbers
- [ ] Set up keyboard shortcuts for faster digitization
- [ ] Create style file for parcel visualization
- [ ] Document any special cases or irregular parcels

---

**Started:** ___________  
**Completed:** ___________  
**Total Time:** ___________  

**Digitized by:** ___________  
**Verified by:** ___________  

---

✅ **Workflow Status: Ready to Begin!**
