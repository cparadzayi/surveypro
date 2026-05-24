# ▲ Cadastral Triangle Symbol Implementation

## 🎯 **Applied SGO Standard Symbol**

Implemented the **cadastral standard triangle symbol** for control points on the selection map, matching the trig beacon inset map.

---

## 📐 **The Symbol**

### **Design Specification**

```
     ▲
    ╱ ╲
   ╱   ╲
  ╱  ○  ╲
 ╱       ╲
╱_________╲
```

**Components:**
1. **Equilateral triangle** pointing upward
2. **Black fill** (SGO cadastral standard)
3. **White border** (3px for visibility)
4. **White inscribed circle** at centroid
5. **Black circle outline** (1.5px)

**Mathematical Details:**
- Triangle size: 48×48 pixels
- Triangle height: 32 pixels
- Incircle radius: 25% of full incircle (reduced for clarity)
- Centroid position: 1/3 of height from base

---

## 🎨 **Visual States**

### **Unselected Control Points**
```
▲ Black triangle
  White inscribed circle
  Icon size: 0.5 (24px)
```

### **Selected Control Points**
```
▲ Red triangle (#dc2626)
  White inscribed circle with red outline
  Icon size: 0.7 (33.6px) - larger
```

---

## 🔧 **Implementation**

### **Symbol Creation**

Two canvas-based symbols are created:

1. **`control-point-triangle`** (unselected)
   - Black fill (#000000)
   - White border
   - White circle with black outline

2. **`control-point-triangle-selected`** (selected)
   - Red fill (#dc2626)
   - White border
   - White circle with red outline

### **Symbol Layer**

```typescript
map.addLayer({
  id: 'control-points-symbols',
  type: 'symbol',
  source: 'control-points',
  layout: {
    'icon-image': [
      'case',
      ['get', 'isSelected'],
      'control-point-triangle-selected',  // Red for selected
      'control-point-triangle'  // Black for unselected
    ],
    'icon-size': [
      'case',
      ['get', 'isSelected'],
      0.7,   // 33.6px for selected
      0.5    // 24px for unselected
    ],
    'icon-allow-overlap': true
  }
})
```

---

## 📊 **Comparison: Before vs After**

### **Before**
- 🔵 Blue circles for unselected
- 🔴 Red circles for selected
- Generic appearance
- Not cadastral standard

### **After**
- ▲ Black triangles for unselected (SGO standard)
- ▲ Red triangles for selected
- Professional cadastral appearance
- Matches trig beacon inset map
- Consistent visual language

---

## 🎯 **Benefits**

1. **Cadastral Standard Compliance**
   - Matches SGO (Surveyor General's Office) standards
   - Professional surveying appearance
   - Recognized symbol for control points

2. **Visual Consistency**
   - Same symbol as trig beacon inset map
   - Unified visual language across the app
   - Professional and cohesive design

3. **Clear Identification**
   - Instantly recognizable as control points
   - Distinct from other map features
   - Selection state clearly visible (black vs red)

4. **Better Visibility**
   - White border ensures visibility on any background
   - Larger than circles (more prominent)
   - Inscribed circle adds detail at close zoom

---

## 🗺️ **Map Appearance**

### **Overview (Zoomed Out)**
```
Map shows multiple black triangles
Clean, professional appearance
Cadastral standard symbols
No label clutter
```

### **With Selection**
```
▲ ▲ ▲ ▲ ▲  (Black - unselected)
    ▲      (Red - selected, larger)
    
Clear visual distinction
Selected points stand out
Professional surveying map
```

### **Zoomed In**
```
▲
105/S
5 km

▲
89/N
12 km

Triangles with adaptive labels
Full cadastral standard appearance
```

---

## 📝 **Code Location**

**File:** `app-frontend/src/composables/useControlPointMap.ts`

**Function:** `addPointsToMap()` (lines 228-307)

**Key sections:**
1. Lines 228-275: Create black triangle symbol
2. Lines 277-307: Create red triangle symbol (selected)
3. Lines 337-358: Apply symbols to map layer

---

## ✅ **Testing**

After reloading:

- [ ] Navigate to Control Point Selection
- [ ] Verify black triangles appear (not circles)
- [ ] Verify white inscribed circle visible
- [ ] Select a point - verify it turns red
- [ ] Verify selected triangle is larger
- [ ] Zoom in/out - verify symbols scale properly
- [ ] Compare with trig beacon inset - verify same symbol
- [ ] Click triangle - verify popup works
- [ ] Hover - verify cursor changes

---

## 🎨 **Visual Specification**

### **Symbol Geometry**

```
Triangle vertices:
  Top:    (24, 8)
  Right:  (40, 40)
  Left:   (8, 40)

Inscribed circle:
  Center: (24, 29.33) - at centroid
  Radius: ~2.3px (25% of full incircle)
```

### **Colors**

**Unselected:**
- Triangle fill: `#000000` (black)
- Triangle stroke: `#ffffff` (white, 3px)
- Circle fill: `#ffffff` (white)
- Circle stroke: `#000000` (black, 1.5px)

**Selected:**
- Triangle fill: `#dc2626` (red-600)
- Triangle stroke: `#ffffff` (white, 3px)
- Circle fill: `#ffffff` (white)
- Circle stroke: `#dc2626` (red-600, 1.5px)

---

## 🏆 **SGO Cadastral Standard**

This symbol follows the **Surveyor General's Office (SGO)** cadastral mapping standards:

✅ **Equilateral triangle** - Standard for trigonometrical stations  
✅ **Black fill** - Official SGO color  
✅ **Inscribed circle** - Enhanced detail for digital maps  
✅ **Upward pointing** - Standard orientation  
✅ **White border** - Ensures visibility on all backgrounds

---

## 🔄 **Consistency Across App**

The same symbol is now used in:

1. **Control Point Selection Map** (this implementation)
2. **Trig Beacon Inset Map** (MapLibreAreaView.vue)
3. **Area Computation Map** (when control points displayed)

**Result:** Unified, professional cadastral mapping experience throughout the application.

---

**Last Updated**: November 24, 2025, 6:55 AM  
**Status**: ✅ Implemented - SGO standard cadastral triangle symbol  
**Reload to see the professional cadastral symbols!** ▲
