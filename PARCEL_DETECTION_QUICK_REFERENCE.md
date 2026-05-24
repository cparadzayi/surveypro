# 🎯 Parcel Detection - Quick Reference

## 🚀 **Quick Start**

1. **Import coordinates** → Cadastral Standard workflow
2. **Navigate to Area Computation** (Step 5)
3. **Click "🤖 AI Detect Parcels"**
4. **Review detected parcels** on map
5. **Accept or manually adjust**

---

## 📋 **Supported Point Naming Conventions**

### **Standard Formats** ✅
```
1441A, 1442B, 1443C          → STAND 1441, 1442, 1443
STAND 1444, STAND 1445       → STAND 1444, 1445
S1446, ST1447A               → STAND 1446, 1447
```

### **Alternative Formats** ✅
```
ERF 1448, ERF-1449           → STAND 1448, 1449
PLOT 1450, LOT 1451          → STAND 1450, 1451
1452-A, 1453_B, 1454.C       → STAND 1452, 1453, 1454
1455-CORNER, 1456_NE         → STAND 1455, 1456
```

### **Road Reserves** ✅
```
RR, RR1, RR2                 → ROAD-RESERVE-01
R.R, R.R.1                   → ROAD-RESERVE-02
ROADRESERVE, ROAD            → ROAD-RESERVE-03
SERVITUDE, S.R               → ROAD-RESERVE-04
```

---

## 🎯 **Detection Strategies**

### **1. Topology (70-80%)**
Groups points by stand number from point IDs

### **2. Adjacency (15-20%)**
Finds points from ±4 adjacent stands (1437-1445 for STAND 1441)

### **3. Road Reserves (2-5%)**
Detects linear features (roads, servitudes)

### **4. Spatial Fallback (3-7%)**
Clusters remaining ungrouped points

---

## 📊 **Expected Results**

| Dataset Size | Detection Rate | Time |
|--------------|----------------|------|
| 100 points | 95-98% | <15ms |
| 300 points | 90-97% | <40ms |
| 500 points | 85-95% | <80ms |
| 1000 points | 80-92% | <150ms |

---

## 🔍 **Console Output Guide**

### **Good Detection**
```
[Topology] 🎯 Detection rate: 95.0%
[ParcelDetector] ✅ Detected 152 valid parcels
```
✅ **Action:** Review and accept

### **Medium Detection**
```
[Topology] 🎯 Detection rate: 75.0%
[ParcelDetector] ✅ Detected 120 valid parcels
```
⚠️ **Action:** Check naming conventions, manually digitize remaining

### **Low Detection**
```
[Topology] 🎯 Detection rate: 45.0%
[ParcelDetector] ✅ Detected 72 valid parcels
```
❌ **Action:** Verify point naming, check for non-standard formats

---

## 🛠️ **Troubleshooting**

### **Low Detection Rate (<80%)**

**Possible Causes:**
1. Non-standard point naming
2. Missing stand numbers in point IDs
3. Incomplete survey data (only 1-2 corners per stand)

**Solutions:**
1. Rename points to standard format (1441A, 1442B, etc.)
2. Add stand numbers to point IDs
3. Manually digitize remaining parcels

### **False Positives**

**Symptoms:** Parcels with wrong boundaries

**Causes:**
1. Points from different stands too close together
2. Incorrect stand number extraction

**Solutions:**
1. Review detected parcels on map
2. Delete incorrect parcels
3. Manually redraw

### **Road Reserves Not Detected**

**Check:**
1. Point IDs contain "RR", "ROAD", "RESERVE", etc.
2. Points are within 100m of each other
3. At least 2 points per road reserve

---

## 📈 **Confidence Scores**

| Score | Meaning | Action |
|-------|---------|--------|
| **90-100%** | High confidence | Auto-accept ✅ |
| **70-89%** | Medium confidence | Review 👀 |
| **50-69%** | Low confidence | Manual check ⚠️ |
| **<50%** | Very low | Rejected ❌ |

## 🚫 **Automatic Filters**

| Filter | Threshold | Reason |
|--------|-----------|--------|
| **Minimum Area** | 100 m² | Discard measurement errors/incomplete data |
| **Maximum Area** | 1,000,000 m² | Flag unrealistic parcels |
| **Minimum Points** | 3 | Need polygon (not line) |
| **Confidence** | 50% | Quality threshold |

---

## 🎨 **Map Legend**

| Color | Meaning |
|-------|---------|
| 🟢 Green | High confidence (≥90%) |
| 🟡 Amber | Medium confidence (70-89%) |
| 🔴 Red | Low confidence (50-69%) |
| ⚪ Gray | Not detected (manual) |

---

## ⚡ **Performance Tips**

1. **Use standard naming** - 1441A, 1442B format
2. **Include stand numbers** - In point IDs or descriptions
3. **Complete surveys** - All 3-4 corners per parcel
4. **Consistent spacing** - Similar parcel sizes
5. **Clear road reserves** - Use RR, ROAD, etc.

---

## 📞 **Quick Help**

**Detection too low?**
→ Check point naming conventions

**False positives?**
→ Review and delete incorrect parcels

**Road reserves missing?**
→ Verify point IDs contain "RR", "ROAD", etc.

**Performance slow?**
→ Reduce dataset size or optimize point naming

---

## 🎓 **Best Practices**

1. ✅ **Name points consistently** (1441A, 1442B, 1443C)
2. ✅ **Include all corners** (minimum 3 per parcel)
3. ✅ **Label road reserves** (RR1, RR2, etc.)
4. ✅ **Review detections** before accepting
5. ✅ **Manually adjust** if needed

---

## 📊 **Typical Workflow**

```
1. Import 300 points
   ↓
2. AI detects 152 parcels (95%)
   ↓
3. Review on map (2 minutes)
   ↓
4. Accept 150 parcels
   ↓
5. Manually digitize 2 remaining (1 minute)
   ↓
6. Total: 152 parcels in 3 minutes
   (vs 30 minutes manual digitizing)
```

**Time Saved:** 90% ⚡

---

## ✅ **Success Criteria**

- Detection rate ≥ 90%
- Confidence scores ≥ 70%
- False positives < 5%
- Processing time < 100ms
- User review time < 5 minutes

---

**Version:** 1.0  
**Last Updated:** November 2025  
**Status:** Production Ready ✅
