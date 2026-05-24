# Cadastral Workflow E2E Test - Quick Checklist

**Version:** 2.0 | **Date:** 2025-01-22

---

## ✅ Pre-Test Setup

- [ ] Backend running on port 3050
- [ ] Frontend running on port 5173
- [ ] Database migrations applied (especially 027)
- [ ] Test CSV files prepared
- [ ] Browser DevTools open (F12)
- [ ] Registered surveyor account ready

---

## 🔄 Workflow Steps

### **Step 1: Project Setup** ⏱️ 3 min
- [ ] Login successful
- [ ] Project created/selected
- [ ] Survey type entered
- [ ] Stand reference entered
- [ ] Township entered
- [ ] Data saved to database
- [ ] Console: "Project setup data saved" ✅

### **Step 2: CSV Import** ⏱️ 5 min
- [ ] CSV file selected
- [ ] Import successful
- [ ] Points displayed in table
- [ ] Map shows all points
- [ ] Console: "Imported X points" ✅

### **Step 3: Field Book** ⏱️ 5 min
- [ ] Field book generated
- [ ] Page numbers E1-E99
- [ ] PDF preview correct
- [ ] Lookup table created
- [ ] Console: "Field Book Generation" ✅

### **Step 4: Calculations** ⏱️ 10 min
- [ ] Duplicates detected
- [ ] **Expert predictor invoked** 🎯
- [ ] **Confidence 70-90%** 🎯
- [ ] PDF generated
- [ ] Cross-references correct
- [ ] Console: "Using Expert Page Predictor" ✅
- [ ] Console: "Prediction: coordinateList X pages" ✅

### **Step 5: Coordinate List** ⏱️ 10 min
- [ ] Coordinate list generated
- [ ] Starts at page 100
- [ ] **5 cross-references tested** 🎯
- [ ] **All references correct** 🎯
- [ ] F/B pages match field book
- [ ] Calc pages match calculations
- [ ] Console: "Coordinate List Generation" ✅

### **Step 6: Area Computation** ⏱️ 10 min
- [ ] All parcels digitized
- [ ] Areas calculated
- [ ] Closure errors < 0.5m
- [ ] PDF generated
- [ ] Console: "Parcel Digitized" ✅

### **Step 7: Report on Survey** ⏱️ 5 min
- [ ] **"Survey Of" auto-populated** 🎯
- [ ] **Format correct** 🎯
- [ ] All fields completed
- [ ] PDF generated
- [ ] Console: "Auto-Population" ✅

### **Step 8: DSG Certificate** ⏱️ 3 min
- [ ] **"Survey Of" matches Report** 🎯
- [ ] Surveyor details correct
- [ ] PDF generated
- [ ] Console: "Survey Of from Project Setup" ✅

### **Step 9: Comprehensive Document** ⏱️ 10 min
- [ ] All sections merged
- [ ] **ML training logged** 🎯
- [ ] **Statistics displayed** 🎯
- [ ] Page numbering continuous
- [ ] Cross-references accurate
- [ ] Console: "ML Training Stats" ✅
- [ ] Console: "accuracy: {...}" ✅

### **Step 10: ML Data Validation** ⏱️ 4 min
- [ ] localStorage has training logs
- [ ] Actual results logged
- [ ] Errors calculated
- [ ] **Errors within range** 🎯
- [ ] Data ready for ML training

---

## 🎯 Critical Validations

### **AI/ML Page Numbering**
- [ ] Expert predictor invoked
- [ ] Prediction confidence displayed
- [ ] Breakdown shows adjustments
- [ ] Actual results logged
- [ ] Errors calculated
- [ ] Statistics displayed

**Error Thresholds:**
- Small: ≤ 2 pages ✅
- Medium: ≤ 3 pages ✅
- Large: ≤ 4 pages ✅

### **Cross-References**
- [ ] 5+ points tested
- [ ] 100% accuracy
- [ ] F/B references correct
- [ ] Calc references correct

### **Project Info Persistence**
- [ ] Survey type persists
- [ ] Stand reference persists
- [ ] Township persists
- [ ] Auto-populates in Report
- [ ] Auto-populates in Certificate
- [ ] Consistent across workflow

---

## 📊 Results Summary

**Test Date:** _______________  
**Scenario:** [ ] Small [ ] Medium [ ] Large  
**Duration:** ___ minutes

### **Pass/Fail**
- Setup: ⬜ Pass ⬜ Fail
- CSV Import: ⬜ Pass ⬜ Fail
- Field Book: ⬜ Pass ⬜ Fail
- Calculations: ⬜ Pass ⬜ Fail
- Coordinate List: ⬜ Pass ⬜ Fail
- Area Computation: ⬜ Pass ⬜ Fail
- Report: ⬜ Pass ⬜ Fail
- Certificate: ⬜ Pass ⬜ Fail
- Comprehensive: ⬜ Pass ⬜ Fail
- ML Data: ⬜ Pass ⬜ Fail

### **ML Accuracy**
- Coord List: Predicted ___ | Actual ___ | Error ___
- Calculations: Predicted ___ | Actual ___ | Error ___
- Areas: Predicted ___ | Actual ___ | Error ___
- **Total Error:** ___ pages
- **Confidence:** ___%
- **Cross-Ref Accuracy:** ___%

### **Overall**
⬜ **PASS** ⬜ **FAIL**

---

## 🐛 Issues Found

1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

---

## 📝 Notes

_______________________________________________
_______________________________________________
_______________________________________________

---

**Tester:** _______________  
**Signature:** _______________
