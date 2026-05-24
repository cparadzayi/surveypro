# PDF Export Improvements - Single Page Layout

## 🎯 **Problem Solved**

**Issue**: Professional PDF export was overflowing to 2 pages when the Outside Figure had many edges (39 in this case).

**Root Cause**: A3 sheet size (420×297mm) was too small to accommodate:
- Title block
- Schedule of Areas (5 parcels)
- Outside Figure Data (39 edges = ~195mm table height)
- Beacon Description (3 groups)
- Survey Statement
- Map area

**Evidence from Console**:
```
[ProfessionalExporter] 📐 Layout validation:
  - Total height needed: 222.4mm
  - Working area height: 197.0mm (A3)
  - Fits on single page: ⚠️ NO
  - Map area: 55.0mm × 112.0mm
⚠️ WARNING: Content may overflow to second page!
```

## ✅ **Solution Implemented**

### 1. **Intelligent Sheet Size Selection**
Updated `calculateOptimalSheetSize()` to consider Outside Figure complexity:

```typescript
export function calculateOptimalSheetSize(
  parcelCount: number, 
  totalArea: number,
  outsideFigureEdges: number = 0  // NEW PARAMETER
): 'A0' | 'A1' | 'A2' | 'A3' | 'A4' {
  // Large outside figure (>30 edges) requires at least A2
  if (outsideFigureEdges > 30) {
    if (parcelCount > 50 || totalArea > 500000) return 'A0'
    if (parcelCount > 20 || totalArea > 100000) return 'A1'
    return 'A2'  // Minimum A2 for large outside figure
  }
  
  // Medium outside figure (>15 edges) requires at least A3
  if (outsideFigureEdges > 15) {
    if (parcelCount > 50 || totalArea > 500000) return 'A1'
    if (parcelCount > 20 || totalArea > 100000) return 'A2'
    return 'A3'  // Minimum A3 for medium outside figure
  }
  
  // Standard calculation for small/no outside figure
  if (parcelCount > 100 || totalArea > 1000000) return 'A0'
  if (parcelCount > 50 || totalArea > 500000) return 'A1'
  if (parcelCount > 20 || totalArea > 100000) return 'A2'
  if (parcelCount > 10 || totalArea > 50000) return 'A3'
  return 'A4'
}
```

### 2. **Layout Validation System**
Added automatic validation to detect overflow:

```typescript
// Validate layout fits within working area (single-page guarantee)
const totalHeight = titleBlock.height + SPACING + 
                    Math.max(scheduleHeight + outsideFigureHeight, mapArea.height) + 
                    SPACING + beaconHeight

const fitsOnPage = totalHeight <= workingArea.height

console.log('[ProfessionalExporter] 📐 Layout validation:')
console.log(`  - Total height needed: ${totalHeight.toFixed(1)}mm`)
console.log(`  - Working area height: ${workingArea.height.toFixed(1)}mm`)
console.log(`  - Fits on single page: ${fitsOnPage ? '✅ YES' : '⚠️ NO'}`)
```

### 3. **Percentage-Based Constraints**
Ensured elements don't exceed their allocated space:

- **Schedule of Areas**: Max 30% of working area height
- **Outside Figure Data**: Max 40% of working area height  
- **Beacon Description**: Max 15% of working area height
- **Map Area**: Fills remaining space dynamically

## 📊 **Expected Results**

For your project (5 parcels, 39 outside figure edges):

### Before (A3):
- Working area: 220mm × 197mm
- Total height needed: 222.4mm
- **Result**: ⚠️ Overflow to 2 pages

### After (A2):
- Working area: 394mm × 320mm
- Total height needed: ~280mm (estimated)
- **Result**: ✅ Fits on single page

## 🔍 **Sheet Size Decision Matrix**

| Outside Figure Edges | Parcels | Min Sheet Size |
|---------------------|---------|----------------|
| 0-15                | <10     | A4             |
| 0-15                | 10-20   | A3             |
| 0-15                | 20-50   | A2             |
| 0-15                | >50     | A1             |
| 16-30               | <20     | A3             |
| 16-30               | 20-50   | A2             |
| 16-30               | >50     | A1             |
| **>30 (your case)** | **<20** | **A2** ✅      |
| >30                 | 20-50   | A1             |
| >30                 | >50     | A0             |

## ✅ **SI 727 Margin Compliance**

All margins remain compliant:
- **Left**: 50mm ✅
- **Right**: 150mm (for endorsements) ✅
- **Top**: 50mm ✅
- **Bottom**: 50mm ✅

## 🧪 **Testing Instructions**

1. **Click** "🎨 Professional PDF (Print Quality)" button again
2. **Check console** for new output:
   ```
   [SurveyPlanMap] 📐 Auto-selected sheet size: A2
   [SurveyPlanMap] 📐 Factors: parcels=5, area=90174.9m², outsideFigureEdges=39
   [ProfessionalExporter] 📐 Sheet: A2 594×420mm
   [ProfessionalExporter] 📐 Layout validation:
     - Total height needed: ~280mm
     - Working area height: 320.0mm
     - Fits on single page: ✅ YES
     - Map area: ~180mm × 220mm
   ```
3. **Verify PDF**:
   - Single page ✅
   - All content visible ✅
   - Proper margins ✅
   - No overlapping elements ✅

## 📝 **Files Modified**

1. **`professionalSurveyPlanExporter.ts`**:
   - Updated `calculateOptimalSheetSize()` signature
   - Added outside figure edge count parameter
   - Implemented intelligent sheet size selection
   - Added layout validation logging

2. **`SurveyPlanMapView.vue`**:
   - Pass outside figure edge count to sheet size calculator
   - Added detailed logging for sheet size selection factors

## 🎨 **Benefits**

1. ✅ **Automatic**: No manual sheet size selection needed
2. ✅ **Intelligent**: Considers all content complexity factors
3. ✅ **Validated**: Warns if content might overflow
4. ✅ **SI 727 Compliant**: Maintains proper margins
5. ✅ **Single Page**: Guaranteed for appropriate sheet sizes
6. ✅ **Professional**: Optimizes map area for maximum clarity

---

**Status**: ✅ Ready for testing  
**Date**: December 15, 2025  
**Next Step**: Test export with updated sheet size selection
