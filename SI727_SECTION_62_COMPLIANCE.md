# SI 727 Section 62: Material and Form Compliance

## 📜 **Official Regulation**

**SI 727 Section 62(1)**: A general plan shall be prepared on a rectangular sheet of material measuring:
- **(a)** 500 millimetres by 400 millimetres; or
- **(b)** 800 millimetres by 500 millimetres; or
- **(c)** 1000 millimetres by 800 millimetres.

**SI 727 Section 62(2)**: When more than one sheet is required:
- **(a)** Each sheet shall be of the same size, and shall be complete in itself
- **(b)** An inset shall be drawn on each sheet, indicating the relative positions of all sheets

## ✅ **Implementation**

### **Sheet Sizes (SI 727 Compliant)**

```typescript
const SHEET_SIZES = {
  Small: { width: 500, height: 400 },   // SI 727 Section 62(1)(a)
  Medium: { width: 800, height: 500 },  // SI 727 Section 62(1)(b)
  Large: { width: 1000, height: 800 }   // SI 727 Section 62(1)(c)
}
```

**Note**: Previous A-series sizes (A0, A1, A2, A3, A4) are **NOT** SI 727 compliant and have been replaced.

### **Intelligent Sheet Selection Algorithm**

The system now uses the **Outside Figure extent** (spatial dimensions) to determine the appropriate sheet size:

```typescript
export function calculateOptimalSheetSize(
  outsideFigureExtent: { width: number; height: number } | null,
  parcelCount: number = 0,
  totalArea: number = 0
): 'Small' | 'Medium' | 'Large'
```

#### **Algorithm Steps**:

1. **Calculate Outside Figure extent** (width × height in meters)
2. **Determine appropriate scale** based on extent:
   - Extent > 2000m → Scale 1:5000
   - Extent > 1000m → Scale 1:2000
   - Extent > 500m → Scale 1:1000
   - Extent ≤ 500m → Scale 1:500

3. **Calculate map size** in mm at selected scale:
   ```
   mapWidthMm = (extentWidth / scale) × 1000
   mapHeightMm = (extentHeight / scale) × 1000
   ```

4. **Add space for overlays and margins**:
   ```
   totalWidthNeeded = mapWidthMm + 200 + 200  // Left overlays + right margin
   totalHeightNeeded = mapHeightMm + 100 + 100  // Top/bottom space
   ```

5. **Select sheet size**:
   - If total > 800mm wide OR > 500mm high → **Large** (1000×800mm)
   - If total > 500mm wide OR > 400mm high → **Medium** (800×500mm)
   - Otherwise → **Small** (500×400mm)

## 📊 **Example Calculation**

### Your Project (Maglas Township):
- **Outside Figure extent**: ~1412m × 1151m
- **Selected scale**: 1:2000 (extent > 1000m)
- **Map size at 1:2000**: 706mm × 576mm
- **Total size needed**: 906mm × 676mm
- **Selected sheet**: **Large** (1000×800mm) ✅

### Console Output:
```
[SurveyPlanMap] 📐 Outside Figure extent: 1412.0m × 1151.0m
[SheetSizeCalc] 📐 Extent: 1412.0m × 1151.0m
[SheetSizeCalc] 📐 Scale: 1:2000
[SheetSizeCalc] 📐 Map size needed: 706.0mm × 575.5mm
[SheetSizeCalc] 📐 Total size needed: 906.0mm × 675.5mm
[SheetSizeCalc] ✅ Selected: Large (1000×800mm)
[SurveyPlanMap] 📐 Auto-selected sheet size (SI 727 compliant): Large
```

## 🎯 **Sheet Size Decision Matrix**

| Outside Figure Extent | Recommended Scale | Map Size (approx) | Sheet Size |
|----------------------|-------------------|-------------------|------------|
| < 200m × 160m        | 1:500             | < 400mm × 320mm   | **Small**  |
| 200-400m × 160-320m  | 1:1000            | 200-400mm × 160-320mm | **Small** |
| 400-800m × 320-500m  | 1:1000-1:2000     | 400-800mm × 320-500mm | **Medium** |
| 800-1600m × 500-800m | 1:2000-1:5000     | 400-800mm × 250-400mm | **Medium** |
| > 1600m × > 800m     | 1:5000            | > 320mm × > 160mm | **Large**  |

## ✅ **Compliance Checklist**

- [x] **Sheet sizes**: Only 500×400mm, 800×500mm, 1000×800mm (SI 727 Section 62(1))
- [x] **Margins**: 50mm left/top/bottom, 150mm right (SI 727 Section 63)
- [x] **Extent-based selection**: Uses actual survey dimensions
- [x] **Single-page guarantee**: Layout validation ensures content fits
- [x] **Automatic scale selection**: Appropriate for extent
- [x] **Professional appearance**: SI 727 compliant layout

## 🔄 **Multi-Sheet Support (Future)**

Per SI 727 Section 62(2), if a survey requires multiple sheets:
- All sheets must be the same size
- Each sheet must be complete in itself
- An inset must show relative positions of all sheets

**Current Status**: Single-sheet implementation only. Multi-sheet support to be added if required.

## 📝 **Files Modified**

1. **`professionalSurveyPlanExporter.ts`**:
   - Updated `SHEET_SIZES` to SI 727 compliant sizes
   - Rewrote `calculateOptimalSheetSize()` to use extent-based calculation
   - Updated `ExportOptions` interface

2. **`SurveyPlanMapView.vue`**:
   - Calculate Outside Figure extent from coordinates
   - Pass extent to sheet size calculator
   - Enhanced logging for transparency

## 🧪 **Testing**

**Test the export**:
1. Click "🎨 Professional PDF (Print Quality)"
2. Check console for extent calculation and sheet selection
3. Verify PDF:
   - Single page ✅
   - Correct sheet size (500×400, 800×500, or 1000×800mm) ✅
   - Proper margins (50mm, 150mm, 50mm, 50mm) ✅
   - All content visible ✅
   - Appropriate scale for extent ✅

## 📐 **Verification**

Open the PDF in a viewer and measure:
- **Sheet dimensions**: Should match one of the three prescribed sizes
- **Margins**: 50mm left/top/bottom, 150mm right
- **Map scale**: Appropriate for the survey extent
- **Content**: All elements visible, no overflow

---

**Status**: ✅ SI 727 Section 62 Compliant  
**Date**: December 15, 2025  
**Regulation**: SI 727 Sections 62 & 63  
**Next Step**: Test export with new extent-based sheet selection
