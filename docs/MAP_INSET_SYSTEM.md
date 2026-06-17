# Map Inset System for Short Edges
## Visual Reference and Implementation Guide

---

## 1. MAIN PLAN VIEW (1:1000 scale)

```
┌────────────────────────────────────────────────────────────────────────┐
│                                                                        │
│                        SURVEY PLAN                                     │
│                                                                        │
│  ┌─────────────────────────────────────────────┐                     │
│  │                                             │   ┌──────────────┐  │
│  │         2283A ●────────────────● 2283B      │   │ Inset 1      │  │
│  │                    45.67                    │   │ Stand 2283   │  │
│  │                  305°47'30"                 │   │ (1:400)      │  │
│  │                                             │   │              │  │
│  │                                             │   │  2283B ●     │  │
│  │                   2283                      │   │    │ 3.45   │  │
│  │                                             │   │    │ 45°10' │  │
│  │                                             │   │  2283C ●     │  │
│  │                                             │   │              │  │
│  │         2283D ●──"Inset 1"──● 2283C         │   │  ↑  [═══]   │  │
│  │                    3.45                     │   └──────────────┘  │
│  │                  (omitted)                  │                     │
│  │                                             │                     │
│  └─────────────────────────────────────────────┘                     │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Key Elements:**
- **Short edge (3.45m):** Direction label omitted on main plan
- **Inset indicator:** "Inset 1" placed near short edge
- **Inset box:** Shows scaled-up view with ALL labels
- **Leader line:** Dashed line connecting indicator to inset (not shown above)

---

## 2. INSET DETAIL (2.5× magnification)

```
┌─────────────────────────────────────┐
│ Inset 1 - Stand 2283 (1:400)       │
├─────────────────────────────────────┤
│                                     │
│         2283B ●                     │
│                │                    │
│                │ 3.45               │
│                │ 45°10'20"          │
│                │                    │
│         2283C ●                     │
│                                     │
│                                     │
│   ↑ N    [════════]                │
│          0  1  2  3m                │
└─────────────────────────────────────┘
```

**Inset Components:**
1. **Title:** "Inset 1 - Stand 2283 (1:400)"
2. **Beacon symbols:** Full size at inset scale
3. **Beacon names:** "2283B", "2283C"
4. **Distance label:** "3.45" (rotated, aligned with edge)
5. **Direction label:** "45°10'20"" (rotated, aligned with edge)
6. **North arrow:** Small, 10mm
7. **Scale bar:** 0-3m at 1:400 scale

---

## 3. INSET NUMBERING SYSTEM

### Global Counter Across Entire Plan

```
Plan with multiple short edges:

Stand 2283:
  - Edge 2283B-2283C (3.45m) → Inset 1
  
Stand 2284:
  - Edge 2284A-2284B (4.12m) → Inset 2
  - Edge 2284C-2284D (2.89m) → Inset 3
  
Stand 2285:
  - Edge 2285E-2285F (4.67m) → Inset 4

Total insets: 4
```

**Numbering Rules:**
- Start at 1, increment sequentially
- Never reset or restart numbering
- Track globally across all parcels
- Maintain order of creation

---

## 4. INSET LAYOUT IN MARGINS

### Preferred Positions (Priority Order)

```
┌────────────────────────────────────────────────────────────────┐
│                    TOP MARGIN                                  │
│              [Inset 4 - if needed]                            │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  LEFT MARGIN    │                              │  RIGHT MARGIN │
│  (Reserved for  │      MAP AREA               │               │
│   tables)       │                              │  ┌──────────┐ │
│                 │                              │  │ Inset 1  │ │
│                 │                              │  └──────────┘ │
│                 │                              │               │
│                 │                              │  ┌──────────┐ │
│                 │                              │  │ Inset 2  │ │
│                 │                              │  └──────────┘ │
│                 │                              │               │
│                 │                              │  ┌──────────┐ │
│                 │                              │  │ Inset 3  │ │
│                 │                              │  └──────────┘ │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│                   BOTTOM MARGIN                                │
│              [Inset 5 - if needed]                            │
└────────────────────────────────────────────────────────────────┘
```

**Position Priority:**
1. **Right margin, top** (most preferred)
2. **Right margin, middle**
3. **Right margin, bottom**
4. **Top margin, center**
5. **Bottom margin, center**
6. **Stack vertically if needed**

**Spacing:**
- 10mm between insets
- 5mm from margin edge
- Avoid overlapping other elements

---

## 5. LEADER LINE DESIGN

### Connecting Indicator to Inset

```
Main Plan:
                    ┌─────────────┐
                    │ Inset 1     │
                    │ Stand 2283  │
                    │ (1:400)     │
                    │             │
                   ╱│  [detail]   │
                  ╱ │             │
                 ╱  └─────────────┘
                ╱
               ╱
   ●─────"Inset 1"
   2283C
```

**Leader Line Specifications:**
- **Style:** Dashed line
- **Width:** 0.3mm
- **Color:** Gray (#999999)
- **Pattern:** 2mm dash, 1mm gap
- **Arrow:** Small arrowhead at inset end
- **Routing:** Avoid crossing other insets or important features

---

## 6. IMPLEMENTATION WORKFLOW

### Step-by-Step Process

```javascript
// 1. Initialize inset manager
const insetManager = new InsetManager();

// 2. During edge label rendering
parcels.forEach(parcel => {
  parcel.edges.forEach(edge => {
    const edgeLength = calculateEdgeLength(edge);
    
    // Render distance label (always)
    renderDistanceLabel(doc, edge, parcel);
    
    // Check if direction label fits
    if (edgeLength < 5) {
      // Edge too short - create inset
      const inset = insetManager.createInset(edge, parcel, 'short-edge');
      
      // Place indicator on main plan
      const indicatorPos = calculateIndicatorPosition(edge, parcel);
      doc.fontSize(6)
         .font('Helvetica-Oblique')
         .fillColor('#666666')
         .text(`Inset ${inset.number}`, indicatorPos.x, indicatorPos.y);
         
      console.log(`[Insets] Created Inset ${inset.number} for edge ${edge.id} (${edgeLength.toFixed(2)}m)`);
    } else {
      // Edge long enough - render direction label
      renderDirectionLabel(doc, edge, parcel);
    }
  });
});

// 3. After all main plan labels rendered
console.log(`[Insets] Rendering ${insetManager.insets.length} insets...`);
insetManager.renderAllInsets(doc);

// 4. Log summary
console.log(`[Insets] ✅ Complete - ${insetManager.insets.length} insets created`);
```

---

## 7. INSET CONTENT RENDERING

### What to Include in Each Inset

**Essential Elements:**
1. ✅ **Title bar:** "Inset N - Stand XXXX (1:YYY)"
2. ✅ **Parcel edges:** Relevant section with buffer
3. ✅ **Beacon symbols:** At corners
4. ✅ **Beacon names:** All visible
5. ✅ **Distance labels:** All visible (rotated)
6. ✅ **Direction labels:** ALL visible (rotated) - including omitted ones
7. ✅ **North arrow:** Small (10mm)
8. ✅ **Scale bar:** Appropriate for inset scale

**Optional Elements:**
- ⚪ Stand number (if space permits)
- ⚪ Adjacent parcel boundaries (for context)
- ⚪ Grid lines (if helpful)

---

## 8. SCALE CALCULATION

### Determining Inset Magnification

```javascript
function calculateInsetScale(mainScale, edgeLength) {
  // Target: Make 5m edge appear as 12.5mm on inset
  // This ensures labels fit comfortably
  
  const targetEdgeLengthMM = 12.5; // 12.5mm on paper
  const edgeLengthM = edgeLength; // e.g., 3.45m
  
  // Calculate required scale
  // scale = (real distance / paper distance) × 1000
  const requiredScale = (edgeLengthM / (targetEdgeLengthMM / 1000));
  
  // Round to nice number
  const niceScales = [100, 200, 250, 333, 400, 500, 666, 750, 1000];
  const insetScale = niceScales.find(s => s >= requiredScale) || 400;
  
  // Verify magnification is reasonable (2-4×)
  const magnification = mainScale / insetScale;
  if (magnification < 2 || magnification > 4) {
    console.warn(`[Insets] Unusual magnification: ${magnification.toFixed(1)}×`);
  }
  
  return insetScale;
}

// Example:
// Main scale: 1:1000
// Edge length: 3.45m
// Required scale: ~276
// Selected scale: 333 (closest nice number)
// Magnification: 1000/333 = 3.0×
```

---

## 9. COLLISION DETECTION

### Ensuring Insets Don't Overlap

```javascript
function findOptimalInsetPosition(width, height, existingInsets) {
  const candidates = [
    { x: 1800, y: 150, region: 'right-top' },
    { x: 1800, y: 240, region: 'right-mid' },
    { x: 1800, y: 330, region: 'right-bottom' },
    { x: 900, y: 50, region: 'top-center' },
    { x: 900, y: 1500, region: 'bottom-center' }
  ];
  
  for (const candidate of candidates) {
    let hasCollision = false;
    
    // Check against existing insets
    for (const existing of existingInsets) {
      if (rectanglesOverlap(
        candidate.x, candidate.y, width, height,
        existing.x, existing.y, existing.width, existing.height
      )) {
        hasCollision = true;
        break;
      }
    }
    
    // Check against other plan elements (title block, tables, etc.)
    if (!hasCollision && !overlapsOtherElements(candidate, width, height)) {
      return candidate;
    }
  }
  
  // Fallback: stack vertically below last inset
  const lastInset = existingInsets[existingInsets.length - 1];
  return {
    x: lastInset.x,
    y: lastInset.y + lastInset.height + 10,
    region: 'stacked'
  };
}
```

---

## 10. EXAMPLE OUTPUT

### Complete Plan with Multiple Insets

```
┌──────────────────────────────────────────────────────────────────────────┐
│  GENERAL PLAN - STANDS 2283-2293, MAGLAS TOWNSHIP                       │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────┐  ┌────────────────────┐    │
│  │                                        │  │ Inset 1            │    │
│  │  2283A ●──────────────● 2283B          │  │ Stand 2283 (1:400) │    │
│  │           45.67                        │  │                    │    │
│  │         305°47'30"                     │  │ 2283B ●            │    │
│  │                                        │  │   │ 3.45           │    │
│  │            2283                        │  │   │ 45°10'20"      │    │
│  │                                        │  │ 2283C ●            │    │
│  │  2283D ●──"Inset 1"──● 2283C           │  │                    │    │
│  │           3.45                         │  │ ↑N  [═══]          │    │
│  │                                        │  └────────────────────┘    │
│  │                                        │                            │
│  │  2284A ●──────────────● 2284B          │  ┌────────────────────┐    │
│  │           52.13                        │  │ Inset 2            │    │
│  │         125°30'40"                     │  │ Stand 2284 (1:333) │    │
│  │                                        │  │                    │    │
│  │            2284                        │  │ 2284C ●            │    │
│  │                                        │  │   │ 4.12           │    │
│  │  2284D ●──"Inset 2"──● 2284C           │  │   │ 88°22'10"      │    │
│  │           4.12                         │  │ 2284D ●            │    │
│  │                                        │  │                    │    │
│  └────────────────────────────────────────┘  │ ↑N  [═══]          │    │
│                                              └────────────────────┘    │
│                                                                          │
│  Console Output:                                                         │
│  [Insets] Created Inset 1 for edge 2283C-2283D (3.45m)                 │
│  [Insets] Created Inset 2 for edge 2284C-2284D (4.12m)                 │
│  [Insets] Rendering 2 insets...                                         │
│  [Insets] ✅ Complete - 2 insets created                                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 11. BENEFITS

### Why This Approach Works

✅ **Maintains label completeness** - No information lost  
✅ **Improves readability** - Labels at appropriate scale  
✅ **Professional appearance** - Standard cartographic practice  
✅ **Field-friendly** - Surveyors can read all measurements  
✅ **SI 727 compliant** - Meets cadastral standards  
✅ **Scalable** - Works for any number of short edges  
✅ **Automated** - No manual intervention required  

---

## 12. TESTING CHECKLIST

- [ ] Inset created for edge < 5m
- [ ] Inset number increments correctly
- [ ] Indicator placed near short edge
- [ ] Leader line connects indicator to inset
- [ ] Inset shows ALL labels (including omitted direction)
- [ ] Inset scale is 2-3× main scale
- [ ] North arrow and scale bar present in inset
- [ ] Multiple insets don't overlap
- [ ] Insets positioned in margins (not over map)
- [ ] Console logs show inset creation

---

**Document Status:** Design Complete - Ready for Implementation  
**Next Step:** Implement InsetManager class in pdfkitGeoPDF.js
