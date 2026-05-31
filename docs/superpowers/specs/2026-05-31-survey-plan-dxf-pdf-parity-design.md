# Survey-Plan DXF / PDF Parity — Design

**Date:** 2026-05-31
**Status:** Approved (design)
**Component:** `app-backend` — `services/dxfGenerator.js` (main); minor surface in `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` and `app-frontend/src/services/geopdf.ts`.

## Purpose

The Lite-tier General Plan PDF (produced by `professionalSurveyPlanExporter.ts`) is
the canonical deliverable. Surveyors also need to fine-tune the plan in CAD before
submitting to the Surveyor-General, so a DXF export already exists
(`📐 Export AutoCAD DXF` → `POST /api/geopdf/dxf` → `services/dxfGenerator.js`).
However, the current DXF is structurally thinner than the PDF: missing north arrow,
scale bar, coordinate grid, beacon descriptions, margin guides, full endorsement
zone, and several title-block fields. Its geometry is also rotated 180° relative
to the printed PDF.

Goal: bring the DXF to **1:1 layout parity with the PDF, in the same orientation
(south-up, matching the printed sheet)**, so the surveyor opens the DXF and sees
exactly what they will submit. The PDF remains canonical; the DXF is the editing
handle.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| DXF scope vs PDF | 1:1 mirror — every element on the PDF gets an equivalent DXF entity |
| Orientation | South-up: DXF X = Cape Lo Y (westing+), DXF Y = Cape Lo X (southing+) |
| DXF version | R12 (AC1009) — unchanged, already in production |
| File structure | Extend `dxfGenerator.js` in place (no new modules); accept growth from ~814 to ~1,400 lines |
| Multi-sheet tiling | Out of scope — single DXF only; PDF remains canonical for tiled plans |
| UCS for CAD users | One UCS entry `CAD_NORTH_UP` defined; surveyor toggles via CAD command line |

## Conventions (carried)

Cape Lo P(Y, X): Y = Westing, X = Southing. Bearings are South-oriented. Page
margins L=50 mm, T=50 mm, B=50 mm, R=150 mm (existing — endorsements live in
the right margin). Paper sizes: ISO_A0 / ISO_A1 / ISO_A2 (existing).

## Architecture (`app-backend/src/services/dxfGenerator.js`)

Single-file change. Three structural moves:

1. **Coordinate-transform swap.** Replace `capeLoToAutoCAD(y, x)` with
   `capeLoToDxfSouthUp(y, x)`. The body drops the sign flips: `return { x: y, y: x }`
   (after `normalizeCapeLoYX`). Highest-blast-radius edit; ~20 internal call
   sites take the new function. The old function is **deleted** so no caller can
   accidentally retain east-up output.

2. **Six new emitters** added inside `generateDXF()`'s closure: `addNorthArrow`,
   `addScaleBar`, `addGridReferences`, `addBeaconDescription`, `addMarginGuides`,
   plus an expanded `drawEndorsementZone()` (replaces the existing stub) and an
   enhanced `addBeaconSymbol(layer, cx, cy, type, sizeM)` that differentiates
   placed vs found beacons. Each new emitter uses the existing primitives
   (`addPolyline / addCircle / addText / addLine / addRect`).

3. **Four new layers** appended to the `layers` array: `NORTH_ARROW` (color 7),
   `SCALE_BAR` (color 7), `GRID` (color 8 dark grey), `MARGIN_GUIDES` (color 8).
   The existing 8 layers stay. One UCS entry `CAD_NORTH_UP` added in the TABLES
   section between LAYER and BLOCKS.

4. **One private helper exported.** `parseScaleDenom` becomes
   `export function parseScaleDenom` so Layer 1 unit tests can target it
   directly. No behavioural change.

After the orientation swap, the existing page-zone variables (`cntT`, `cntB`,
`pageT`, `pageB`) automatically position the title block at the south side of
the sheet (= top of the printed sheet) without any rewrite to the chrome
layout — the layout is symmetric in CAD Y; only the geometry transform's sign
choice decides which physical end "top" corresponds to.

## Components

### a. Coordinate transform

```js
function capeLoToDxfSouthUp(capeY, capeX) {
  const [y, x] = normalizeCapeLoYX(capeY, capeX);
  return { x: y, y: x };
}
```

The `normalizeCapeLoYX` guard against accidentally-swapped Y/X inputs stays in
front. **Sanity check inside the function:** for a typical Cape Lo input
(`capeY > 0` Westing, `capeX > 0` Southing), the result should have both
`x > 0` and `y > 0`. If the result yields `x < 0` for a positive Westing input
(which would only happen if a stale `x = -y` formula sneaked through during
code review), log a one-time error and continue.

### b. Drawing-area emitters

**`addNorthArrow(layer, cx, cy, sizeM)`** — South-pointing arrow (page is
south-up, so the arrow points toward +DXF-Y).
- Three LINEs forming the arrowhead triangle: apex at `(cx, cy + size/2)`,
  base from `(cx − 0.3·size, cy − size/2)` to `(cx + 0.3·size, cy − size/2)`.
- One TEXT entity `"S"` at `(cx, cy + size/2 + 5 mm)`, centred, height `hSub`.
- Anchored at `(cntR − mm(15), cntT − mm(20))`. Size = 20 mm at paper scale.
- Cites: matches `professionalSurveyPlanExporter.ts:drawNorthArrow`.

**`addScaleBar(layer, cx, cy, scaleDenom, totalLengthM)`** — Graduated horizontal
bar matching the PDF's `drawScaleBar`.
- Centreline LINE; four vertical tick LINEs at 0 / ¼ / ½ / 1 of the length;
  two outer-rect LINEs forming the bar outline.
- TEXT entities at each tick with metre values; TEXT below reading
  `"1:<scaleDenom>"`.
- Anchored at `(cntR − mm(40), cntB + mm(20))`. Length picked to round to a
  whole-metre value at the chosen scale.

**`addGridReferences(layer, drawL, drawR, drawT, drawB, gridStepM)`** —
Coordinate-grid ticks along the four drawing borders; no interior grid lines.
- For each Cape Lo Y at multiples of `gridStepM` falling inside `[drawL, drawR]`:
  short LINE (5 mm tick) extending inward from the top + bottom drawing borders;
  TEXT at the outside of each tick with the rounded coordinate.
- Same for each Cape Lo X at multiples of `gridStepM` falling inside
  `[drawB, drawT]`, with ticks on the left + right borders.
- `gridStepM` defaults to a round value derived from the scale: 100 m for
  ≤ 1:500, 250 m for ≤ 1:1000, 500 m for ≤ 1:2500, 1 km otherwise — matches
  `drawGridReferences` in the PDF exporter.

### c. Beacon-symbol differentiation

**`addBeaconSymbol(layer, cx, cy, type, sizeM)`** replaces the single-circle
behaviour:

- `type === 'placed'` — solid filled circle. R12 has no HATCH, so emit one
  CIRCLE plus 8 short radial LINEs from `(cx, cy)` outward to `r` at 45°
  intervals; reads as "filled" at typical zoom.
- `type === 'found'` — open CIRCLE plus a `+` (two LINEs through the centre,
  one horizontal, one vertical, length = `1.4 · r`).

Reads `properties.type` from the beacon GeoJSON features. Falls back to the
current single-CIRCLE style when `type` is absent.

### d. Bottom-zone additions

**`addBeaconDescription(layer, zoneL, zoneR, zoneTop, zoneBottom, beaconGroups)`** —
Header TEXT (`"BEACON DESCRIPTIONS"`, bold) at `zoneTop`; one TEXT per group
entry (`"<points>: <description>"`); thin separator LINE below the header.
Placed in a slim sub-zone below the existing `SCHEDULE OF AREAS` block in the
bottom-left column.

### e. Endorsement zone (expanded)

`drawEndorsementZone(zoneL, zoneR, zoneTop, zoneBottom)` replaces the existing
stub. Contents, top to bottom:

1. **SG approval header** — `"APPROVED FOR LODGEMENT"` (bold); three blank
   signature LINEs labelled `Date`, `Surveyor-General`, `Reference`.
2. **Dispensation certificate slot** — single TEXT line:
   `"Dispensation Certificate No. ............ relates to this plan"`.
3. **Plan number stamp box** — RECT 30×15 mm with `"Plan No.: "` label inside.
4. **Prior diagram references** — TEXT list from `metadata.priorDiagrams[]`;
   falls back to a single line `"Prior diagrams: None"` when the list is empty.
5. **Surveyor certification footer** — TEXT line:
   `"I, <surveyorName> (PLS <license>), certify this plan correct"`; followed
   by a blank signature LINE.

Each item uses height `hBody`; left-aligned to `zoneL + mm(3)`.

### f. Title-block field completion

Inside the existing top zone (`txC`, `ty`), append five TEXT entities for
fields the PDF includes that the DXF currently drops:

- `metadata.firm`
- `metadata.licenseNumber`
- `metadata.parentProperty`
- `metadata.wholePortion`
- `metadata.district` (ensure consistent across paths)

Each extends the existing `if (metadata.surveyOf)` / `if (metadata.township)`
chain. Height = `hSub`, centred on `txC`.

### g. Margin guides

**`addMarginGuides(layer, pageL, pageR, pageT, pageB, mL, mT, mB, mR)`** —
Drafting marks emitted on the `MARGIN_GUIDES` layer:

- Four short tick LINEs (~5 mm) at each corner of the content area.
- Tiny crop-mark crosses at the four corners of the page (two crossing LINEs
  per corner, ~3 mm each leg).

Matches the PDF's `drawMarginGuides`.

### h. UCS table entry

In the TABLES section between LAYER and BLOCKS, emit one UCS table:

```
  0 TABLE
  2 UCS
 70 1
  0 UCS
  2 CAD_NORTH_UP
 70 0
 10 0.0
 20 0.0
 30 0.0
 11 -1.0
 21 0.0
 31 0.0
 12 0.0
 22 -1.0
 32 0.0
  0 ENDTAB
```

(Origin at world origin; X-axis = `(-1, 0, 0)`, Y-axis = `(0, -1, 0)` — a proper
180° rotation about Z, determinant +1. After applying this UCS the view shows
north at top with east at the left.) World UCS remains the default so the file
opens south-up. Surveyor toggles with `_UCS R CAD_NORTH_UP` in the CAD command
line; restores via `_UCS World`. For users who want north-up with east-right
(the textbook CAD convention), the CAD viewer's view-rotate command does the
remaining mirror — we don't ship a second UCS because R12 UCS axes must form a
right-handed set and reflections aren't representable as a single UCS.

## Data flow

No new backend storage, no new API routes. All new content sourced from
existing app state, threaded through the same `POST /api/geopdf/dxf` body.

### Updated request payload (frontend)

The existing `exportToDXF()` in `SurveyPlanMapView.vue:4455` extends its
`metadata` object and adds one top-level field:

```js
const metadata = {
  // existing
  title, surveyor, date, designation, surveyOf, district, township,
  // new
  firm: config.value.firm,
  licenseNumber: config.value.licenseNumber,
  parentProperty: props.projectInfo.parentProperty,
  wholePortion: props.projectInfo.wholePortion,
  priorDiagrams: props.projectInfo.priorDiagrams || [],
}

const dxfBlob = await generateDXF({
  parcels, beacons, projection, metadata,
  outsideFigureData, scale, sheetSize,
  beaconGroups: props.projectInfo.beaconGroups || [],   // new
})
```

### Field provenance

| New field | Source in existing state | Default when missing |
|---|---|---|
| `metadata.firm` | `config.value.firm` | line skipped in title block |
| `metadata.licenseNumber` | `config.value.licenseNumber` | line skipped |
| `metadata.parentProperty` | `props.projectInfo.parentProperty` | line skipped |
| `metadata.wholePortion` | `props.projectInfo.wholePortion` | line skipped |
| `metadata.priorDiagrams[]` | `props.projectInfo.priorDiagrams` | endorsement reads `"None"` |
| `beaconGroups[]` | `props.projectInfo.beaconGroups` | description block omitted |
| `beacons.features[i].properties.type` | already on the GeoJSON | symbol falls back to single CIRCLE |

### TypeScript surface

`services/geopdf.ts`: `VectorGeoPDFRequest` gains the new optional fields on
`metadata` and a new top-level optional `beaconGroups`. No breaking change.

### Generator signature

```js
export function generateDXF(options, logger): { buffer, warnings }
```

Return shape grows from `Buffer` to `{ buffer, warnings }` to support the
warning header (see Error handling). Backend route `geopdf-vector.js`
POST `/geopdf/dxf` adapts: reads the wrapped result, attaches headers,
sends `buffer`.

## Error handling

Contract: the generator always returns `{ buffer, warnings }`; never throws to
the user. Failures are skipped, logged, counted; the frontend surfaces a
summary via a toast.

### Per-category behaviour

**Geometry / GeoJSON inputs.** Each entity is wrapped in a finite-coordinate +
minimum-vertex-count guard:

- Beacon with NaN / Infinity in `geometry.coordinates`, or coordinates outside
  Cape Lo plausible bounds (`|Y| > 1e7`, `|X| > 1e7`) → skip, log
  `[DXF] dropped beacon <name>: bad coords`, `warnings.beacons++`.
- Parcel polygon with fewer than 3 finite vertices → skip the polyline + its
  labels, log, `warnings.parcels++`.
- Outside-figure `edges` array empty → no boundary drawn; scale auto-fits to
  parcels only (existing fallback).
- All-empty input → emit a minimal DXF with chrome only, return 200 with header
  `X-DXF-Empty: true`.

**Scale / sheet sizing.**

- `sheetSize` not in `PAPER_SIZES` → fall back to `ISO_A2`, log warning
  (existing).
- `parseScaleDenom` returns 0 / non-finite → fall back to 500, log,
  `warnings.scaleFallback = true`.
- Scale produces a paper window smaller than the figure extent → log warning
  but render anyway (surveyor re-exports at a smaller scale).

**Layout overflow.**

- Long title strings (`surveyOf`, `parentProperty`) exceeding `cntR − cntL` —
  emit at full length, let CAD clip; do not truncate (the surveyor needs to
  see the overflow).
- Beacon-description rows overflowing zone height → render as many as fit,
  append `"+ <N> more — see PDF for full list"`,
  `warnings.beaconDescTruncated = N`.
- Prior-diagrams list overflowing → same truncation pattern.

**R12 format constraints.**

- Non-ASCII text in any TEXT entity → preserve as-is; the header's
  `$DWGCODEPAGE` is set to `ANSI_1252`. Log warning once per export, not per
  occurrence.
- TEXT longer than 255 chars → split into two stacked TEXT entities at the
  same X with Y offset by one line height. Rare; log warning.

### Warnings surfaced to frontend

```js
reply
  .header('X-DXF-Warning-Count', warnings.count)
  .header('X-DXF-Warnings', warnings.count ? JSON.stringify(warnings.summary) : '')
  .header('Content-Disposition', `attachment; filename="<name>.dxf"`)
  .type('application/octet-stream')
  .send(buffer)
```

Frontend `exportToDXF()` reads the headers after the blob arrives and toasts a
one-line summary when `count > 0`:

> *"DXF generated with 3 warnings (1 parcel skipped, 2 beacon descriptions truncated). See the PDF for the complete record."*

No alert/modal; an inline notice the surveyor can dismiss.

### Hard failures (still 500)

- Unhandled exception in the generator (programming bug) → 500 with
  `{ error: message }`. Existing route try/catch unchanged.
- Frontend network/timeout (30 s) → existing alert in `exportToDXF`'s catch
  block unchanged.

## Testing

Three layers; fixture-driven; ~300 lines of new test code total.

### Layer 1 — Unit tests (`__tests__/dxfGenerator.test.js`)

- **`capeLoToDxfSouthUp`** — six fixed-point fixtures spanning Lo zones
  25 / 27 / 29 / 31. Each asserts `dxfX === capeY` and `dxfY === capeX` with no
  sign flips. Includes a regression sentinel: the old `x = -y` formula would
  fail the assertion.
- **`parseScaleDenom`** — `undefined` → 500 fallback, garbage → 500 fallback,
  `"1:500"` → 500.
- **Warning aggregator** — synthetic options with mixed bad inputs; assert
  `result.warnings.count` and the `summary` shape.

### Layer 2 — Structural integration tests (`__tests__/dxfGenerator.integration.test.js`)

One fixture (~80 lines of literal data): outside-figure (in `outsideFigureData`,
not as a `parcels.features[]` entry) with 4 edges, 2 surveyed parcels in
`parcels.features` (triangle + quad — no `isOutsideFigure` flag), 6 beacons
(3 placed, 3 found), `beaconGroups` with 2 entries, `priorDiagrams` with 2,
scale `"1:1000"`, sheet `"ISO_A2"`. One `generateDXF()` call; assertions on
the produced DXF text:

```js
const { buffer } = generateDXF(fixture, fakeLogger)
const dxf = buffer.toString()

// Section integrity
expect(dxf).toMatch(/SECTION[\s\S]*?ENTITIES[\s\S]*?EOF\s*$/)

// All required layers declared in the LAYER table
for (const l of ['OUTSIDE_FIGURE','PARCELS','BEACONS','BEACON_LABELS',
                 'DISTANCES','DIRECTIONS','STAND_NUMBERS','TITLE_BLOCK',
                 'NORTH_ARROW','SCALE_BAR','GRID','MARGIN_GUIDES']) {
  expect(countLayerOnTable(dxf, l)).toBe(1)
}

// Entity counts on key layers
expect(entityCount(dxf, 'POLYLINE', 'PARCELS')).toBe(fixture.parcels.features.length)
expect(entityCount(dxf, 'CIRCLE', 'BEACONS')).toBe(fixture.beacons.features.length)
expect(entityCount(dxf, 'LINE', 'NORTH_ARROW')).toBeGreaterThanOrEqual(3)
expect(entityCount(dxf, 'TEXT', 'TITLE_BLOCK')).toBeGreaterThanOrEqual(8)

// Orientation invariant — DXF X = Cape Lo Y, DXF Y = Cape Lo X
const beacon = parseFirstEntityOf(dxf, 'CIRCLE', 'BEACONS')
expect(beacon.x).toBeCloseTo(fixture.beacons.features[0].geometry.coordinates[0], 3)
expect(beacon.y).toBeCloseTo(fixture.beacons.features[0].geometry.coordinates[1], 3)

// UCS entry present
expect(dxf).toMatch(/UCS[\s\S]{0,500}CAD_NORTH_UP/)
```

A helper `__tests__/dxfParse.js` provides `countLayerOnTable`, `entityCount`,
`parseFirstEntityOf` — ~20-line regex walkers, not a full DXF parser. We
deliberately avoid golden-file snapshots; the structural invariants survive
innocuous coord-precision tweaks.

**Second integration test (graceful degradation):** feed the same fixture with
one bad beacon (NaN coords) and one bad parcel (2 vertices). Assert the
generator still returns a Buffer + `warnings.count === 2`; no throw.

### Layer 3 — Manual CAD verification (per branch, before merge)

Developer runs after pushing:

1. Start dev server; re-use the test user from `verification/drive.mjs`
   established for the conformality check.
2. Navigate to a project with sample plan data; click `📐 Export AutoCAD DXF`.
3. Open the downloaded `.dxf` in **LibreCAD** or **QCAD** (free; no AutoCAD
   licence required).
4. Visual checklist — each must read true:
   - Title block at the top of the sheet; designation, surveyOf, firm,
     parent-property visible.
   - Drawing zone shows the parcel(s) with **south at the top**.
   - North/south arrow visible in upper-right of drawing zone, pointing up.
   - Scale bar visible in lower-right of drawing zone with metre labels.
   - Coordinate-grid tick marks along the four drawing borders with rounded
     Cape Lo Y / X values.
   - Beacons render with distinct placed vs found symbols.
   - Schedule of areas + beacon descriptions in lower-left; outside-figure
     data in lower-centre; endorsement column in right margin with all five
     sub-blocks visible.
5. Type `_UCS R CAD_NORTH_UP` in the CAD command line; verify view flips to
   north-up. Type `_UCS World` to restore.

Screenshots land in the PR description; reviewer confirms before merge.

## Out of scope

- **Multi-sheet tiling DXF.** The PDF tiles for large outside figures via
  `generateTiledGeoPDF`. The DXF stays single-sheet; surveyors with tiled
  plans reference the PDF for the complete record. Future work.
- **Paper-space layouts with viewports.** Would require R2010+; we stay on R12
  for compatibility. Approach C from brainstorming.
- **Embedding the rasterised map image as an OLE/IMAGE entity.** Vector
  geometry already in the DXF makes the raster redundant.
- **Shared SI 727 layout constants between PDF and DXF.** Approach C from
  brainstorming; reduces future drift risk. Worth doing as a follow-up after
  parity lands; deferred from this work.
- **Editable beacon block libraries (INSERT references).** Could reduce file
  size for large networks but loses simple LINE-level editability. Out of
  scope.

## Risk assessment

| Risk | Mitigation |
|---|---|
| Orientation swap breaks the existing DXF for current users | Layer 1 unit tests assert the new direction; Layer 3 manual verification confirms in a CAD viewer. The existing `capeLoToAutoCAD` function is **deleted** entirely so no caller can accidentally retain east-up output. |
| Layout overflow on long field strings | Soft-truncation policy with explicit `"+N more"` lines; never silent drops. |
| R12 incompatibility with newer CAD tools | R12 is the most-compatible target; all major CAD tools (AutoCAD, BricsCAD, LibreCAD, QCAD, QGIS) read it. UCS entry follows the R12 spec, not modern AutoCAD extensions. |
| File grows from ~814 to ~1,400 lines | Each new emitter is well-bounded (one function, one purpose); existing file is already organised by section. If any single emitter grows beyond ~150 lines during implementation, extract it as a sibling module as a follow-up. |

## Acceptance criteria

This work lands when:

1. Layers 1 + 2 tests pass in CI (`npm run test` in `app-backend`).
2. Layer 3 manual verification screenshot included in the PR description,
   showing each checklist item from §Testing/Layer 3.
3. A regression case (an existing project's DXF export) opens visually
   correctly in LibreCAD with: south-up orientation; title block at top;
   four new chrome elements (north arrow, scale bar, grid, margin guides)
   visible; beacon descriptions block emitted; full endorsement zone emitted.
4. For at least one synthetic edge case (one bad beacon + one bad parcel), the
   warning-count toast appears in the UI; the generated DXF still opens; the
   `X-DXF-Warning-Count` header is present in the response.

## References

- Existing PDF exporter: `app-frontend/src/utils/professionalSurveyPlanExporter.ts`
  (sections cited by name: `drawNorthArrow`, `drawScaleBar`, `drawGridReferences`,
  `drawBeaconDescription`, `drawEndorsementArea`, `drawMarginGuides`,
  `drawBeaconSymbol`).
- Existing DXF generator: `app-backend/src/services/dxfGenerator.js`.
- Existing route handler: `app-backend/src/routes/geopdf-vector.js`
  (`POST /geopdf/dxf`).
- Frontend caller: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue:4455`
  (`exportToDXF`).
- API client: `app-frontend/src/services/geopdf.ts` (`generateDXF`).
- Shared block standard (read-only reference): `app-shared/block-definitions.js`.
- Surveyor profile / project data shapes: `app-frontend/src/types/cadastral.ts`.
