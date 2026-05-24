# SurveyPro Quick Reference Card

## 🚀 Quick Start (5 Minutes)

### 1. Create Surveyor Profile
**Settings → Surveyors → Create New**
- Name, Registration #, Email, Phone

### 2. Create Project
**Modules → Cadastral Standard**
- Project name, Client, Date, District

### 3. Import CSV
**⚠️ SELECT LO ZONE FIRST!**
- Lo 25 (24-26°E) - Western Zimbabwe
- Lo 27 (26-28°E) - Bulawayo, Gweru
- Lo 29 (28-30°E) - Harare, Masvingo
- Lo 31 (30-32°E) - Mutare, Chipinge
- Lo 33 (32-34°E) - Eastern border

### 4. Select Control Points (min 3)
- Use map or list
- Choose points surrounding survey

### 5. Generate Documents
- Field Book → Calculations → Coordinate List → Area Computation → Reports

---

## 📋 CSV Format

```csv
Point,Y,X,Status,Description,Date of survey
P1,97538.004,2247107.872,F,50mm Iron Pipe,15/10/2025
P2,97612.450,2247089.123,P,Wooden Peg,15/10/2025
```

**Required Columns:**
- Point (name)
- Y (Westing in meters)
- X (Southing in meters)
- Status (F=Fixed, P=Peg)
- Description
- Date of survey (DD/MM/YYYY)

---

## 🗺️ Lo Zone Selection Guide

| Survey Area | Lo Zone | Longitude |
|-------------|---------|-----------|
| Hwange, Victoria Falls | Lo 25 | 24-26°E |
| Bulawayo, Gweru, Kwekwe | Lo 27 | 26-28°E |
| Harare, Masvingo, Kadoma | Lo 29 | 28-30°E |
| Mutare, Chipinge, Rusape | Lo 31 | 30-32°E |
| Eastern border areas | Lo 33 | 32-34°E |

**⚠️ CRITICAL:** Wrong Lo zone = Wrong coordinates!

---

## 📊 Workflow Steps

```
1. Project Setup (2 min)
   ↓
2. CSV Import + Lo Zone (5 min)
   ↓
3. Control Point Selection (5 min)
   ↓
4. Field Book (5 min)
   ↓
5. Calculations Part 1 (10 min)
   ↓
6. Coordinate List (3 min)
   ↓
7. Area Computation (10 min)
   ↓
8. Report on Survey (5 min)
   ↓
9. DSG Certificate (2 min)
```

**Total Time:** ~45 minutes

---

## ✅ Document Checklist

- [ ] Electronic Field Book (3 decimals)
- [ ] Calculations Part 1 (Field computations)
- [ ] Coordinate List (2 decimals)
- [ ] Area Computation (With map)
- [ ] Report on Survey
- [ ] DSG Certificate

---

## 🎯 Control Point Tips

**Good Selection:**
- ✅ 3-5 points
- ✅ Surrounding survey area
- ✅ Within 5-10 km
- ✅ Good distribution (N, E, S, W)

**Avoid:**
- ❌ All points in one direction
- ❌ Points too far away (>20 km)
- ❌ Less than 3 points

---

## ⚠️ Common Mistakes

1. **Forgetting to select Lo zone**
   - Import button stays disabled
   - Select Lo zone BEFORE importing

2. **Wrong Lo zone selected**
   - Points appear in wrong location
   - Reset step and re-import with correct Lo zone

3. **CSV format errors**
   - Use provided template
   - Check column headers match exactly

4. **Insufficient control points**
   - Minimum 3 required
   - 4-5 recommended for better accuracy

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| Import disabled | Select Lo zone first |
| Wrong location | Wrong Lo zone - reset & re-import |
| Can't select control points | Ensure CSV imported successfully |
| Large closure error | Check point order & coordinates |
| PDF not generating | Check all required fields filled |

---

## 📞 Support

**Email:** support@surveypro.com  
**Phone:** +263 XX XXX XXXX  
**Help:** Click "?" icon in any module

---

*SurveyPro - Professional Cadastral Survey Software*
