# Gauss Lo (Cape Lo 31°) Coordinate System Reference

## CRITICAL: Single Source of Truth for Coordinate Handling

This document defines the **permanent, authoritative** rules for handling Gauss Lo coordinates across the entire SurveyPro application.

---

## Coordinate System Basics

**Gauss Lo (Cape Lo 31°) is a SOUTH-ORIENTED coordinate system:**

- **Y coordinate = Westing** (increases westward, typically ~97,000 range)
- **X coordinate = Southing** (increases southward, typically ~2,247,000 range)
- **Coordinate format**: `[Y, X]` = `[Westing, Southing]`
- **Bearings**: Measured **clockwise from South** (0° = South, 90° = West, 180° = North, 270° = East)

---

## Standard Bearing Calculation

**ALWAYS use this formula for bearing calculations:**

```javascript
// Calculate differences
const dY = Y2 - Y1;  // Westing difference
const dX = X2 - X1;  // Southing difference

// Calculate bearing (south-oriented, clockwise from South)
let bearing = Math.atan2(dY, dX) * (180 / Math.PI);
if (bearing < 0) bearing += 360;
```

**DO NOT use `atan2(dX, dY)` - this is INCORRECT for Gauss Lo!**

---

## Data Structure Conventions

### Frontend Edge Data Structure

**Property names in `outsideFigureData.edges[]`:**
- `edge.x` contains **Southing** values (~2,247,000)
- `edge.y` contains **Westing** values (~97,000)

**Note:** The property names match the coordinate meaning (x=Southing, y=Westing), but when displaying in tables or PDFs, you must ensure the correct column headers.

### Backend PDF Table Display

**When displaying in Outside Figure Data table:**
- **Y column** should show Westing values (~97,000)
- **X column** should show Southing values (~2,247,000)

**Backend fix applied in `pdfkitGeoPDF.js` line 7276-7277:**
```javascript
// SWAP property access to get correct values in correct columns
const edgeY = edge.to?.x ?? edge.x;  // Get Westing value (from edge.x property) for Y column
const edgeX = edge.to?.y ?? edge.y;  // Get Southing value (from edge.y property) for X column
```

---

## Component-Specific Implementations

### ✅ SurveyPlanMapView.vue (CORRECT)
**Line 3670:**
```javascript
// Bearing calculation (south-oriented)
let bearingDeg = Math.atan2(dY, dX) * (180 / Math.PI)
```

### ✅ MapLibreAreaView.vue (FIXED)
**Line 3433:**
```javascript
// CRITICAL: Gauss Lo (Cape Lo) is SOUTH-ORIENTED
// Bearing is measured clockwise from South: atan2(dY, dX)
let bearing = Math.atan2(dy, dx) * (180 / Math.PI);
```

### ✅ pdfkitGeoPDF.js Backend (FIXED)
**Line 7276-7277:** Coordinate swap for correct table display

---

## Validation Checklist

When working with coordinates, always verify:

1. ✅ Bearing calculation uses `atan2(dY, dX)` (NOT `atan2(dX, dY)`)
2. ✅ Y values are in ~97,000 range (Westing)
3. ✅ X values are in ~2,247,000 range (Southing)
4. ✅ Bearings are measured clockwise from South
5. ✅ Distance calculations use `sqrt(dY² + dX²)`
6. ✅ Table displays show Y column = Westing, X column = Southing

---

## Common Mistakes to Avoid

❌ **WRONG:** `atan2(dX, dY)` - This gives north-oriented bearings
❌ **WRONG:** Swapping Y and X values in table displays
❌ **WRONG:** Using property names directly without understanding their actual values
❌ **WRONG:** Assuming north-oriented coordinate system

---

## References

- SI 727: Surveying and Mapping Standards
- Gauss Conformal Projection (South African Coordinate Reference System)
- Cape Lo 31° (EPSG:22291)

---

**Last Updated:** 2025-12-30
**Applies to:** All frontend and backend components handling Gauss Lo coordinates
