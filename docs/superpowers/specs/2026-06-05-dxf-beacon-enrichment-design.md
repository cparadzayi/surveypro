# DXF Beacon Enrichment — Sub-project #6 design

**Status:** approved 2026-06-05, ready for implementation
**Branch:** `feature/dxf-beacon-enrichment`
**Branched from:** `f64ab21` (3-v3 PDF-parity sweep merge)
**Predecessors:** 3-v2 `e218d7f`, 3-v3 `f64ab21` (contains the partial-#6 work at `b23d6b3`), 4a `46ce0e0`, 4b `90dbb4f`, 4c `4b000ba`, 4d `0799e1f`

## Goal

Bring the DXF generator's beacon labeling to full parity with the PDF generator (`pdfkitGeoPDF.js:renderBeacons`). The 3-v3 partial ship (`b23d6b3`) already handles the TEXT decision layer — UI label lookup, pattern fallback, suffix-only inside parcels, full names for control beacons. This sub-project adds the **placement** layer: POI-directed positioning, tight outside placement, edge-anchored fallback, splay grouping, leader lines, collision avoidance, and scale-dependent fonts/symbol sizing.

The user-visible effect is the same kind of step-change as 4d delivered for stand and edge labels: beacon labels on dense plans (e.g., the Maglas 587-beacon test case) stop overlapping each other and stop overlapping their parent parcels, and beacon symbols sit on top of any overlapping label text.

## Scope

| In scope | Out of scope |
|---|---|
| New `dxfBeaconPlacer.js` exposing 7 pure placement helpers + 1 collision registry factory | PDF's `nudgeOutsideFullBeaconLabelTowardCircle` finer-grain outside-label refinement |
| `placeSuffixLabelPOIDirected` — POI-bisector inside placement with perturbations and centroid fallback | PDF's bent leader Z-path search (`drawBeaconLeaderLine`) — DXF emits straight single-segment leaders |
| `tryTightFullBeaconLabelPosition` — right/left tight outside placement | Cross-layer collision detection between beacon labels and 4d's stand/edge labels |
| `calculateFullBeaconLabelOutsideOnEdge` — edge-anchored outside placement | Sub-project #5 multi-sheet tiling (separate sub-project) |
| Scale-dependent font sizing (PDF tier switch) | TITLE_BLOCK / BEACON_DESCRIPTION / ENDORSEMENT_BLOCK consolidation to `block-definitions.js` (separate parity work) |
| Logarithmic beacon symbol radius with 1.8–3.0 pt clamp | |
| Splay-group detection + connected-component closure + angular iteration order | |
| Collision registry (simple bbox list, no spatial index) | |
| Leader-line emission when label-to-beacon distance > 3·beaconRadius | |
| Deferred-circle rendering — beacon symbols emitted after all labels | |
| Integration into `dxfGenerator.js`'s beacon emission loop | |

## Architecture

### File structure

```
app-backend/src/services/
  dxfBeaconPlacer.js                NEW  — 7 exported pure functions + createCollisionRegistry factory
  dxfGenerator.js                   MOD  — replace fixed sizing; integrate placer; defer circles; emit leaders
  __tests__/
    dxfBeaconPlacer.test.js         NEW  — ~15 unit tests across 3 describe blocks
    dxfGenerator.integration.test.js MOD — ~5 new beacon-related integration tests appended
```

### `dxfBeaconPlacer.js` exports

| Export | Signature → returns | PDF source |
|---|---|---|
| `placeSuffixLabelPOIDirected` | `({beaconPos, polygon, labelWidth, labelHeight, beaconRadius, registry}) → {x, y}` (label top-left) | `pdfkitGeoPDF.js:5504-5597` |
| `tryTightFullBeaconLabelPosition` | `({beaconPos, labelWidth, labelHeight, beaconRadius, padding, incidentPolygons, registry}) → {x, y, position} \| null` | `:400-446` |
| `calculateFullBeaconLabelOutsideOnEdge` | `({beaconPos, incidentPolygons, labelWidth, labelHeight, beaconRadius, registry}) → {x, y} \| null` | port-adapted from PDF's similar helper |
| `pickBeaconFontSize` | `(scaleValue: number) → number` (PDF pt) | `:4800-4807` tier switch |
| `computeBeaconRadius` | `(scaleValue: number) → number` (paper-mm) | `:4629-4636` logarithmic, clamped 1.8–3.0 pt |
| `groupSplayBeacons` | `(beaconPositions: Map<string,{x,y}>, beaconRadius: number, proximityFloor: number) → Map<string, Array<{name,distance,pos}>>` (caller supplies floor — see algorithm section for units) | `:4693-4711` |
| `orderSplayGroupByAngle` | `(members: Array<{name,pos}>) → Array<{name,pos}>` (clockwise from group centroid) | new helper used in integration |
| `createCollisionRegistry` | `() → {add(rect), hasCollision(rect, padding=1), size, all}` | new — wraps 4a's `rectanglesOverlap` |

### DXF-specific adaptations

All primitives follow the same conventions as 4d (`dxfLabelPlacer.js`):

1. **`charWidthRatio = 0.55`** for the PDF's `doc.widthOfString` substitute. The DXF cannot query a rendered font width; this ratio matches Helvetica and the STYLE width factor 0.55 set in 3-v3 (`7b7fdf8`).
2. **DXF baseline-left anchor** returned directly. PDF returns top-left after `width/2`/`height/2` subtraction; DXF takes the raw insertion point.
3. **Polygon shape**: `Array<{x, y}>` in DXF ground-metres (consistent with 4a/4b/4c/4d).
4. **No `mm()` scaling inside the primitives**. The integration layer converts paper-mm constants to ground-metres before calling.

## Placement primitive algorithms

### `placeSuffixLabelPOIDirected`

1. Find the polygon ring vertex closest to `beaconPos` — call its index `beaconIdx`.
2. Compute the **interior bisector** at that corner:
   - Unit-normalize the two edge vectors from `beaconIdx` to its prev/next neighbors.
   - Sum them; if length < 1e-3 (straight 180° corner), use the perpendicular to one edge instead.
3. Orient toward interior: dot with `centroid − beacon`. Flip the bisector direction if negative.
4. Iterate candidate distances `[dMin, 1.3·dMin, 1.7·dMin, 2.2·dMin, 3.0·dMin, 4.0·dMin]` where `dMin = beaconRadius + labelHeight/2 + 1`.
5. For each distance, try angle perturbations `[0°, ±10°, ±20°, ±30°, ±45°]`.
6. A position **passes** when:
   - The label center is inside the polygon via 4a's `isPointInPolygon`.
   - `registry.hasCollision({x: cx - labelWidth/2, y: cy - labelHeight/2, width: labelWidth, height: labelHeight}, padding=1)` returns `false`.
7. **Fallback**: parcel centroid (shoelace). Caller's distance check (Section 4 integration) decides whether to draw a leader.

Returns `{ x: cx - labelWidth/2, y: cy - labelHeight/2 }`.

### `tryTightFullBeaconLabelPosition`

Two candidates only — `right` and `left`:

- `right`: `x = beaconPos.x + beaconRadius + padding`, `y = beaconPos.y - labelHeight/2`
- `left`: `x = beaconPos.x - beaconRadius - padding - labelWidth`, `y = beaconPos.y - labelHeight/2`

A candidate **passes** when:

- The label bbox is **outside all** `incidentPolygons` (via 4a's `rectangleOverlapsPolygon` inverted: an `isRectOutsidePolygons` helper that returns `true` when no polygon overlaps the rect).
- `registry.hasCollision(rect)` is `false`.

Returns `{ x, y, position: 'right' | 'left' }` or `null`.

### `calculateFullBeaconLabelOutsideOnEdge`

1. Across all `incidentPolygons`, find the polygon edge nearest `beaconPos`. Use 4a's `pointToLineDistance` for each edge segment; keep the minimum.
2. Project `beaconPos` onto that edge to get the foot point.
3. Compute the **outward normal** of the edge — direction away from the polygon interior. Verify via: pick the midpoint of the edge, test if `midpoint + normal·tinyStep` lies outside the polygon. If not, flip the normal.
4. Place the label bbox center at `foot + outwardNormal · (beaconRadius + labelHeight/2 + 1)`.
5. Validate the bbox: outside all `incidentPolygons`, and `registry.hasCollision` returns `false`.
6. If validation fails, walk along the edge direction in both directions in `labelWidth/4` steps up to `2·labelWidth` from the foot. If no walk position validates, return `null`.

Returns `{ x, y }` (top-left) or `null`.

### `pickBeaconFontSize`

```js
if (scaleValue <= 500)  return 6;
if (scaleValue <= 1000) return 6.5;
if (scaleValue <= 2000) return 7;
return 7.5;
```

Identical to `pdfkitGeoPDF.js:4800-4807`.

### `computeBeaconRadius`

```js
const baseRadiusMM = 0.75;
const scaleFactor = 1 + 0.15 * Math.log10(Math.max(500, scaleValue) / 500);
const PT_PER_MM = 1 / 0.352778;
let rPt = baseRadiusMM * PT_PER_MM * scaleFactor;
rPt = Math.max(1.8, Math.min(3.0, rPt));
return rPt * 0.352778;   // mm
```

Returns paper-mm. Integration layer multiplies by `mm(1)` to get ground-metres.

### `groupSplayBeacons`

- `proximityThreshold = max(scaledFloor, beaconRadius * 6)`. The PDF uses
  `max(18 pt, beaconRadius * 6)` where 18 pt is the PDF-unit floor and
  `beaconRadius` is already in PDF units. For the DXF — where positions are
  in ground-metres — the 18 pt floor must be converted via the **caller's**
  scale: `scaledFloor = 18 * PT_TO_MM_GEN * (S / 1000)` (i.e. mm at print
  scale → ground-metres). The integration layer in `dxfGenerator.js` passes
  the ground-metre value through; the primitive treats both arguments as
  already in the same coordinate space.
- Concrete signature: `groupSplayBeacons(beaconPositions: Map<string, {x,y}>, beaconRadiusGroundMetres: number, proximityFloorGroundMetres: number) → Map<...>`.
  The integration layer computes `proximityFloorGroundMetres = mm(18 * PT_TO_MM_GEN)` once and passes it in. This keeps the primitive **unit-agnostic** — it does no `mm()` conversion itself.
- For each beacon, scan every other beacon. A pair is "close" iff `Math.hypot(p1.x - p2.x, p1.y - p2.y) < proximityThreshold`.
- Emit a `Map` entry **only when** the beacon has ≥ 1 close neighbor. Beacons with no close neighbors are absent (they're not in any splay group).
- Each entry holds **direct close neighbors of that beacon** (per-beacon view). The integration layer stitches connected components via BFS.

### `orderSplayGroupByAngle`

1. Compute group centroid: arithmetic mean of member positions.
2. Sort members by `Math.atan2(pos.y - groupCy, pos.x - groupCx)` clockwise from angle 0.
3. Return the sorted member list.

### `createCollisionRegistry`

```js
export function createCollisionRegistry() {
  const rects = [];
  return {
    add(rect) { rects.push(rect); },
    hasCollision(rect, padding = 1) {
      for (const r of rects) {
        if (rectanglesOverlap(rect, r, padding)) return true;
      }
      return false;
    },
    get size() { return rects.length; },
    get all() { return rects.slice(); }, // for test introspection
  };
}
```

No spatial index. Linear scan over ~600 typical beacon labels is fine; per-add cost is O(n) and total cost O(n²) on the worst (Maglas-density) case ≈ 587 × 587 ≈ 350 k comparisons total — sub-millisecond.

## Integration changes in `dxfGenerator.js`

### Pre-loop setup

```js
import {
  placeSuffixLabelPOIDirected, tryTightFullBeaconLabelPosition,
  calculateFullBeaconLabelOutsideOnEdge, pickBeaconFontSize,
  computeBeaconRadius, groupSplayBeacons, orderSplayGroupByAngle,
  createCollisionRegistry,
} from './dxfBeaconPlacer.js'

const beaconFontSizePt  = pickBeaconFontSize(S);
const beaconLabelHeight = ptToGround(beaconFontSizePt, S);   // ground-metres
const beaconRadiusMM    = computeBeaconRadius(S);
const beaconRadiusG     = mm(beaconRadiusMM);                 // ground-metres
const beaconDiameterG   = beaconRadiusG * 2;

const beaconPositions = new Map();
for (const f of beacons?.features || []) { /* capeLoToDxfSouthUp + finite guard */ }

const incidentParcelsByBeacon = new Map();
for (const [name, pt] of beaconPositions) {
  const inc = [];
  for (const f of parcels?.features || []) {
    if (f.properties?.isOutsideFigure) continue;
    const coords = f.geometry?.coordinates?.[0];
    if (!Array.isArray(coords)) continue;
    const poly = coords.slice(0, -1).map(c => capeLoToDxfSouthUp(c[0], c[1]));
    if (poly.some(p => Math.abs(p.x - pt.x) < 0.01 && Math.abs(p.y - pt.y) < 0.01)) {
      inc.push(poly);
    }
  }
  if (inc.length > 0) incidentParcelsByBeacon.set(name, inc);
}

const PT_TO_MM_GEN = 25.4 / 72;
const proximityFloorG = mm(18 * PT_TO_MM_GEN);   // 18 pt floor in ground-metres
const splayMap = groupSplayBeacons(beaconPositions, beaconRadiusG, proximityFloorG);
const iterationOrder = computeIterationOrder(splayMap, beacons.features, beaconPositions);

const registry = createCollisionRegistry();
const deferredCircles = [];
```

`computeIterationOrder` (a small inline helper in `dxfGenerator.js`) walks splay components via BFS, orders each component by angle via `orderSplayGroupByAngle`, and stitches the orderings together with solo beacons. Pseudocode in Section 3 of the brainstorm.

### `labelDecision` refactor

Existing function returns `{x, y, text}` with position pre-computed. Refactor to return `{ text, isInsideParcel, polygon }` so the new placer owns position. The old `placeInsideParcel` / `placeOutsideParcel` helpers in `dxfGenerator.js` are deleted — superseded by `placeSuffixLabelPOIDirected` / `tryTightFullBeaconLabelPosition` / `calculateFullBeaconLabelOutsideOnEdge`.

```js
const labelDecision = (beaconName, pt) => {
  if (!beaconName) return null;
  const uiLabel = beaconLabelMap.get(beaconName);
  if (uiLabel) {
    if (uiLabel.labelType === 'suppressed') return null;
    const text = String(uiLabel.text || '');
    if (!text) return null;
    if (uiLabel.isInsideParcel && uiLabel.displayInParcel != null) {
      const polygon = parcelById.get(String(uiLabel.displayInParcel));
      if (polygon) return { text, isInsideParcel: true, polygon };
    }
    return { text, isInsideParcel: false, polygon: null };
  }
  const m = beaconName.match(/^(\d+)([A-Za-z]+)$/);
  if (m) {
    const polygon = parcelByStand.get(m[1]);
    if (polygon) return { text: m[2].toUpperCase(), isInsideParcel: true, polygon };
  }
  return { text: beaconName, isInsideParcel: false, polygon: null };
};
```

### Beacon emission loop

```js
const LEADER_THRESHOLD = beaconRadiusG * 3;

for (const feature of iterationOrder) {
  /* finite-coord guard, outside-figure-buffer filter — unchanged from current */
  const pt = capeLoToDxfSouthUp(rc[0], rc[1]);
  if (ofPolygon && !isWithinPolygonBuffer(pt.x, pt.y, ofPolygon, BEACON_BUFFER)) {
    beaconsSkipped++; continue;
  }
  trackPt(pt);
  const beaconType = feature.properties?.type || 'placed';
  const name = feature.properties?.pointId || feature.properties?.name || feature.properties?.beacon_name || '';

  deferredCircles.push({ x: pt.x, y: pt.y, type: beaconType, diameter: beaconDiameterG });
  beaconCount++;

  if (!name) continue;
  const decision = labelDecision(name, pt);
  if (!decision) continue;

  const labelText   = decision.text;
  const labelWidth  = labelText.length * beaconLabelHeight * 0.55;
  const labelHeightG = beaconLabelHeight * 1.2;

  let labelPos;
  if (decision.isInsideParcel && decision.polygon) {
    labelPos = placeSuffixLabelPOIDirected({
      beaconPos: pt, polygon: decision.polygon,
      labelWidth, labelHeight: labelHeightG,
      beaconRadius: beaconRadiusG, registry,
    });
  } else {
    const incident = incidentParcelsByBeacon.get(name) || [];
    const padding  = mm(0.8);
    labelPos = tryTightFullBeaconLabelPosition({
      beaconPos: pt, labelWidth, labelHeight: labelHeightG,
      beaconRadius: beaconRadiusG, padding,
      incidentPolygons: incident, registry,
    }) || calculateFullBeaconLabelOutsideOnEdge({
      beaconPos: pt, incidentPolygons: incident,
      labelWidth, labelHeight: labelHeightG,
      beaconRadius: beaconRadiusG, registry,
    }) || {
      x: pt.x + beaconRadiusG + mm(1),
      y: pt.y + beaconRadiusG + mm(1),
    };
  }

  registry.add({ x: labelPos.x, y: labelPos.y, width: labelWidth, height: labelHeightG });
  addText('BEACON_LABELS', labelPos.x, labelPos.y, labelText, beaconLabelHeight);

  // Leader line
  const lcx = labelPos.x + labelWidth / 2;
  const lcy = labelPos.y + labelHeightG / 2;
  if (Math.hypot(lcx - pt.x, lcy - pt.y) > LEADER_THRESHOLD) {
    const angle       = Math.atan2(pt.y - lcy, pt.x - lcx);
    const beaconEdgeX = pt.x - Math.cos(angle) * beaconRadiusG;
    const beaconEdgeY = pt.y - Math.sin(angle) * beaconRadiusG;
    const closestX    = Math.max(labelPos.x, Math.min(pt.x, labelPos.x + labelWidth));
    const closestY    = Math.max(labelPos.y, Math.min(pt.y, labelPos.y + labelHeightG));
    addLine('BEACON_LABELS', beaconEdgeX, beaconEdgeY, closestX, closestY);
  }
}

// Deferred-circle z-order: emit beacon symbols AFTER all labels.
for (const c of deferredCircles) {
  addBeaconSymbol('BEACONS', c.x, c.y, c.type, c.diameter);
}
```

## Error handling

| Case | Behavior |
|---|---|
| Beacon name missing | Skip label emission; still emit the symbol (deferred). Existing 3-v3 behavior, preserved. |
| `placeSuffixLabelPOIDirected` exhausts all candidates | Falls back to centroid internally. Caller's distance check decides on leader. |
| `tryTightFullBeaconLabelPosition` + `calculateFullBeaconLabelOutsideOnEdge` both return null | Final `(+offset, +offset)` fallback in the integration loop emits something — never silently skip. |
| `incidentParcelsByBeacon` lookup misses (control beacon at a non-parcel point) | `tryTightFullBeaconLabelPosition` runs with `incidentPolygons: []`, treating the area as fully open; first candidate (right) passes unless collision blocks it. |
| Polygon degenerate (< 3 vertices) | All placers check; centroid fallback used. |
| Scale ≤ 0 or invalid | `pickBeaconFontSize` and `computeBeaconRadius` clamp at `Math.max(500, scaleValue)`. |

## Testing strategy

### `dxfBeaconPlacer.test.js` — ~15 unit tests, 3 describe blocks

**describe('placement primitives')** (7 tests)

1. `placeSuffixLabelPOIDirected` — square parcel, beacon at corner → position inside polygon, on the interior bisector direction.
2. `placeSuffixLabelPOIDirected` — collision: a registered label sits at the primary POI position → returns a perturbed alternative.
3. `placeSuffixLabelPOIDirected` — degenerate (< 3 unique vertices) → centroid fallback.
4. `tryTightFullBeaconLabelPosition` — beacon left of parcel → returns `right` candidate; the `left` candidate would be inside the parcel and rejected.
5. `tryTightFullBeaconLabelPosition` — both sides blocked (incidentPolygons cover both, or registry has overlapping labels in both spots) → returns `null`.
6. `calculateFullBeaconLabelOutsideOnEdge` — single rectangle parcel, beacon at the center of one edge → label sits outside that edge in the outward-normal direction.
7. `calculateFullBeaconLabelOutsideOnEdge` — no incident polygon → `null`.

**describe('sizing helpers')** (3 tests)

8. `pickBeaconFontSize` tier switch: scales 500 / 1000 / 2000 / 5000 → 6 / 6.5 / 7 / 7.5.
9. `computeBeaconRadius` monotone-increasing with scale; clamped to 1.8–3.0 pt window in mm equivalents.
10. `computeBeaconRadius` at S=500 returns ~0.75 mm (base case matches PDF).

**describe('splay grouping + collision registry')** (5 tests)

11. `groupSplayBeacons` — two beacons closer than threshold → both in each other's neighbor list; far beacon absent.
12. `groupSplayBeacons` — threshold uses `max(proximityFloor, beaconRadius·6)`; verify the floor wins when beaconRadius is small (test passes a small radius and a large floor) and the radius-based threshold wins when radius is large (large radius, small floor).
13. `orderSplayGroupByAngle` — three beacons at known angles around the centroid → returned clockwise from angle 0.
14. `createCollisionRegistry` — `add` then `hasCollision` returns `true` for overlapping rect; `false` for non-overlapping.
15. `createCollisionRegistry` — `padding=1` catches edge-touching rects; `padding=0` does not.

### `dxfGenerator.integration.test.js` — ~5 new tests appended to the existing beacon describe block

```js
test('beacon symbols emit AFTER all labels (deferred-circle z-order)', () => {
  // 2 parcels + 2 beacons fixture. Parse DXF stream; assert all CIRCLE
  // entities for the beacons appear AFTER any TEXT entity on BEACON_LABELS.
})

test('beacon radius scales with scale (logarithmic, clamped)', () => {
  // Generate at S=500 and at S=5000. CIRCLE group code 40 differs;
  // both values fall in the 1.8-3.0 pt clamp band in mm equivalents.
})

test('beacon font size scales with scale (PDF tier switch)', () => {
  // Generate at S=500 → TEXT entities on BEACON_LABELS use height
  // ptToGround(6, S). At S=1500 → ptToGround(7, S).
})

test('leader line emitted when label-to-beacon distance exceeds threshold', () => {
  // Force POI to fall back to centroid (use a parcel where POI exhausts
  // candidates). Verify an extra LINE entity appears on BEACON_LABELS.
})

test('splay group iteration order is deterministic and overlap-free', () => {
  // 3 beacons clustered within proximity threshold + 1 isolated. Run
  // generator twice; identical output. Close trio's labels don't share
  // exact x/y coordinates.
})
```

### Regression bar

`cd app-backend && npm test -- --testPathPatterns="dxf"` should produce:

- 266 baseline tests continue to pass (with potential adjustments to existing beacon tests if they assert on radius or font size — discovered during execution).
- ~15 new `dxfBeaconPlacer.test.js` tests.
- ~5 new beacon integration tests.

**Target: ~286 tests passing.**

## What's explicitly out of scope

- **PDF's `nudgeOutsideFullBeaconLabelTowardCircle`**: a finer-grained refinement of outside labels. `calculateFullBeaconLabelOutsideOnEdge` handles most cases for the first parity pass.
- **PDF's bent leader Z-path search** (`drawBeaconLeaderLine` at `:5614+`): DXF emits single-segment straight leaders. CAD viewers don't crop on parcel boundaries the way clipped PDF regions do.
- **Cross-layer collisions** between beacon labels and 4d's stand/edge labels: the registry only tracks beacon labels among themselves. Cross-layer collisions are a follow-up if visible artifacts surface.
- **TITLE_BLOCK / BEACON_DESCRIPTION / ENDORSEMENT_BLOCK consolidation to `block-definitions.js`**: separate parity work, not blocking this sub-project.

## Open questions

None as of approval. All clarifying questions resolved during brainstorming:

- Scope decomposition → single sub-project.
- Collision detection → simple bbox registry per `generateDXF` call.
- Symbol sizing → adopt PDF's logarithmic scaling verbatim.
- Leader trigger → distance threshold `> 3·beaconRadius`.
- Splay handling → detect groups, sort by angle, place sequentially with collision avoidance.
- Implementation approach → new `dxfBeaconPlacer.js` module + integration in `dxfGenerator.js`.

## References

- 3-v3 partial-#6 ship: `b23d6b3` in merge `f64ab21` — `labelDecision`, `placeInsideParcel`, `placeOutsideParcel`, UI label lookup, pattern fallback.
- 4d label placer: `app-backend/src/services/dxfLabelPlacer.js` — same shape and conventions as the new module.
- 4a geometry primitives: `app-backend/src/services/dxfGeometry.js` — `isPointInPolygon`, `rectanglesOverlap`, `rectangleOverlapsPolygon`, `pointToLineDistance` are all used.
- PDF reference: `pdfkitGeoPDF.js:renderBeacons` at line 4564 and helpers `placeSuffixLabelPOIDirected` `:5504`, `tryTightFullBeaconLabelPosition` `:400`, `drawBeaconLeaderLine` `:5614`.
- Memory: `surveypro-pdfkit-rebaseline-status.md` for sub-project sequencing.
- Memory: `pdfkit-block-placement-uses-topological-scan.md` for placement primitives lineage.
