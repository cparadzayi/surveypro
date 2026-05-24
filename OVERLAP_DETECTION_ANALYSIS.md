# 🔍 Overlap Detection Code Analysis - Duplication & Conflict Report

**Analysis Date:** November 23, 2025  
**Status:** ⚠️ Multiple Implementations Found - Consolidation Recommended

---

## 📊 Executive Summary

**Finding:** The codebase has **MULTIPLE overlap detection implementations** across different modules:

1. ✅ **MapLibreAreaView.vue** - Cadastral Standard workflow (ACTIVE)
2. ✅ **useParcelGeometry.ts** - Composable for geometry validation (SHARED)
3. ✅ **landParcel.js** - Backend PostGIS validation (DATABASE LEVEL)
4. ✅ **Areas2View.vue** - Lite module (SEPARATE WORKFLOW)

**Recommendation:** These implementations serve **different purposes** and should be **consolidated** where appropriate.

---

## 🗂️ Detailed Analysis

### **1. MapLibreAreaView.vue (Cadastral Standard)**
**Location:** `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`

**Purpose:** Real-time overlap detection during interactive polygon drawing

**Features:**
- ✅ Loads ALL existing parcels (draft + finalized + approved)
- ✅ Client-side geometric overlap detection
- ✅ 4-stage algorithm (edge intersection, containment, interior points, centroid)
- ✅ Self-intersection prevention
- ✅ Duplicate designation check
- ✅ Visual feedback (red highlighting)

**Code Snippet:**
```typescript
// Lines 1660-1701
function completePolygon() {
  // Check duplicate designation
  const duplicateParcel = parcels.value.find(p => 
    p.designation.toLowerCase() === designation.trim().toLowerCase()
  );
  
  // Check spatial overlap
  const currentData = (parcelsSource as any)._data;
  const features = currentData?.features || [];
  
  for (const f of features) {
    if (polygonsOverlap(newCoords, ring)) {
      conflictingFeature = f;
      break;
    }
  }
  
  if (conflictingFeature) {
    overlapMessage.value = `New parcel overlaps existing parcel`;
    return; // REJECT
  }
}

// Lines 2077-2157
function polygonsOverlap(a: Coord[], b: Coord[]): boolean {
  // 1. Edge intersection check
  // 2. Containment check
  // 3. Interior point sampling
  // 4. Centroid verification
}
```

**Strengths:**
- ✅ Real-time validation
- ✅ Immediate user feedback
- ✅ No server round-trip
- ✅ Visual highlighting

**Weaknesses:**
- ⚠️ Client-side only (can be bypassed)
- ⚠️ Custom algorithm (not using standard libraries)
- ⚠️ No integration with backend validation

---

### **2. useParcelGeometry.ts (Shared Composable)**
**Location:** `app-frontend/src/composables/useParcelGeometry.ts`

**Purpose:** Reusable polygon validation and geometry utilities

**Features:**
- ✅ Self-intersection detection (`checkSelfIntersections`)
- ✅ Duplicate point removal
- ✅ Spike detection (acute angles < 10°)
- ✅ Polygon closure validation
- ✅ Area calculation (Shoelace formula)
- ✅ Shape quality metrics (compactness, elongation)

**Code Snippet:**
```typescript
// Lines 290-309
function checkSelfIntersections(coordinates): number {
  let count = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j < n - 1; j++) {
      if (doSegmentsIntersect(
        coordinates[i], coordinates[i + 1],
        coordinates[j], coordinates[j + 1]
      )) {
        count++;
      }
    }
  }
  return count;
}

// Lines 314-325
function doSegmentsIntersect(p1, p2, p3, p4): boolean {
  const ccw = (A, B, C) => {
    return (C.x - A.x) * (B.y - A.y) > (B.x - A.x) * (C.y - A.y);
  };
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && 
         ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}
```

**Strengths:**
- ✅ Reusable across modules
- ✅ Comprehensive validation
- ✅ Well-documented
- ✅ QGIS-style quality checks

**Weaknesses:**
- ⚠️ **NOT USED in MapLibreAreaView** (duplication!)
- ⚠️ No overlap detection with existing parcels
- ⚠️ Only validates individual polygon quality

---

### **3. landParcel.js (Backend PostGIS)**
**Location:** `app-backend/src/models/landParcel.js`

**Purpose:** Database-level spatial validation using PostGIS

**Features:**
- ✅ **PostGIS ST_Intersects** for accurate overlap detection
- ✅ Overlap percentage calculation
- ✅ Severity classification (critical/high/medium/low)
- ✅ Similar stand name detection (normalized comparison)
- ✅ Exact geometry duplicate detection (ST_Equals)
- ✅ Handles updates (excludeId parameter)

**Code Snippet:**
```javascript
// Lines 151-300
async checkDuplicates(projectId, stand, geom, excludeId = null) {
  // 1. Check similar stand names (normalized)
  const normalizedStand = normalizeStand(stand);
  
  // 2. Check spatial overlaps using PostGIS
  const overlapQuery = `
    SELECT 
      lp.id, lp.stand,
      ST_Area(ST_Intersection(lp.geom, ng.geom)) as overlap_area_m2,
      ROUND((ST_Area(ST_Intersection(lp.geom, ng.geom)) / 
             NULLIF(ST_Area(lp.geom), 0) * 100)::numeric, 2) as overlap_percent
    FROM land_parcels lp, new_geom ng
    WHERE lp.project_id = $1
      AND ST_Intersects(lp.geom, ng.geom)
      AND NOT ST_Touches(lp.geom, ng.geom)
  `;
  
  // 3. Check exact geometry duplicates
  const exactQuery = `
    SELECT id, stand
    FROM land_parcels lp, new_geom ng
    WHERE ST_Equals(lp.geom, ng.geom)
  `;
  
  return {
    hasDuplicates: duplicates.length > 0,
    duplicates: duplicates,
    summary: { critical, high, medium, low }
  };
}
```

**Strengths:**
- ✅ **Most accurate** (uses PostGIS spatial functions)
- ✅ Database-level enforcement
- ✅ Cannot be bypassed
- ✅ Handles edge cases (touching vs overlapping)
- ✅ Percentage-based severity

**Weaknesses:**
- ⚠️ **NOT INTEGRATED with MapLibreAreaView**
- ⚠️ Requires server round-trip
- ⚠️ No real-time feedback during drawing

---

### **4. Areas2View.vue (Lite Module)**
**Location:** `app-frontend/src/views/modules/lite/areas2/Areas2View.vue`

**Purpose:** Parcel digitization in Lite workflow

**Features:**
- ✅ Calls backend `checkDuplicates` API
- ✅ Displays severity-based warnings
- ✅ Prevents saving critical/high conflicts

**Code Snippet:**
```typescript
// Lines 1075-1107
if (critical.length > 0) {
  warningMessage += `🚫 CRITICAL ISSUES (${critical.length}):\n`;
  critical.forEach((d, i) => {
    warningMessage += `  ${i + 1}. ${d.message}\n`;
    if (d.overlap_percent) {
      warningMessage += `     • Overlap: ${d.overlap_percent.toFixed(1)}%\n`;
    }
  });
}

if (critical.length > 0 || high.length > 0) {
  warningMessage += `\n❌ Cannot save: Critical or high-priority conflicts detected.\n`;
  warningMessage += `• Adjust polygon boundaries to avoid overlaps\n`;
  alert(warningMessage);
  return; // BLOCK SAVE
}
```

**Strengths:**
- ✅ Uses backend validation (most accurate)
- ✅ Clear user feedback
- ✅ Severity-based blocking

**Weaknesses:**
- ⚠️ Only validates on save (not real-time)
- ⚠️ Different workflow from Cadastral Standard

---

## ⚠️ Conflicts & Duplication Issues

### **Issue 1: MapLibreAreaView NOT Using Backend Validation**
**Problem:** MapLibreAreaView has its own client-side overlap detection but doesn't call the backend `checkDuplicates` API.

**Risk:**
- Client-side validation can be bypassed
- Less accurate than PostGIS spatial functions
- Inconsistent with Areas2View behavior

**Recommendation:** Integrate backend validation as final check before saving.

---

### **Issue 2: useParcelGeometry NOT Used in MapLibreAreaView**
**Problem:** MapLibreAreaView reimplements self-intersection detection instead of using the composable.

**Evidence:**
- `useParcelGeometry.ts` has `checkSelfIntersections` (lines 290-309)
- `MapLibreAreaView.vue` has `wouldCreateIntersection` (lines 1564-1580)
- **Both do the same thing!**

**Recommendation:** Refactor MapLibreAreaView to use `useParcelGeometry` composable.

---

### **Issue 3: Different Algorithms for Same Task**
**Problem:** Three different overlap detection algorithms:

1. **MapLibreAreaView:** Custom 4-stage algorithm
2. **useParcelGeometry:** Line segment intersection (CCW test)
3. **Backend:** PostGIS ST_Intersects

**Risk:** Inconsistent results, maintenance burden

**Recommendation:** Standardize on PostGIS for final validation, use composable for client-side preview.

---

### **Issue 4: No Integration Between Modules**
**Problem:** Cadastral Standard and Lite modules have completely separate validation logic.

**Impact:**
- Code duplication
- Inconsistent user experience
- Harder to maintain

**Recommendation:** Create unified validation service used by both modules.

---

## 🎯 Recommended Architecture

### **Proposed Solution: Layered Validation**

```
┌─────────────────────────────────────────┐
│  Frontend (Real-time Preview)           │
│  - useParcelGeometry composable         │
│  - Self-intersection check              │
│  - Basic shape validation               │
│  - Immediate user feedback              │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Frontend (Pre-save Check)              │
│  - Call backend checkDuplicates API     │
│  - Get accurate overlap percentages     │
│  - Display severity-based warnings      │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  Backend (Database Enforcement)         │
│  - PostGIS spatial validation           │
│  - Database triggers (optional)         │
│  - Final authority on conflicts         │
└─────────────────────────────────────────┘
```

---

## 📝 Action Items

### **Priority 1: Integrate Backend Validation**
**File:** `MapLibreAreaView.vue`

**Change:**
```typescript
async function autoSaveParcel(parcel: Parcel, closureError: number) {
  // BEFORE SAVING: Call backend validation
  const validation = await checkDuplicatesAPI(
    workflowState.projectInfo.projectId,
    parcel.designation,
    geometry
  );
  
  if (validation.hasDuplicates) {
    const critical = validation.duplicates.filter(d => 
      d.severity === 'critical' || d.severity === 'high'
    );
    
    if (critical.length > 0) {
      // Show detailed error with overlap percentages
      overlapMessage.value = formatDuplicateMessage(validation);
      return; // BLOCK SAVE
    }
  }
  
  // Proceed with save...
}
```

---

### **Priority 2: Use Composable for Self-Intersection**
**File:** `MapLibreAreaView.vue`

**Change:**
```typescript
import { useParcelGeometry } from '@/composables/useParcelGeometry';

const { checkSelfIntersections } = useParcelGeometry();

// REPLACE wouldCreateIntersection with composable
function wouldCreateIntersection(newPoint: any): boolean {
  const coords = [...selectedPoints.value, newPoint];
  const intersections = checkSelfIntersections(coords);
  return intersections > 0;
}
```

---

### **Priority 3: Create Unified Validation Service**
**New File:** `app-frontend/src/services/parcelValidation.ts`

```typescript
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export async function validateParcel(
  projectId: number,
  designation: string,
  geometry: GeoJSON.Polygon
): Promise<ValidationResult> {
  // 1. Client-side checks (fast)
  const geometryValidation = useParcelGeometry().generatePolygon(...);
  
  // 2. Backend checks (accurate)
  const duplicateCheck = await checkDuplicatesAPI(...);
  
  // 3. Combine results
  return {
    isValid: geometryValidation.isValid && !duplicateCheck.hasDuplicates,
    errors: [...geometryValidation.errors, ...duplicateCheck.errors],
    warnings: [...geometryValidation.warnings, ...duplicateCheck.warnings]
  };
}
```

---

### **Priority 4: Update Areas2View to Use Service**
**File:** `Areas2View.vue`

**Change:**
```typescript
import { validateParcel } from '@/services/parcelValidation';

// REPLACE direct API call with service
const validation = await validateParcel(projectId, stand, geometry);
```

---

## 🏁 Summary

### **Current State:**
- ❌ **4 separate implementations** of overlap detection
- ❌ **MapLibreAreaView** doesn't use backend validation
- ❌ **useParcelGeometry** composable not used where it should be
- ❌ **Inconsistent** validation across modules

### **Recommended State:**
- ✅ **Unified validation service** used by all modules
- ✅ **Layered approach:** Client preview + Backend enforcement
- ✅ **Reuse composables** to eliminate duplication
- ✅ **Consistent UX** across Cadastral Standard and Lite

### **Benefits:**
- 🎯 **More accurate** validation (PostGIS)
- 🎯 **Consistent** behavior across modules
- 🎯 **Easier maintenance** (single source of truth)
- 🎯 **Better security** (backend enforcement)

---

**Next Steps:**
1. Review this analysis with team
2. Prioritize action items
3. Create refactoring tickets
4. Implement changes incrementally
5. Add integration tests

---

**Analyzed by:** Cascade AI  
**Date:** November 23, 2025  
**Status:** ⚠️ Action Required - Consolidation Recommended
