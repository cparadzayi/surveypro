# Intelligent Sheet Size and Scale Selection

## Overview
The system automatically selects the optimal SI 727 compliant sheet size (Small/Medium/Large) and standard scale to ensure:
1. **All blocks fit without truncation** (Schedule of Areas, Outside Figure Data, Beacon Description)
2. **Map coverage is maximized** within the available plot window
3. **Labels use collision avoidance** so MapLibre intelligently manages dense areas

## How It Works

### 1. Iterative Sheet Size Testing
The optimizer tries sheet sizes in order: **Small → Medium → Large**

For each sheet size, it:
- Calculates the **plot window** (map area minus reserved space for blocks)
- Determines the **minimum scale** needed to fit the Outside Figure extent
- Rounds up to the nearest **standard scale** (1:500, 1:1000, 1:2000, 1:2500, 1:5000, etc.)
- **Validates that all blocks fit** without truncation

### 2. Block Height Validation
Before accepting a sheet size, the system estimates the total height needed for:

- **Schedule of Areas**: `10mm header + (parcelCount × 6mm per row)`
- **Outside Figure Data**: `15mm header + (edgeCount × 5mm per row)`
- **Beacon Description**: `10mm header + (beaconGroupCount × 3.5mm × 3 lines)`

If `totalNeededHeight > availableLeftHeight`, the system **rejects** that sheet and tries the next larger size.

### 3. Standard Scales
The system uses cadastral-standard scale denominators:
- 500, 1000, 1250, 2000, 2500, 5000, 10000, 12500, 20000, 25000, 50000

It selects the **smallest standard scale** that fits the Outside Figure extent within the plot window.

### 4. Label Collision Avoidance
All MapLibre label layers use:
```javascript
'text-allow-overlap': false,  // Enable collision detection
'text-ignore-placement': false,
'text-optional': true  // Hide if crowded (for outside labels)
```

This means:
- **Inside parcel labels** (suffix letters like "A", "C") are always attempted
- **Outside parcel labels** (full beacon names) are hidden if they would collide
- **Stand labels** use variable anchors to find the best non-colliding position

### 5. Export-Time Label Sizing
During PDF export, the system temporarily:
- Computes `minLabelPx` to achieve **≥ 3.5mm printed height**
- Applies this minimum to all label layers
- Restores original sizes after capture

Formula:
```
mmPerPixel = mapFrameWidthMm / canvasWidthPx
minLabelPx = max(10, ceil(3.5mm / mmPerPixel))
```

## Console Output
During export, you'll see:
```
[ScaleOptimizer] Sheet Small too small: need 180mm, have 150mm
[ScaleOptimizer] ✅ Sheet Medium fits: blocks need 180mm, available 200mm
```

## Fallback Behavior
If no sheet size can fit all blocks without truncation:
- System selects **Large** sheet
- Uses the **smallest scale** that fits the map extent
- **Tables are row-limited** to prevent multi-page break (with console warning)

## User Control
Users can override auto-selection by manually choosing:
- Sheet size (Small/Medium/Large)
- Orientation (Landscape/Portrait)
- Scale (from standard list)

But the **recommended approach** is to use auto-selection, which guarantees professional output.

## SI 727 Compliance
All sheet sizes and margins comply with SI 62 of 1977 (Zimbabwe Survey Regulations):
- **Small**: 500×400mm
- **Medium**: 800×500mm  
- **Large**: 1000×800mm
- **Margins**: 50mm (left/top/bottom), 150mm (right for endorsements)

## Label Density Handling
The system does **not** guarantee every label is visible—that would require either:
- Leader lines (rejected as too noisy)
- Indexed labels (B1, B2, etc. with table lookup)
- Multi-sheet plans

Instead, it uses **professional collision avoidance**: labels appear where they fit, and crowded areas show fewer labels. This is standard practice for cadastral plans at appropriate scales.

If you need **every beacon labeled**, consider:
1. Using a **larger sheet** (more space = more labels fit)
2. Using a **smaller scale** (1:1000 instead of 1:2000 = beacons further apart)
3. Implementing **indexed labels** (future enhancement)
