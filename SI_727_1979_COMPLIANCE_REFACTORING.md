# SI 727/1979 Compliance Refactoring

**Critical Correction:** System must comply with **SI 727/1979** (Land Survey (General) Regulations, 1979)

---

## ⚠️ CRITICAL CHANGES REQUIRED

### **1. Tolerance Values (INCORRECT IN CURRENT DESIGN)**

**SI 727/1979 Regulation 13(3) - Actual Requirements:**

```
For cadastral surveys, closing error shall not exceed:
(a) Urban areas:      1 in 5,000  ✅ CORRECT in design
(b) Rural areas:      1 in 3,000  ❌ WRONG (design says 1:2,500)
(c) Peri-urban areas: 1 in 4,000  ❌ MISSING from design
```

**Required Code Changes:**

```typescript
// BEFORE (INCORRECT):
const tolerance = surveyType === 'urban' ? 5000 : 2500;

// AFTER (CORRECT - SI 727/1979):
type SurveyAreaType = 'urban' | 'rural' | 'peri-urban';

function getToleranceRatio(areaType: SurveyAreaType): number {
  switch (areaType) {
    case 'urban':      return 5000;  // SI 727/1979 Reg 13(3)(a)
    case 'rural':      return 3000;  // SI 727/1979 Reg 13(3)(b)
    case 'peri-urban': return 4000;  // SI 727/1979 Reg 13(3)(c)
  }
}
```

---

### **2. Add Peri-Urban Category**

**UI Update Required:**

```vue
<!-- BEFORE (2 options): -->
<div>
  <label>
    <input type="radio" value="urban" v-model="surveyType" />
    Urban (1:5,000)
  </label>
  <label>
    <input type="radio" value="rural" v-model="surveyType" />
    Rural (1:2,500)  ← WRONG TOLERANCE
  </label>
</div>

<!-- AFTER (3 options - SI 727/1979): -->
<div>
  <label>
    <input type="radio" value="urban" v-model="areaType" />
    Urban (1:5,000) - Reg 13(3)(a)
  </label>
  <label>
    <input type="radio" value="peri-urban" v-model="areaType" />
    Peri-Urban (1:4,000) - Reg 13(3)(c)
  </label>
  <label>
    <input type="radio" value="rural" v-model="areaType" />
    Rural (1:3,000) - Reg 13(3)(b)
  </label>
</div>
```

---

### **3. Northernmost Point Tie-Breaker**

**SI 727/1979 Regulation 14(2):**
> "Where two or more beacons have equal northing, the most westerly beacon shall be deemed to be the most northerly."

```typescript
function findNorthernmostPoint(points: Point[]): Point {
  // Find maximum Y (northing)
  const maxY = Math.max(...points.map(p => p.y));
  const northernPoints = points.filter(p => p.y === maxY);
  
  if (northernPoints.length === 1) {
    return northernPoints[0];
  }
  
  // SI 727/1979 Reg 14(2): Most westerly (smallest X)
  return northernPoints.reduce((westerly, point) => 
    point.x < westerly.x ? point : westerly
  );
}
```

---

### **4. Signature Block (Required)**

**SI 727/1979 Regulation 22(1)(i):**
> "Surveyor's signature and stamp"

```typescript
interface ComputationSheet {
  // ... existing fields
  
  // NEW: Required by SI 727/1979 Reg 22(1)
  signatureBlock: {
    certificationStatement: string;
    surveyorSignature?: string; // Base64 or placeholder
    surveyorStamp?: string;     // Base64 or placeholder
    dateOfCertification: Date;
  }
}

const defaultCertification = 
  "I certify that this computation has been carried out in accordance with " +
  "the Land Survey (General) Regulations, 1979 (SI 727/1979) and that the " +
  "area shown is correct to the best of my knowledge and belief.";
```

---

## ✅ COMPLIANT (No Changes Needed)

### **Area Units - SI 727/1979 Reg 12(2)**
```
✅ Square metres for areas < 1 ha
✅ Hectares (4 decimals) for areas ≥ 1 ha
```

### **Coordinate Method - SI 727/1979 Reg 13(1)**
```
✅ Coordinate method (Shoelace = modern approved method)
✅ Double Meridian Distance alternative available
```

### **Consistency Check - SI 727/1979 Reg 13(2)(c)**
```
✅ ΣdY (algebraic sum of Y differences)
✅ ΣdX (algebraic sum of X differences)
✅ Closing error in metres
✅ Ratio of error to perimeter
```

### **Clockwise Direction - SI 727/1979 Reg 14(1)**
```
✅ Beacons numbered clockwise
✅ Starting from northernmost beacon
```

### **Coordinate System - SI 727/1979 Reg 15**
```
✅ Cape System (Lo belts)
✅ Central meridian stated
✅ Y, X to 3 decimal places
```

---

## 📋 Database Schema Updates

```sql
-- Add peri-urban support
ALTER TABLE parcels 
  MODIFY COLUMN tolerance_type VARCHAR(20);
  
-- Update check constraint
ALTER TABLE parcels 
  ADD CONSTRAINT check_area_type 
  CHECK (tolerance_type IN ('urban', 'peri-urban', 'rural'));

-- Update tolerance_value to match SI 727/1979
UPDATE parcels 
SET tolerance_value = 3000 
WHERE tolerance_type = 'rural';
```

---

## 📄 Updated Documentation References

**All documents must reference:**
- ✅ **SI 727/1979** (Land Survey (General) Regulations, 1979)
- ❌ ~~SI 216/1996~~ (INCORRECT)

**Files to Update:**
1. `AREA_COMPUTATION_EXPERT_CONSULTATION.md`
2. `AREA_COMPUTATION_IMPLEMENTATION_PLAN.md`
3. `EXECUTIVE_SUMMARY_AREA_COMPUTATION.md`

---

## 🔧 Implementation Priority

| Priority | Change | Impact | Effort |
|----------|--------|--------|--------|
| **🔴 P1** | Fix rural tolerance: 3000 (not 2500) | HIGH | Low |
| **🔴 P1** | Add peri-urban option (1:4000) | HIGH | Low |
| **🟡 P2** | Tie-breaker for equal northing | MEDIUM | Low |
| **🟡 P2** | Add signature block to PDF | MEDIUM | Medium |
| **🟢 P3** | Update all SI references | LOW | Low |

---

## ✅ Compliance Checklist

- [ ] Update tolerance constants (P1)
- [ ] Add peri-urban radio button (P1)
- [ ] Update validation logic (P1)
- [ ] Implement northernmost tie-breaker (P2)
- [ ] Add signature block to PDF (P2)
- [ ] Update database schema (P1)
- [ ] Update all documentation references (P3)
- [ ] Add SI 727/1979 citation to reports (P3)

---

**Status:** ⚠️ **REQUIRES REFACTORING**  
**Regulatory Authority:** SI 727/1979, not SI 216/1996  
**Critical Fix:** Rural tolerance is 1:3,000, not 1:2,500
