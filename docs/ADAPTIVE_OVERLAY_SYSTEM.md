# Adaptive Overlay System - SI 727 Compliant

## 🎯 Overview

The Survey Plan Map view now features **dynamic, adaptive overlays** that automatically scale based on:
1. **Sheet Size** (Small, Medium, Large)
2. **Map Scale** (1:250 to 1:75000)

All overlays maintain professional proportions and readability across different plan configurations, ensuring SI 727 compliance.

---

## 📐 Adaptive Scaling Algorithm

### **Computed Property: `overlayScaling`**

Located in `SurveyPlanMapView.vue` (lines 582-657)

```typescript
const overlayScaling = computed(() => {
  // Base sizing factors by sheet size
  let sizeFactor = 1.0
  
  if (sheetSize === 'Small') {
    sizeFactor = 0.85  // 85% of base size
  } else if (sheetSize === 'Medium') {
    sizeFactor = 1.0   // 100% base size
  } else if (sheetSize === 'Large') {
    sizeFactor = 1.2   // 120% of base size
  }
  
  // Scale-based adjustments
  let scaleFactor = 1.0
  
  if (scaleValue <= 500) {
    scaleFactor = 1.2  // Larger overlays for detailed plans
  } else if (scaleValue <= 1000) {
    scaleFactor = 1.0  // Standard size
  } else if (scaleValue <= 2500) {
    scaleFactor = 0.9  // Slightly smaller
  } else {
    scaleFactor = 0.8  // Smaller overlays for large-scale plans
  }
  
  const combinedFactor = sizeFactor * scaleFactor
  
  return {
    titleBlock: { fontSize, padding, width, lineHeight },
    northArrow: { size, fontSize, labelSize },
    scaleBar: { width, height, fontSize, titleSize, padding },
    schedule: { fontSize, padding, maxHeight, headerSize },
    factor: combinedFactor,
    sheetSize,
    scale: scaleValue
  }
})
```

---

## 🎨 Overlay Specifications

### **1. Title Block**

**Base Dimensions:**
- Font Size: 12px
- Padding: 12px
- Width: 280px
- Line Height: 1.4

**Adaptive Sizing:**
| Sheet Size | Scale 1:500 | Scale 1:1000 | Scale 1:2500 | Scale 1:5000 |
|------------|-------------|--------------|--------------|--------------|
| **Small**  | 12px (102%) | 10px (85%)   | 9px (77%)    | 8px (68%)    |
| **Medium** | 14px (120%) | 12px (100%)  | 11px (90%)   | 10px (80%)   |
| **Large**  | 17px (144%) | 14px (120%)  | 13px (108%)  | 12px (96%)   |

**Features:**
- Displays: General Plan title, designation, township, district, scale, date
- Shows adaptive info: "Sheet: Medium (100%)"
- Fully draggable
- Professional typography

---

### **2. North Arrow**

**Base Dimensions:**
- Size: 80px × 80px
- Arrow Font Size: 48px
- Label Font Size: 14px

**Adaptive Sizing:**
| Sheet Size | Scale 1:500 | Scale 1:1000 | Scale 1:2500 | Scale 1:5000 |
|------------|-------------|--------------|--------------|--------------|
| **Small**  | 82px        | 68px         | 61px         | 54px         |
| **Medium** | 96px        | 80px         | 72px         | 64px         |
| **Large**  | 115px       | 96px         | 86px         | 77px         |

**Features:**
- Classic ↑ N design
- Scales proportionally
- Maintains aspect ratio
- Always legible

---

### **3. Scale Bar**

**Base Dimensions:**
- Width: 250px
- Height: 12px
- Font Size: 9px
- Title Size: 11px
- Padding: 12px

**Adaptive Sizing:**
| Sheet Size | Scale 1:500 | Scale 1:1000 | Scale 1:2500 | Scale 1:5000 |
|------------|-------------|--------------|--------------|--------------|
| **Small**  | 255px       | 213px        | 191px        | 170px        |
| **Medium** | 300px       | 250px        | 225px        | 200px        |
| **Large**  | 360px       | 300px        | 270px        | 240px        |

**Features:**
- 5 alternating black/white segments
- Distance labels (0, 50m, 100m, etc.)
- Adaptive to map scale
- Professional cartographic design

---

### **4. Schedule of Areas**

**Base Dimensions:**
- Font Size: 11px
- Padding: 10px
- Max Height: 400px
- Header Size: 10px

**Adaptive Sizing:**
| Sheet Size | Scale 1:500 | Scale 1:1000 | Scale 1:2500 | Scale 1:5000 |
|------------|-------------|--------------|--------------|--------------|
| **Small**  | 11px        | 9px          | 8px          | 7px          |
| **Medium** | 13px        | 11px         | 10px         | 9px          |
| **Large**  | 16px        | 13px         | 12px         | 11px         |

**Features:**
- Table with Stand and Area columns
- Auto-calculated totals
- Scrollable for many parcels
- Professional formatting

---

## 🔢 Scaling Factors

### **Sheet Size Factors:**
- **Small (500×400mm):** 0.85 (85%)
- **Medium (800×500mm):** 1.0 (100% - baseline)
- **Large (1000×800mm):** 1.2 (120%)

### **Scale Factors:**
- **1:250 - 1:500:** 1.2 (120% - detailed plans)
- **1:501 - 1:1000:** 1.0 (100% - standard)
- **1:1001 - 1:2500:** 0.9 (90% - slightly smaller)
- **1:2501+:** 0.8 (80% - large-scale plans)

### **Combined Factor:**
```
Combined Factor = Sheet Size Factor × Scale Factor
```

**Examples:**
- Small sheet + 1:500 scale = 0.85 × 1.2 = **1.02 (102%)**
- Medium sheet + 1:1000 scale = 1.0 × 1.0 = **1.0 (100%)**
- Large sheet + 1:5000 scale = 1.2 × 0.8 = **0.96 (96%)**

---

## 💻 Implementation Details

### **Template Bindings:**

**Title Block:**
```vue
<div 
  class="overlay title-block"
  :style="{ 
    fontSize: overlayScaling.titleBlock.fontSize,
    padding: overlayScaling.titleBlock.padding,
    width: overlayScaling.titleBlock.width,
    lineHeight: overlayScaling.titleBlock.lineHeight
  }"
>
```

**North Arrow:**
```vue
<div 
  class="overlay north-arrow"
  :style="{ 
    width: overlayScaling.northArrow.size,
    height: overlayScaling.northArrow.size
  }"
>
  <div class="arrow" :style="{ fontSize: overlayScaling.northArrow.fontSize }">↑</div>
  <div class="north-label" :style="{ fontSize: overlayScaling.northArrow.labelSize }">N</div>
</div>
```

**Scale Bar:**
```vue
<div 
  class="overlay scale-bar"
  :style="{ padding: overlayScaling.scaleBar.padding }"
>
  <div class="scale-bar-ruler" :style="{ 
    height: overlayScaling.scaleBar.height,
    width: overlayScaling.scaleBar.width
  }">
```

**Schedule:**
```vue
<div 
  class="overlay schedule-of-areas"
  :style="{ 
    fontSize: overlayScaling.schedule.fontSize,
    padding: overlayScaling.schedule.padding,
    maxHeight: overlayScaling.schedule.maxHeight
  }"
>
```

---

## 📊 Console Logging

The system logs adaptive scaling changes in real-time:

```
[SurveyPlanMap] 📏 Adaptive Overlay Scaling Updated:
  Sheet Size: Medium
  Map Scale: 1:1000
  Combined Factor: 100%
  Title Block: { fontSize: '12px', width: '280px' }
  North Arrow: { size: '80px', fontSize: '48px' }
  Scale Bar: { width: '250px', height: '12px' }
  Schedule: { fontSize: '11px', maxHeight: '400px' }
```

**Triggered When:**
- Sheet size changes (Small/Medium/Large)
- Map scale changes (1:500, 1:1000, etc.)
- Intelligent preview loads

---

## 🎯 Use Cases

### **1. Small Detailed Plan (1:500)**
- **Sheet:** Small (500×400mm)
- **Combined Factor:** 102%
- **Result:** Slightly larger overlays for readability on small sheet
- **Best For:** Urban subdivisions, detailed site plans

### **2. Standard Plan (1:1000)**
- **Sheet:** Medium (800×500mm)
- **Combined Factor:** 100%
- **Result:** Baseline sizing, optimal proportions
- **Best For:** General plans, township layouts

### **3. Large Overview Plan (1:5000)**
- **Sheet:** Large (1000×800mm)
- **Combined Factor:** 96%
- **Result:** Slightly smaller overlays to not overwhelm large sheet
- **Best For:** Regional plans, large estates

---

## ✅ Benefits

### **1. Professional Appearance**
- Overlays always proportional to sheet size
- No tiny text on large sheets
- No oversized elements on small sheets

### **2. SI 727 Compliance**
- Maintains regulation margins
- Professional cartographic standards
- Suitable for official submission

### **3. User Experience**
- Automatic adaptation (no manual adjustment needed)
- Consistent visual hierarchy
- Clear, legible information

### **4. Print Quality**
- Scales correctly for PDF export
- Maintains readability at all sizes
- Professional output

---

## 🧪 Testing

### **Test 1: Sheet Size Changes**
1. Open Survey Plan view
2. Change sheet size: Small → Medium → Large
3. **Expected:** All overlays scale proportionally
4. **Console:** Shows updated scaling factors

### **Test 2: Scale Changes**
1. Set sheet size to Medium
2. Change scale: 1:500 → 1:1000 → 1:2500 → 1:5000
3. **Expected:** Overlays adjust size (larger for detailed, smaller for overview)
4. **Console:** Shows scale-based adjustments

### **Test 3: Combined Changes**
1. Set Small sheet + 1:500 scale
2. Change to Large sheet + 1:5000 scale
3. **Expected:** Overlays adapt to both factors
4. **Console:** Shows combined factor calculation

### **Test 4: Visual Verification**
1. Enable margin guides (📐 button)
2. Compare overlay sizes to SI 727 margins
3. **Expected:** Proportional to sheet dimensions
4. **Visual:** Title block fits within title block area

---

## 📝 Configuration

### **Modify Base Sizes:**

Edit `overlayScaling` computed property (line 582):

```typescript
// Change base sizes here
titleBlock: {
  fontSize: `${Math.round(12 * combinedFactor)}px`,  // Change 12
  padding: `${Math.round(12 * combinedFactor)}px`,   // Change 12
  width: `${Math.round(280 * combinedFactor)}px`,    // Change 280
  lineHeight: `${1.4 + (combinedFactor - 1) * 0.2}`  // Change 1.4
}
```

### **Modify Scaling Factors:**

```typescript
// Sheet size factors
if (sheetSize === 'Small') {
  sizeFactor = 0.85  // Change this
} else if (sheetSize === 'Medium') {
  sizeFactor = 1.0   // Change this
} else if (sheetSize === 'Large') {
  sizeFactor = 1.2   // Change this
}

// Scale factors
if (scaleValue <= 500) {
  scaleFactor = 1.2  // Change this
} else if (scaleValue <= 1000) {
  scaleFactor = 1.0  // Change this
} else if (scaleValue <= 2500) {
  scaleFactor = 0.9  // Change this
} else {
  scaleFactor = 0.8  // Change this
}
```

---

## 🔮 Future Enhancements

### **Potential Improvements:**
1. **User Preferences:** Allow users to set custom scaling factors
2. **Export Optimization:** Different factors for screen vs. print
3. **Responsive Breakpoints:** Adjust for different screen sizes
4. **Animation:** Smooth transitions when scaling changes
5. **Presets:** Save/load overlay configurations

---

## 📚 Related Documentation

- **SI727_LAYOUT_COMPLETED.md** - General plan layout implementation
- **SI727_LAYOUT_IMPLEMENTATION_STATUS.md** - Implementation tracking
- **app-backend/src/utils/si727Constants.js** - SI 727 constants
- **app-backend/src/utils/si727LayoutCalculator.js** - Layout calculations

---

## 🎉 Summary

The **Adaptive Overlay System** ensures that all draggable overlays (title block, north arrow, scale bar, schedule of areas) automatically scale to maintain professional proportions across:

- ✅ **3 Sheet Sizes** (Small, Medium, Large)
- ✅ **Multiple Scales** (1:250 to 1:75000)
- ✅ **SI 727 Compliance** (Zimbabwe Land Survey Rules)
- ✅ **Professional Output** (Screen and print)

**Result:** Beautiful, proportional, regulation-compliant survey plans every time! 🚀

---

**Last Updated:** 2025-12-14 15:45  
**Status:** ✅ Production Ready  
**File:** `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue`
