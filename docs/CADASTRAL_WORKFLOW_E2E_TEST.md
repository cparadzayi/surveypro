# Cadastral Workflow End-to-End Test Guide

**Version:** 2.0 (AI/ML Enhanced)  
**Date:** 2025-01-22  
**Duration:** 45-60 minutes per scenario

---

## 🎯 Test Objectives

Validate complete cadastral workflow with focus on:
1. ✅ AI/ML Page Numbering accuracy
2. ✅ Cross-Document References
3. ✅ Continuous Page Numbering
4. ✅ Data Persistence
5. ✅ PDF Generation quality
6. ✅ ML Data Collection

---

## 📋 Prerequisites

- ✅ Backend: `http://127.0.0.1:3050`
- ✅ Frontend: `http://localhost:5173`
- ✅ PostgreSQL with migrations
- ✅ Registered surveyor account
- ✅ Test CSV files ready

---

## 🧪 Test Scenarios

### **Scenario 1: Small Project**
- Points: 75, Duplicates: 8, Parcels: 4
- Expected: ~12-15 pages total

### **Scenario 2: Medium Project**
- Points: 200, Duplicates: 15, Parcels: 10
- Expected: ~28-32 pages total

### **Scenario 3: Large Project**
- Points: 500, Duplicates: 40, Parcels: 25
- Expected: ~66-70 pages total

---

## 🔄 Test Procedure

### **Phase 1: Setup (5 min)**
1. Login with registered surveyor
2. Create/select project
3. Verify navigation to workflow

### **Phase 2: Project Setup (3 min)**
1. Fill survey type, stand reference, township
2. Verify auto-population
3. Save and continue

**Console Check:**
```
[CadastralStandard] 💾 Project setup data saved
```

### **Phase 3: CSV Import (5 min)**
1. Import test CSV file
2. Verify points loaded
3. Check map display

**Console Check:**
```
[CadastralStandard] 📊 CSV Import Results: Total Points: [X]
```

### **Phase 4: Field Book (5 min)**
1. Generate field book PDF
2. Verify page numbers (E1-E99)
3. Check lookup table created

**Console Check:**
```
[FieldBook] 📖 Total Pages: [Y], Page Range: E1-E[Y]
```

### **Phase 5: Calculations (10 min)**

**🎯 CRITICAL: AI/ML Page Numbering Test**

1. Generate calculations PDF
2. **Verify expert predictor invoked**
3. Check prediction confidence

**Console Check (MUST VERIFY):**
```
[PageAllocation] 🎯 Using Expert Page Predictor...
[ExpertPredictor] 📊 Prediction:
  coordinateList: [X] pages
  calculations: [Y] pages
  areas: [Z] pages
  confidence: [N]%
```

**Validation:**
- ✅ Confidence: 70-90%
- ✅ Breakdown shows adjustments
- ✅ Predictions reasonable

### **Phase 6: Coordinate List (10 min)**

**🎯 CRITICAL: Cross-Reference Test**

1. Generate coordinate list PDF
2. **Verify cross-references**
3. Test 5 random points

**Cross-Reference Validation:**
```
Pick Point P15:
  Coord List: F/B Page E2, Calc Page 105
  → Check Field Book E2: P15 exists ✅
  → Check Calculations 105: P15 analysis exists ✅
```

**Console Check:**
```
[CoordinateList] 📍 Start Page: 100, Predicted Pages: [Y]
```

### **Phase 7: Area Computation (10 min)**
1. Digitize all parcels
2. Verify area calculations
3. Check closure errors

**Console Check:**
```
[AreaComputation] 📐 Parcel: Area [Y] m², Closure [Z] m
```

### **Phase 8: Report on Survey (5 min)**

**🎯 CRITICAL: Auto-Population Test**

1. **Verify "Survey Of" auto-populated**
2. Check format: "[Type] - [Stand], [Township]"
3. Complete remaining fields

**Console Check:**
```
[ReportOnSurvey] 📋 Auto-Population:
  Survey Of: [combined value]
  Source: Project Setup (persistent)
```

### **Phase 9: DSG Certificate (3 min)**

**🎯 CRITICAL: Consistency Test**

1. **Verify "Survey Of" matches Report**
2. Check surveyor details
3. Generate certificate

**Console Check:**
```
[DSGCertificate] 📋 Survey Of: [value] (from Project Setup)
```

### **Phase 10: Comprehensive Document (10 min)**

**🎯 FINAL VALIDATION**

1. Generate comprehensive PDF
2. **Verify ML training logged**
3. Check statistics

**Console Check (CRITICAL):**
```
[ComprehensiveDoc] 📊 Actual page numbers:
  - Coordinate List: 100 - [X]
  - Calculations: [X+1] - [Y]

[ComprehensiveDoc] 📈 ML Training Stats:
  accuracy: { coordinateList: [X]%, calculations: [Y]%, areas: [Z]% }
```

**PDF Validation:**
- ✅ All sections present
- ✅ Page numbering continuous
- ✅ Cross-references accurate (100%)
- ✅ No missing/duplicate pages

### **Phase 11: ML Data Validation (4 min)**

**Check Training Data:**
```javascript
// In browser console:
localStorage.getItem('pageNumberingLogs')
```

**Verify:**
- ✅ Training logs exist
- ✅ Actual results logged
- ✅ Errors calculated
- ✅ Accuracy within range

**Acceptable Errors:**
- Small Project: ≤ 2 pages total
- Medium Project: ≤ 3 pages total
- Large Project: ≤ 4 pages total

---

## 📊 Test Results Template

**Test Date:** _______________  
**Scenario:** [ ] Small [ ] Medium [ ] Large

### **Phase Results**

| Phase | Status | Issues |
|-------|--------|--------|
| Setup & Auth | ⬜ Pass ⬜ Fail | |
| Project Setup | ⬜ Pass ⬜ Fail | |
| CSV Import | ⬜ Pass ⬜ Fail | |
| Field Book | ⬜ Pass ⬜ Fail | |
| Calculations | ⬜ Pass ⬜ Fail | |
| Coordinate List | ⬜ Pass ⬜ Fail | |
| Area Computation | ⬜ Pass ⬜ Fail | |
| Report on Survey | ⬜ Pass ⬜ Fail | |
| DSG Certificate | ⬜ Pass ⬜ Fail | |
| Comprehensive Doc | ⬜ Pass ⬜ Fail | |
| ML Data | ⬜ Pass ⬜ Fail | |

### **AI/ML Results**

| Document | Predicted | Actual | Error | Status |
|----------|-----------|--------|-------|--------|
| Coord List | ___ | ___ | ___ | ⬜ Pass ⬜ Fail |
| Calculations | ___ | ___ | ___ | ⬜ Pass ⬜ Fail |
| Areas | ___ | ___ | ___ | ⬜ Pass ⬜ Fail |

**Confidence:** ___%  
**Cross-Ref Accuracy:** ___%

### **Issues Found**
1. _______________
2. _______________

### **Overall Result**
⬜ PASS ⬜ FAIL

---

## 🎯 Success Criteria

**Must Pass:**
- ✅ All phases complete without errors
- ✅ Cross-references 100% accurate
- ✅ Page numbering continuous
- ✅ ML prediction errors within range
- ✅ Project info persists correctly
- ✅ PDFs generate successfully

**Performance:**
- ✅ Total test time < 60 minutes
- ✅ No crashes or freezes
- ✅ Console shows no errors

---

## 🐛 Common Issues & Solutions

### **Issue 1: Prediction Confidence Low (<70%)**
**Solution:** Check data quality, verify feature extraction

### **Issue 2: Cross-References Broken**
**Solution:** Verify lookup tables created, check page allocation

### **Issue 3: Auto-Population Fails**
**Solution:** Check database migration 027, verify project setup save

### **Issue 4: ML Data Not Logged**
**Solution:** Check localStorage, verify comprehensive doc generation

---

## 📈 Tracking ML Accuracy

After each test, record:
```
Test #: ___
Date: ___
Scenario: ___
Predicted: Coord [X], Calc [Y], Areas [Z]
Actual: Coord [X'], Calc [Y'], Areas [Z']
Error: [Total]
Confidence: [%]
```

**Target:** After 10 tests, average error < 1.5 pages

---

**Status:** ✅ Ready for Testing  
**Version:** 2.0 (AI/ML Enhanced)
