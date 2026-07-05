# Diagram Template Reconciliation — SI 727 formatting & layout

**Status:** Approved (design phase)
**Date:** 2026-07-05
**Author:** cparadzayi (with Claude)

## Problem / context

We compared our generated cadastral **Diagram** (`diagramPdf.js`) against a hand-drawn
SG reference template (`DIAG TEMPLATE-Model-000.pdf`, STAND 9723 Gweru). Several
differences make ours look less like a real SG diagram: US-style number formatting,
smaller fonts, a one-directional scale bar, and a beacon description keyed by station
name rather than vertex letter. This spec reconciles those differences with the
template.

## Scope

Mostly the **backend diagram renderer** and its pure helpers; one small **frontend**
field-enable.

**In scope:**
1. SI number formatting (comma decimal + space thousands) for distances, coordinates,
   constants, area, and feature widths.
2. Font-size increases where the sheet has room (designation, statement, beacon-desc,
   reg-53), plus a cautious table bump with column widening.
3. Beacon description grouped by **vertex letter** with header "Description of Beacons".
4. Two-directional scale bar (subdivided segment left of 0).
5. Road labels that include the width when present (`Klein Road 25,00m`); the classifier
   UI allows a width on **road** annotations, not just servitudes.
6. Table row label `Const.` → `Constants` (full word).

**Explicitly NOT in scope (decided during brainstorm):**
- **Statement wording is unchanged.** We keep our current "…of land **called** …" and the
  current casing of "situate". The being-vs-called distinction is contextual (a new
  portion is "being"; an existing named parcel is "called"), so we do **not** force the
  template's wording.
- DXF; the diagram working-plan/general-plan variants; any workflow-route change.

## Design

### 1. SI number formatting — new pure module (TDD)

New file `app-backend/src/services/diagram/numberFormat.js`:

```js
/**
 * Format a number the SI 727 / Zimbabwe way: comma decimal separator and a
 * space between thousands groups of the integer part. With `sign`, prefix an
 * explicit "+"/"-" followed by a space (e.g. "- 82 360,81", "+ 0,00").
 */
export function formatSI(value, decimals = 2, { sign = false } = {}) {
  const num = Number(value) || 0
  const neg = num < 0
  const fixed = Math.abs(num).toFixed(decimals)      // "82360.81" | "0"
  const [intPart, dec] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')  // "82 360"
  const body = dec != null ? `${grouped},${dec}` : grouped        // "82 360,81"
  return sign ? `${neg ? '-' : '+'} ${body}` : body
}
```

Examples: `formatSI(122.96)` → `122,96`; `formatSI(1234.5)` → `1 234,50`;
`formatSI(-82360.81, 2, {sign:true})` → `- 82 360,81`; `formatSI(2156833.1, 2, {sign:true})`
→ `+ 2 156 833,10`; `formatSI(0, 2, {sign:true})` → `+ 0,00`; `formatSI(9000, 0)` → `9 000`.

**Applied in `sidesTable.js`** (replacing the local `signed()` + `.toFixed(2)`):
- `signed(v)` → `formatSI(v, 2, { sign: true })` (coordinate rows + const row).
- side `metres` → `formatSI(s.distance, 2)`.
- `formatDiagramArea`: numeric part via `formatSI` — square metres
  `formatSI(bankersRound(a,0), 0)`, hectares `formatSI(bankersRound(ha,4), 4)`.
- Directions (`d mm ss`) unchanged — DMS has no decimal.

**Applied in `diagramPdf.js`** for feature width labels (see §5) and the scale-bar
numbers if a decimal ever appears (integers pass through unchanged).

### 2. Font sizes

The statement/heading blocks have whitespace to spare; the table is space-constrained.

- Designation line → **11 pt bold** (was 8).
- Figure-statement body lines ("The figure"/"represents"/seq/area/situate/surveyed/
  Land Surveyor) → **9 pt** (was 7–8).
- "Description of Beacons" block and reg-53 block → **+1 pt** each.
- **Table (the risk):** SI-formatted signed coordinates (`+ 2 156 833,10`, ~14 chars) are
  wider than the old `+2144000.00`. Bump the table only modestly — **body ~7 pt, headers
  ~7.5 pt bold** — and **widen the coordinate column offsets** so the widest signed
  coordinate fits without clipping into the S.G. No. box. This is the one part that needs
  visual iteration against the template; if a 7 pt table overflows, keep 6.5 pt there
  rather than clip. Legibility of the statement/designation is the priority; the table
  stays as large as fits.

### 3. Beacon description → vertex letters

`buildBeaconDescription` still finds each subject vertex's coincident beacon (for its
description) but **collects the vertex letter** (`v.letter`) instead of the station name.
The returned shape is unchanged (`[{ names, description }]`), so the renderer is
untouched except for the header text; `names` now holds letters (e.g. `"A, B, C, D"`).
The existing single-group "All" collapse in the renderer stays.

In `diagramPdf.js` `drawBeaconDescription`, the block header text changes from
`Beacon description` to **`Description of Beacons`**.

### 4. Scale bar → two-directional

Rewrite `drawScaleBar` to the standard SG survey bar: one **subdivided** segment to the
**left of 0** (e.g. 30 m split into ticks), then `0`, then two equal solid segments to the
right, alternating fill. Labels read `30  0  30  60  metres` under the ticks, with
`Scale 1 : <denom>` retained. The bar length still derives from the same
metres-per-point scale used today.

### 5. Road width label + UI

- **Renderer** (`drawAdjoiningFeatures`): for a **road** annotation, when `ann.widthM > 0`
  the along-edge label reads `${ann.label} ${formatSI(ann.widthM, 2)}m` (e.g.
  `Klein Road 25,00m`); with no width it stays `${ann.label}`. Servitude labels are
  unchanged (their width is already encoded by the strip width).
- **Frontend** (`SurveyPlanMapView.vue` classifier modal): the **width (m)** input, today
  shown only for `role === 'servitude'`, also shows for `role === 'road'`. No other UI
  change — `upsertAnnotation`/persistence already carry `widthM` generically.

### 6. "Constants"

In `drawTable`, the const-row label `Const.` → `Constants`.

## Error handling / edge cases

- `formatSI(NaN/undefined)` → treats as `0` (`Number(value) || 0`).
- Zero coordinate/const → `+ 0,00` (sign defaults positive).
- Road annotation with no width → label unchanged (name only).
- A vertex with no coincident beacon → omitted from the description (existing behaviour).
- Table overflow after the font bump → fall back to the smaller table font rather than
  clip (visual-acceptance call).

## Testing

- **`numberFormat.test.js` (Jest, new):** grouping (≥1000), comma decimal, sign+space,
  negatives, zero, `decimals` 0/2/4, non-numeric → 0.
- **`sidesTable` test (update):** `metres`, coordinate `y`/`x`, const row, and
  `formatDiagramArea` now emit SI strings (`122,96`, `- 82 360,81`, `+ 0,00`,
  `9 000 square metres` / `1,2345 hectares`).
- **`beaconDescription` test (update):** groups by description but lists **vertex letters**
  (`A, B, C, D`), not station names.
- **`diagramPdf.js`:** existing valid-PDF Jest guard stays green; everything visual
  (fonts, column widths, scale bar, "Constants"/"Description of Beacons", road-width
  label) verified by generating a diagram into the scratchpad and reading it back against
  the template.
- **`SurveyPlanMapView.vue`:** `npm run build` + manual — classify a road, set a width,
  confirm it persists and the label renders `<name> <width>m`.

## Rollout

Single spec → single plan. Suggested task order: `numberFormat.js` (TDD) → wire into
`sidesTable.js` (update tests) → `beaconDescription.js` vertex letters (update tests) →
`diagramPdf.js` renderer edits (Constants, header, fonts+columns, scale bar, road-width)
with valid-PDF guard + visual acceptance → `SurveyPlanMapView.vue` road width field
(build + manual).
