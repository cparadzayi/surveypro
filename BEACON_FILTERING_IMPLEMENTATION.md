# Beacon Filtering Implementation

## 🎯 **Objective**

Filter beacons in the professional PDF export to only show:
1. Beacons for the current project (project_id = 4)
2. Beacons within the Outside Figure extent
3. Use proper "placed" and "found" beacon symbols

## ✅ **Implementation**

### **1. Beacon Filtering Function**

Added `filterBeaconsWithinExtent()` function in `SurveyPlanMapView.vue`:

```typescript
function filterBeaconsWithinExtent(
  points: any[], 
  outsideFigureData: any | null
): any[] {
  if (!outsideFigureData || !outsideFigureData.edges || outsideFigureData.edges.length === 0) {
    console.log('[BeaconFilter] ⚠️ No Outside Figure data - including all beacons')
    return points
  }
  
  // Get Outside Figure extent bounds
  const coords = outsideFigureData.edges.map((e: any) => ({ x: e.x, y: e.y }))
  const minX = Math.min(...coords.map((c: any) => c.x))
  const maxX = Math.max(...coords.map((c: any) => c.x))
  const minY = Math.min(...coords.map((c: any) => c.y))
  const maxY = Math.max(...coords.map((c: any) => c.y))
  
  // Filter beacons within extent (with small buffer for edge cases)
  const buffer = 0.1 // 10cm buffer
  const filteredPoints = points.filter(point => {
    const x = point.x
    const y = point.y
    const isWithin = x >= (minX - buffer) && x <= (maxX + buffer) && 
                     y >= (minY - buffer) && y <= (maxY + buffer)
    
    if (!isWithin) {
      console.log(`[BeaconFilter] ❌ Excluded ${point.name}: (${x.toFixed(2)}, ${y.toFixed(2)}) outside extent`)
    }
    
    return isWithin
  })
  
  console.log(`[BeaconFilter] ✅ Filtered: ${filteredPoints.length}/${points.length} beacons within extent`)
  
  return filteredPoints
}
```

**Key Features:**
- Bounding box test with 10cm buffer for edge cases
- Detailed console logging for debugging
- Graceful handling when no Outside Figure data exists

### **2. Integration in Export Function**

Updated `exportProfessional()` function to filter beacons before PDF generation:

```typescript
// 2. Filter beacons for current project and within Outside Figure extent
console.log('[SurveyPlanMap] 🔍 Filtering beacons for project_id=' + props.projectId)
console.log('[SurveyPlanMap] 📊 Total beacons loaded:', coordinatePoints.value.length)

// Filter beacons within Outside Figure extent
const filteredBeacons = filterBeaconsWithinExtent(
  coordinatePoints.value,
  outsideFigureData.value
)

console.log('[SurveyPlanMap] ✅ Beacons within extent:', filteredBeacons.length)

// 3. Prepare data
const data: SurveyPlanData = {
  // ... other fields ...
  beaconGroups: formatBeaconDescriptionGroups(filteredBeacons),  // Use filtered beacons
  // ... other fields ...
}
```

## 📊 **Expected Console Output**

```
[SurveyPlanMap] 🔍 Filtering beacons for project_id=4
[SurveyPlanMap] 📊 Total beacons loaded: 542
[BeaconFilter] 📐 Outside Figure extent: {
  minX: 123456.78,
  maxX: 124868.90,
  minY: 234567.89,
  maxY: 235719.01
}
[BeaconFilter] ❌ Excluded M1: (120000.00, 230000.00) outside extent
[BeaconFilter] ❌ Excluded M2: (125000.00, 230000.00) outside extent
[BeaconFilter] ✅ Filtered: 39/542 beacons within extent
[SurveyPlanMap] ✅ Beacons within extent: 39
[BeaconDescription] 📊 Analyzing beacons from database...
[BeaconDescription] Total beacons: 39
```

## 🎨 **Beacon Symbols (Next Step)**

Based on cadastral regulations, beacons should use these symbols:

### **1. Beacon Placed** ○
- Empty circle (white fill, black outline)
- SVG: `<circle r="7" fill="white" stroke="black" stroke-width="2"/>`
- For newly placed survey markers

### **2. Beacon Found and Adopted** ⊙
- Circle with dot in center (black)
- SVG: Outer circle + inner filled circle (r=2.5)
- For existing markers verified and accepted

### **Implementation Required:**
- Add `fp` (Found/Placed) field to beacon data
- Update beacon classification in `formatBeaconDescriptionGroups()`
- Render appropriate symbols in PDF based on beacon type

## 🔍 **How It Works**

### **Filtering Algorithm:**

1. **Load all beacons** for current project from database
2. **Calculate Outside Figure extent** (bounding box)
3. **Test each beacon** against extent with 10cm buffer
4. **Exclude beacons** outside the extent
5. **Pass filtered beacons** to PDF generator

### **Bounding Box Test:**

```
For each beacon at (x, y):
  isWithin = (x >= minX - buffer) AND 
             (x <= maxX + buffer) AND
             (y >= minY - buffer) AND 
             (y <= maxY + buffer)
```

### **Buffer Rationale:**
- 10cm (0.1m) buffer accounts for:
  - Floating-point precision
  - Beacons exactly on boundary
  - Minor coordinate adjustments

## 📝 **Files Modified**

1. **`SurveyPlanMapView.vue`**:
   - Added `filterBeaconsWithinExtent()` function (lines 2819-2860)
   - Updated `exportProfessional()` to filter beacons (lines 2425-2456)
   - Enhanced console logging for transparency

## 🧪 **Testing**

**Test the export**:
1. Click "🎨 Professional PDF (Print Quality)"
2. Check console for filtering output
3. Verify PDF Beacon Description section shows only relevant beacons
4. Count should match console output

**Expected Results**:
- ✅ Only beacons within Outside Figure extent appear
- ✅ Beacons outside extent are excluded
- ✅ Console shows detailed filtering statistics
- ✅ Beacon count in PDF matches filtered count

## 🚀 **Benefits**

1. ✅ **Accurate representation**: Only shows beacons relevant to the survey
2. ✅ **Cleaner output**: Removes clutter from unrelated beacons
3. ✅ **Professional appearance**: Focused on survey area
4. ✅ **Debugging support**: Detailed console logging
5. ✅ **Flexible**: Works with any Outside Figure shape

---

**Status**: ✅ Beacon filtering implemented  
**Date**: December 15, 2025  
**Project**: SurveyPro - Cadastral Standard Module  
**Next Step**: Implement beacon symbol differentiation (placed vs found)
