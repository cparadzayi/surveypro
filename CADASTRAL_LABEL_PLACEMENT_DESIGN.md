# Professional Cadastral Label Placement System
## Design Document for Survey Plan Labeling

**Date:** December 24, 2025  
**Status:** Design Phase - Awaiting Implementation  
**Based on:** Zimbabwe cadastral standards, ICA cartographic principles, professional surveying practice

---

## 1. DESIGN PRINCIPLES

### 1.1 Core Philosophy
**All labels must be placed INSIDE their respective parcel polygons for optimal field readability.**

This follows professional cadastral surveying practice where:
- Field surveyors need to quickly identify beacons while standing inside a parcel
- Labels outside parcels create confusion about which parcel they reference
- Inside placement reduces visual clutter and improves plan clarity
- Reduces ambiguity in dense subdivision plans

### 1.2 Label Hierarchy (Priority Order)
1. **Stand/Parcel Numbers** - Largest, most prominent (e.g., "2283", "2284")
2. **Beacon Names** - Medium size, near beacon symbols (e.g., "2283A", "2283B")
3. **Edge Distances** - Small, along parcel edges (e.g., "45.67")
4. **Edge Directions** - Small, along parcel edges (e.g., "305°47'30"")

---

## 2. LABEL TYPES AND SPECIFICATIONS

### 2.1 Stand/Parcel Number Labels

**Purpose:** Primary identification of each parcel/stand

**Placement Rules:**
- **Position:** Geometric centroid of parcel polygon
- **Fallback:** Largest inscribed circle center if centroid is outside polygon
- **Font:** Helvetica Bold
- **Size:** 14-18pt (scale-dependent, larger for bigger parcels)
- **Color:** Black (#000000)
- **Style:** Bold, all caps if alphanumeric

**Example:** 
```
Stand 2283 → "2283" at centroid
Stand 2284A → "2284A" at centroid
```

**Quality Checks:**
- Label must be fully inside parcel boundary (with 5mm buffer)
- Must not overlap any beacon symbols
- Must not overlap edge labels
- If parcel too small, reduce font size or omit

---

### 2.2 Beacon Name Labels

**Purpose:** Identify survey beacons defining parcel corners

**Placement Rules:**

#### A. Shared Beacons (on parcel boundaries)
- **Position:** Just inside parcel, offset 3-5mm from beacon symbol
- **Direction:** Toward parcel centroid (inward)
- **Font:** Helvetica Regular
- **Size:** 8-10pt (scale-dependent)
- **Color:** Black (#000000)
- **Format:** Full name (e.g., "2283A", "M8", "ZE")

**Positioning Algorithm:**
1. Calculate vector from beacon to parcel centroid
2. Normalize vector
3. Place label 3-5mm along this vector (inside parcel)
4. Check label doesn't overlap beacon circle
5. Check label is fully inside parcel boundary

#### B. Interior Beacons (rare, inside parcel)
- **Position:** Adjacent to beacon, any cardinal direction
- **Preference:** Right or above beacon
- **Same font/size as shared beacons

**Special Cases:**
- **Splay Points** (multiple beacons very close): Stagger labels vertically
- **Tight Corners**: Use smaller font or abbreviate
- **Outside Figure Beacons**: Place outside polygon (exception to inside rule)

---

### 2.3 Edge Distance Labels

**Purpose:** Show measured distance of each parcel edge

**Placement Rules:**
- **Position:** Midpoint of edge, offset 2-3mm INSIDE parcel
- **Orientation:** Parallel to edge (rotated text)
- **Font:** Helvetica Regular
- **Size:** 7-8pt
- **Color:** Black (#000000)
- **Format:** Decimal meters, 2 decimal places (e.g., "45.67")

**Positioning Algorithm:**
1. Calculate edge midpoint
2. Calculate edge angle (bearing)
3. Calculate perpendicular inward vector (90° from edge, toward centroid)
4. Offset label 2-3mm along perpendicular (inside parcel)
5. Rotate label to align with edge
6. Ensure label doesn't overlap beacons or stand number

**Text Rotation:**
- Keep text readable (never upside down)
- If edge angle 90-270°, rotate text 180° for readability
- Horizontal edges: text above line (inside parcel)
- Vertical edges: text to right of line (inside parcel)

---

### 2.4 Edge Direction Labels (Bearings)

**Purpose:** Show surveyed bearing of each parcel edge

**Placement Rules:**
- **Position:** Near edge midpoint, offset 2-3mm INSIDE parcel
- **Offset from distance:** 1-2mm further inside than distance label
- **Orientation:** Rotated to align with edge (same as distance label)
- **Font:** Helvetica Regular
- **Size:** 6-7pt (smaller than distance)
- **Color:** Dark gray (#333333) to differentiate from distance
- **Format:** DMS format (e.g., "305°47'30"")

**Positioning Algorithm:**
1. Use same midpoint as distance label
2. Offset 1-2mm further inside parcel (perpendicular to edge)
3. Rotate text to align with edge (same rotation as distance label)
4. Place parallel to distance label (stacked)

**Short Edge Handling (< 5m):**
- **Omit direction label** if edge length < 5m
- **Create map inset** for that edge section
- **Place inset indicator** near edge: "Inset 1", "Inset 2", etc.
- **Track inset numbers** globally across entire plan
- **Inset shows:** Scaled-up view (2-3× magnification) with all labels visible

**Collision Avoidance:**
- Distance and direction labels form a pair
- Treat as single unit for collision detection
- If both don't fit, create map inset instead of omitting

---

## 2.5 Map Insets for Short Edges

**Purpose:** Provide detailed view of edges where labels cannot fit at main scale

**When to Create Insets:**
1. Edge length < 5m (direction label omitted)
2. Label collision cannot be resolved at main scale
3. Multiple beacons very close together (splay points)
4. Complex corner details requiring clarification

**Inset Specifications:**

**Size:**
- **Width:** 60-80mm (fixed)
- **Height:** 60-80mm (fixed)
- **Border:** 0.5mm black line
- **Background:** White with subtle gray border

**Scale:**
- **Magnification:** 2-3× main plan scale
- **Example:** Main plan 1:1000 → Inset 1:500 or 1:333
- **Scale indicator:** Show in inset title

**Position:**
- **Location:** Margin areas (outside map boundary)
- **Preference:** Right margin, top margin, or bottom margin
- **Avoid:** Left margin (reserved for tables)
- **Spacing:** 10mm between insets

**Content:**
- **Parcel edges** with full geometry
- **Beacon symbols** at corners
- **Beacon names** (all visible)
- **Edge distances** (all visible)
- **Edge directions** (all visible, including omitted ones)
- **Stand number** if space permits
- **North arrow** (small, 10mm)
- **Scale bar** (small, 20mm)

**Inset Numbering:**
- **Global counter:** Increments across entire plan
- **Format:** "Inset 1", "Inset 2", "Inset 3", etc.
- **Indicator on main plan:** Small label near affected edge
- **Indicator format:** "See Inset 1" or just "Inset 1"
- **Indicator size:** 6pt, italic
- **Indicator position:** 2mm from edge, inside parcel

**Inset Title:**
```
┌─────────────────────────────────┐
│ Inset 1 - Stand 2283 (1:500)   │
│ [Detailed view with all labels] │
│                                 │
│  [North arrow]  [Scale bar]    │
└─────────────────────────────────┘
```

**Leader Lines:**
- **From indicator to inset:** Dashed line (0.3mm, gray)
- **Style:** Straight line with arrow at inset end
- **Avoid:** Crossing other insets or important features

**Inset Layout Algorithm:**

```javascript
class InsetManager {
  constructor() {
    this.insets = [];
    this.nextInsetNumber = 1;
    this.usedPositions = [];
  }
  
  createInset(edge, parcel, reason) {
    const insetNumber = this.nextInsetNumber++;
    
    // Calculate inset bounds (buffer around edge)
    const buffer = edge.length * 1.5; // 1.5× edge length
    const insetBounds = calculateInsetBounds(edge, buffer);
    
    // Calculate magnification
    const mainScale = getCurrentScale(); // e.g., 1000
    const insetScale = Math.floor(mainScale / 2.5); // e.g., 400
    
    // Find optimal position in margins
    const position = this.findOptimalInsetPosition(60, 60);
    
    // Create inset object
    const inset = {
      number: insetNumber,
      edge: edge,
      parcel: parcel,
      bounds: insetBounds,
      scale: insetScale,
      position: position,
      reason: reason,
      indicatorText: `Inset ${insetNumber}`
    };
    
    this.insets.push(inset);
    return inset;
  }
  
  findOptimalInsetPosition(width, height) {
    // Try positions in order: right margin, top margin, bottom margin
    const candidates = [
      { x: rightMarginX, y: topMarginY, region: 'right-top' },
      { x: rightMarginX, y: topMarginY + 90, region: 'right-mid' },
      { x: rightMarginX, y: topMarginY + 180, region: 'right-bottom' },
      { x: mapCenterX - 40, y: topMarginY - 70, region: 'top-center' },
      { x: mapCenterX - 40, y: bottomMarginY + 10, region: 'bottom-center' }
    ];
    
    // Find first position that doesn't overlap existing insets
    for (const candidate of candidates) {
      if (!this.overlapsExistingInset(candidate, width, height)) {
        this.usedPositions.push({ ...candidate, width, height });
        return candidate;
      }
    }
    
    // Fallback: stack vertically in right margin
    const lastInset = this.usedPositions[this.usedPositions.length - 1];
    return { x: rightMarginX, y: lastInset.y + lastInset.height + 10 };
  }
  
  overlapsExistingInset(candidate, width, height) {
    for (const used of this.usedPositions) {
      if (rectanglesOverlap(
        candidate.x, candidate.y, width, height,
        used.x, used.y, used.width, used.height
      )) {
        return true;
      }
    }
    return false;
  }
  
  renderAllInsets(doc) {
    this.insets.forEach(inset => {
      this.renderInset(doc, inset);
      this.renderIndicator(doc, inset);
      this.renderLeaderLine(doc, inset);
    });
  }
}
```

**Inset Rendering:**

```javascript
function renderInset(doc, inset) {
  const { position, bounds, scale, number } = inset;
  
  // Draw border
  doc.rect(position.x, position.y, 60, 60)
     .lineWidth(0.5)
     .stroke();
  
  // Draw title
  doc.fontSize(7)
     .font('Helvetica-Bold')
     .text(`Inset ${number} - Stand ${inset.parcel.stand} (1:${scale})`,
           position.x + 2, position.y + 2);
  
  // Transform and render parcel section
  const insetMapArea = {
    x: position.x + 5,
    y: position.y + 10,
    width: 50,
    height: 45
  };
  
  // Render parcel edges in inset
  renderParcelEdgesInInset(doc, inset.parcel, bounds, insetMapArea, scale);
  
  // Render beacons in inset
  renderBeaconsInInset(doc, inset.edge.beacons, bounds, insetMapArea, scale);
  
  // Render ALL labels (including omitted direction)
  renderEdgeLabelsInInset(doc, inset.edge, bounds, insetMapArea, scale, true);
  
  // Draw north arrow (small)
  drawNorthArrow(doc, position.x + 52, position.y + 52, 8);
  
  // Draw scale bar (small)
  drawScaleBar(doc, position.x + 5, position.y + 55, 20, scale);
}
```

**Example Usage:**

```javascript
// During edge label rendering
if (edge.length < 5) {
  // Omit direction label on main plan
  renderDistanceLabel(doc, edge, parcel);
  
  // Create inset
  const inset = insetManager.createInset(edge, parcel, 'short-edge');
  
  // Place indicator on main plan
  const indicatorPos = calculateIndicatorPosition(edge, parcel);
  doc.fontSize(6)
     .font('Helvetica-Oblique')
     .fillColor('#666666')
     .text(`Inset ${inset.number}`, indicatorPos.x, indicatorPos.y);
}

// After all labels rendered
insetManager.renderAllInsets(doc);
```

---

## 3. LABEL PLACEMENT ALGORITHM

### 3.1 Overall Strategy

**Phase 1: Stand Numbers**
1. Calculate parcel centroid
2. Check if centroid is inside polygon
3. If outside, use largest inscribed circle center
4. Place stand number at optimal position
5. Register bounding box with collision detector

**Phase 2: Beacon Names**
1. For each beacon on parcel boundary:
   - Calculate inward vector (toward centroid)
   - Place label 3-5mm inside parcel
   - Check no overlap with stand number
   - Check fully inside boundary
   - Register with collision detector

**Phase 3: Edge Labels (Distance + Direction)**
1. For each edge:
   - Calculate midpoint
   - Calculate perpendicular inward vector
   - Place distance label 2-3mm inside
   - Place direction label 1-2mm further inside
   - Rotate distance label to align with edge
   - Keep direction label horizontal
   - Check no overlap with stand number or beacons
   - If collision, try alternate positions along edge
   - Register with collision detector

### 3.2 Collision Detection

**Priority Hierarchy:**
1. Stand numbers (highest priority, never move)
2. Beacon names (high priority, minimal adjustment)
3. Distance labels (medium priority, can shift along edge)
4. Direction labels (low priority, can be omitted if necessary)

**Resolution Strategy:**
- If collision detected, try alternate positions
- For edge labels: shift ±10%, ±20% along edge from midpoint
- If still collision, reduce font size
- Last resort: omit lower priority label

### 3.3 Boundary Constraints

**All labels must satisfy:**
```javascript
function isLabelInsideParcel(labelBox, parcelPolygon) {
  const buffer = 5; // 5mm safety buffer from boundary
  
  // Check all 4 corners of label bounding box
  const corners = [
    { x: labelBox.x, y: labelBox.y },
    { x: labelBox.x + labelBox.width, y: labelBox.y },
    { x: labelBox.x, y: labelBox.y + labelBox.height },
    { x: labelBox.x + labelBox.width, y: labelBox.y + labelBox.height }
  ];
  
  for (const corner of corners) {
    if (!isPointInPolygon(corner, parcelPolygon, buffer)) {
      return false;
    }
  }
  
  return true;
}
```

---

## 4. SPECIAL CASES

### 4.1 Outside Figure Polygon

**Exception to inside-parcel rule:**
- Beacon names: Place OUTSIDE polygon (radially outward from centroid)
- Edge labels: Place OUTSIDE polygon, parallel to edges
- No stand number (it's the boundary, not a parcel)

### 4.2 Small Parcels

**Adaptive sizing for parcels < 100m²:**
1. Reduce stand number font: 14pt → 10pt
2. Reduce beacon names: 8pt → 6pt
3. Omit direction labels (keep only distances)
4. If still too crowded, omit edge labels entirely

### 4.3 Narrow Parcels

**For parcels with width < 10m:**
1. Place stand number at widest point
2. Stagger beacon labels vertically
3. Place edge labels on longer edges only
4. Omit labels on short edges

### 4.4 Irregular Shapes

**For non-convex or complex polygons:**
1. Use visual center (largest inscribed circle) instead of centroid
2. Test label positions with ray-casting to ensure inside
3. May need manual adjustment for extreme cases

---

## 5. IMPLEMENTATION PLAN

### 5.1 Backend Changes (pdfkitGeoPDF.js)

**New Functions Needed:**

```javascript
// 1. Calculate optimal stand number position
function calculateStandLabelPosition(parcelPolygon, standNumber, doc) {
  // Returns { x, y, fontSize }
}

// 2. Calculate beacon label position (inside parcel)
function calculateBeaconLabelPosition(beaconPos, parcelPolygon, beaconName, doc) {
  // Returns { x, y, angle: 0 } // Always horizontal
}

// 3. Calculate edge label positions (distance + direction)
function calculateEdgeLabelPositions(edge, parcelPolygon, doc) {
  // Returns { distance: {x, y, angle}, direction: {x, y, angle: 0} }
}

// 4. Validate label is inside parcel
function validateLabelInside(labelBox, parcelPolygon, buffer = 5) {
  // Returns boolean
}

// 5. Find largest inscribed circle (fallback for centroid)
function findLargestInscribedCircle(parcelPolygon) {
  // Returns { x, y, radius }
}
```

**Modified Functions:**

```javascript
// Update renderBeacons() to use new inside-parcel logic
function renderBeacons(doc, beacons, parcels, ...) {
  // Remove outside-parcel logic
  // Use calculateBeaconLabelPosition() for all beacons
}

// Update renderParcelLabels() to use new stand number logic
function renderParcelLabels(doc, parcels, ...) {
  // Use calculateStandLabelPosition()
  // Larger, bolder font
}

// Create new renderEdgeLabels() function
function renderEdgeLabels(doc, parcels, ...) {
  // For each parcel edge:
  //   - Render distance label (rotated)
  //   - Render direction label (horizontal)
}
```

### 5.2 Testing Strategy

**Test Cases:**

1. **Regular rectangular parcels** (e.g., 2283, 2284)
   - Verify stand number at centroid
   - Verify beacon labels inside, near corners
   - Verify edge labels midway along edges

2. **Small parcels** (< 100m²)
   - Verify font size reduction
   - Verify label omission if too small

3. **Narrow parcels** (width < 10m)
   - Verify labels on long edges only
   - Verify stand number at widest point

4. **Irregular parcels** (L-shaped, concave)
   - Verify visual center used instead of centroid
   - Verify all labels inside boundary

5. **Outside Figure**
   - Verify beacon labels OUTSIDE polygon
   - Verify edge labels OUTSIDE polygon

**Field Readability Test:**
- Print at 1:1000 scale on A0 paper
- Test readability from 0.5m distance (typical field use)
- Verify no label confusion between adjacent parcels

---

## 6. CONFIGURATION

### 6.1 Label Sizes (Scale-Dependent)

```javascript
const LABEL_CONFIG = {
  standNumber: {
    baseFontSize: 16,  // at 1:1000
    minFontSize: 10,
    maxFontSize: 20,
    scaleMultiplier: 1.0,
    font: 'Helvetica-Bold',
    color: '#000000'
  },
  beaconName: {
    baseFontSize: 9,   // at 1:1000
    minFontSize: 6,
    maxFontSize: 12,
    scaleMultiplier: 0.8,
    font: 'Helvetica',
    color: '#000000'
  },
  edgeDistance: {
    baseFontSize: 7.5,  // at 1:1000
    minFontSize: 6,
    maxFontSize: 10,
    scaleMultiplier: 0.7,
    font: 'Helvetica',
    color: '#000000'
  },
  edgeDirection: {
    baseFontSize: 6.5,  // at 1:1000
    minFontSize: 5,
    maxFontSize: 8,
    scaleMultiplier: 0.6,
    font: 'Helvetica',
    color: '#333333'  // Slightly lighter
  }
};
```

### 6.2 Offset Distances

```javascript
const OFFSETS = {
  beaconToLabel: 3,      // 3mm from beacon symbol to label
  edgeToDistance: 2.5,   // 2.5mm from edge to distance label
  distanceToDirection: 1.5, // 1.5mm from distance to direction label
  boundaryBuffer: 5      // 5mm safety buffer from parcel boundary
};
```

---

## 7. BENEFITS OF THIS APPROACH

### 7.1 Field Usability
✅ Surveyor standing in parcel sees all relevant labels  
✅ No confusion about which parcel a label references  
✅ Reduced eye movement and cognitive load  
✅ Faster beacon identification in the field  

### 7.2 Plan Clarity
✅ Clean, professional appearance  
✅ Reduced visual clutter  
✅ Clear parcel boundaries  
✅ Consistent labeling across all parcels  

### 7.3 Compliance
✅ Follows Zimbabwe cadastral standards  
✅ Aligns with ICA cartographic principles  
✅ Meets SI 727 requirements  
✅ Professional surveying practice  

---

## 8. NEXT STEPS

1. **Review this design** with surveying team
2. **Approve label hierarchy** and sizing
3. **Implement backend functions** (Phase 1: Stand numbers)
4. **Implement beacon labels** (Phase 2: Inside-parcel positioning)
5. **Implement edge labels** (Phase 3: Distance + Direction)
6. **Test with real data** (Shabani project)
7. **Refine based on feedback**
8. **Deploy to production**

---

## 9. OPEN QUESTIONS

1. Should direction labels be omitted for edges < 5m? (Too short to need bearing)
2. Should we show distances in feet as well as meters? (Zimbabwe practice?)
3. What to do with curved parcel boundaries? (Rare but possible)
4. Should stand numbers include "Stand" prefix or just number?

---

**Document prepared by:** Cascade AI  
**For review by:** Surveying team, cartographers, draughtsmen  
**Implementation target:** Q1 2026
