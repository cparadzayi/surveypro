# Beacon Label Placement — East-West Orientation & POI-Directed Placement

**Date:** 2026-04-16  
**Status:** Approved for implementation  
**Scope:** `app-backend/src/services/pdfkitGeoPDF.js`, `app-backend/src/services/pdfkitLabeling.js`

---

## Problem Statement

Generated survey plan PDFs show beacon labels oriented along parcel edge angles, which produces near-vertical text on narrow or diagonally-oriented parcels (e.g. stands 2031–2034). Labels that read up or down the page are difficult to read in the field at map scale. Additionally, suffix labels are placed near cramped corner ends rather than in the wider whitespace within each parcel.

---

## Goals

1. All beacon-related labels maintain a **general east-west (horizontal) reading direction** — never oriented more than ±45° from horizontal.
2. Every label is **wholly contained within its parcel polygon** (all four bounding-box corners inside).
3. No label **overlaps a parcel boundary line**.
4. Beacon suffix labels placed in the **widest available interior whitespace**, not the tightest corner end.
5. Field readability at printed map scale is the primary success criterion.

---

## Label Types in Scope

### Type 1 — Stand Number Labels
Large parcel designation centred inside the polygon (e.g. `2031`, `2043A`, `2043E`).  
One per parcel. Rendered by `renderDeferredStandLabels()` in `pdfkitLabeling.js`.

### Type 2 — Beacon Suffix Labels
Small single-letter or short-code label placed near each corner beacon circle (e.g. `A`, `B`, `Bc`, `Bd`).  
One per beacon. Rendered by `renderBeacons()` in `pdfkitGeoPDF.js`.

---

## Design Decisions

| Concern | Decision |
|---|---|
| Max rotation from horizontal | **±45°** for both label types |
| Placement anchor | **Pole of Inaccessibility (POI)** — widest interior point, not arithmetic centroid |
| Type 1 fallback when nothing fits | Centroid-drift toward POI; reduce font to 7pt floor |
| Type 2 placement strategy | POI-directed inward push from corner; label stays near corner if room |
| Type 2 long-drift trigger | Leader line when label travels beyond threshold (1.5× beacon spacing) |
| Leader line style | Solid, 75% of boundary line weight, arrowhead at beacon end |
| Leader arrowhead | Points at beacon circle, tip stops 1pt short of circle edge |
| Leader bend nodes | No visual markers — clean polyline only |
| Leader bends | Up to 2 bends, chosen to minimise leader length inside polygon |
| Beyond 2 bends | Reduce font 1pt and retry; do not add more bends |

---

## Algorithm: Pole of Inaccessibility (POI)

The POI is the point inside a polygon furthest from all edges — the "widest" interior point. For regular rectangles this equals the centroid; for narrow or irregular shapes it is meaningfully different and provides better label clearance.

**Implementation:** Use an iterative grid-refinement approach (binary search on a bounding-grid, sufficient for cadastral polygons at PDF coordinate scale). Starting cell size = bounding-box diagonal / 8; refine 4× to sub-point precision. This runs in < 1ms per parcel at typical cadastral scales.

---

## Type 1 — Stand Number Label Algorithm

### Normal search
1. Compute POI for the parcel polygon (PDF coordinate space).
2. Build candidate positions: POI first, then a 5×5 grid of offsets scaled to 30% of the parcel's minimum bounding dimension.
3. For each candidate position, try font sizes in descending order: `[standFontSize, standFontSize-1, standFontSize-2, 7]`.
4. For each (position, font-size) pair, try angles `[0°, longestEdgeAngle]` — but **clamp longestEdgeAngle to ±45° from horizontal**. If `|longestEdgeAngle| > 45°`, skip it (do not try the unclamped angle).
5. Accept the first candidate that passes both:
   - All four rotated label corners inside the polygon (`isLabelBboxInsidePolygon`)
   - No collision with already-placed labels (`collisionDetector.hasCollision`)

### Centroid-drift fallback (nothing passed normal search)
6. Take the highest-scoring candidate from the normal search (closest to POI, largest font).
7. Generate 10 interpolated positions along the straight line from that candidate to the POI.
8. At each step, test polygon containment and collision. Accept first passing position.
9. If the POI itself also fails: reduce font by 1pt and repeat from step 1. Stop at 7pt.
10. **Hard fallback:** place at POI at 7pt; enforce centre-inside-polygon only (corners may graze boundary on extreme slivers). Every parcel must have a visible label.

---

## Type 2 — Beacon Suffix Label Algorithm

### Placement direction
Type 2 labels are **always rendered at 0° (horizontal)**. The ±45° clamp governs only the *direction of the inward push* from the corner — not the label's text rotation angle.

1. Compute POI for the parcel.
2. Direction vector = beacon corner position → POI.
3. Compute the angle of this vector from horizontal.
4. **Clamp to ±45°**: if `|angle| > 45°`, rotate vector to ±45° (preserve sign of original y-component).
5. This clamped unit vector is the **inward push direction**.

### Short-push path (no leader)
6. Try placing the label at distances `[d_min, d_min×1.5, d_min×2]` from the beacon along the clamped direction, where `d_min = beaconRadius + labelHeight/2 + 1pt clearance`.
7. At each distance, test: all 4 label corners inside polygon + no collision. Use font size from scale-based sizing; try one size down if needed.
8. If any short-push position passes → place label there, no leader line. Done.

### Long-drift path (leader line triggered)
9. Threshold for leader trigger: `1.5 × median beacon spacing` in the parcel (or `20% of the parcel's longest axis` if only one beacon).
10. Continue trying positions along the clamped-direction line, stepping toward the POI.
11. At each step, also try ±10° and ±20° angular perturbations (still within ±45° band).
12. Accept first position that passes containment + collision. A leader line will be drawn.
13. If nothing along the clamped line fits, reduce font 1pt and retry from step 6. Floor = 7pt.

### Hard fallback
14. Place at the POI itself; leader line always drawn from POI back to beacon.

---

## Leader Line Specification

Drawn only when Type 2 label has taken the long-drift path (step 12+) or hard fallback (step 14).

### Visual properties
- **Stroke weight:** 75% of the boundary line weight for this parcel (boundary weight is scale-dependent; leader weight = `boundaryWeight × 0.75`)
- **Line style:** solid
- **Arrowhead:** filled solid triangle, at the beacon end only, pointing toward beacon centre
- **Arrowhead tip position:** `beaconCentre − (beaconRadius + 1pt) × unitVector` — stops 1pt outside the beacon circle, never overlaps it
- **Bend node markers:** none — clean polyline only

### Geometry construction
**Segment 1 (horizontal stub):** extends horizontally from the label's nearest edge for `2 × labelHeight`. Direction: whichever horizontal direction points toward the beacon.

**Bend point selection (up to 2 bends):**
- Generate candidate bend points on a horizontal sweep line at `y = lerp(labelY, beaconY, t)` for t ∈ {0.3, 0.5, 0.7}.
- For each candidate, build a 2-segment polyline (stub → bend → beacon approach) and test that all segments lie wholly inside the polygon.
- Choose the bend point that minimises total polyline length and passes the inside-polygon test.
- If no single-bend path stays inside the polygon, add a second bend: split the diagonal into two segments with an intermediate bend point, chosen by the same sweep. Maximum 2 bends total.
- If even a 2-bend path cannot stay inside the polygon: reduce font 1pt and retry label placement (reduces label-to-POI distance, making a simpler path feasible).

**Final segment:** diagonal from last bend point to arrowhead tip (beacon approach).

---

## Angle Clamping — Reference

```
rawAngle = atan2(dy, dx) * (180/π)

clampedAngle:
  if rawAngle > 45°  → 45°
  if rawAngle < -45° → -45°
  else               → rawAngle

// Also normalise to keep text upright (never upside-down):
if clampedAngle > 90°  → clampedAngle -= 180°
if clampedAngle < -90° → clampedAngle += 180°
```

The upright-normalisation step already exists in the codebase; the ±45° clamp replaces the current unconstrained `longestEdgeAngle` usage.

---

## Collision Detection Scope

- Type 1 labels check against: all edge labels (distance + bearing), other stand labels.
- Type 2 labels check against: edge labels, stand labels, and other Type 2 labels already placed in the same parcel.
- Leader lines are **not** registered as collision regions (they are thin and their path is chosen to avoid labels).

---

## Files Changed

| File | Change |
|---|---|
| `pdfkitLabeling.js` | Replace `longestEdgeAngle` with ±45°-clamped angle; add POI computation; implement centroid-drift fallback for Type 1 |
| `pdfkitGeoPDF.js` | Replace edge-following Type 2 placement with POI-directed push; add short-push / long-drift branching; implement leader line drawing |
| `pdfkitGeoPDF.js` (new helper) | `computePOI(pdfCoords)` — iterative grid refinement |
| `pdfkitGeoPDF.js` (new helper) | `buildLeaderLine(labelPos, beaconPos, polygon, boundaryWeight)` — returns polyline points + arrowhead spec |

---

## Out of Scope

- Edge labels (distance and bearing strings on boundary lines) — these must follow their edge by definition.
- Outside Figure vertex labels — these are placed outside all parcels and have their own logic.
- DXF export (`dxfGenerator.js`) — separate ticket.

---

## Success Criteria

1. No stand label or beacon suffix label appears rotated more than 45° from horizontal on any generated plan.
2. Every label's bounding box lies wholly inside its parcel polygon (verified by `isLabelBboxInsidePolygon`), except hard-fallback slivers where centre-inside is enforced.
3. Labels for narrow parcels (2031–2034 style) appear in the wider mid-section of the parcel, not crammed at narrow ends.
4. Leader lines, where drawn, are solid, correctly weighted, and arrowheads stop short of beacon circles.
5. No regression in label placement for wide, well-proportioned parcels.
