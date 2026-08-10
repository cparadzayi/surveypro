# Township general-plan scale mandate — area-majority based, not plan-type based

## Problem

The Surveyor-General has relaxed SI 727 Reg 32(3): the mandatory 1:500 scale
for a township General Plan (developed or undeveloped) now applies **only**
when the majority of stands have an area ≤200m². Where the majority of
stands are >200m², any SI 727 prescribed scale may be used, provided the
chosen scale keeps every plan component clear of every other component.

Today the mandate is keyed on `planType` alone, never on parcel area:

- `general-developed` is unconditionally capped at exactly 1:500
  (`SI727_MAX_DENOMINATOR_BY_PLAN` in `pdfkitGeoPDF.js:10359-10361`; mirrored
  by the `planType === 'general-developed' ? 500 : ...` branch in
  `dxfGenerator.js:617-621`).
- `general-undeveloped` is never capped — always auto-maximized to the
  largest SI 727 scale that fits the sheet.

Because `general-developed` is *always* forced to 1:500 regardless of how
dense the plan is, large-stand-count developed townships (e.g. mining
surface townships with 100+ stands) can be forced into a figure so large
that the Schedule of Areas table has nowhere clear to go. This is the
concrete failure seen in
`.../MAG1_SH1_Shabani_2026-06-16/output/general-plans/general-developed-STANDS_207-279_340-345_MAGLAS_TOWNSHIP_OF_SHABANI_MINE_SURFA.pdf`:
the schedule overlaps the figure. The existing escalation machinery (sheet
size A2→A1→A0, then one scale step-up — see
`2026-08-10-split-schedule-escalation-gate-design.md`) already tries to fix
overlaps like this, but for `general-developed` plans the 1:500 ceiling is
reapplied *after* that retry (`applyPlanTypeCeiling`,
`pdfkitGeoPDF.js:10479-10482`), silently undoing any scale step-up and
leaving only sheet-size escalation to save it — which is not always enough
for very dense plans.

## Root cause

The 1:500 mandate is a proxy for "developed township," but developed-ness
was only ever a UI/`planType` label — never actually a measure of stand
size. The Surveyor-General's relaxation makes explicit what was already
true: the real trigger for the mandate is stand density/size, not which
button the surveyor clicked. Keying the ceiling on `planType` instead of
measured stand area is what forces oversized developed-township figures
into a scale they can't be laid out at.

## Scope decision

**Approach (chosen):** Replace the `planType`-keyed ceiling with an
area-majority-keyed ceiling, computed identically for both plan types from
the parcels already passed into each generator. Add one shared helper,
`resolveTownshipScaleMandate(parcelsFeatureCollection)`, to
`app-shared/block-definitions.js` (already imported by both
`pdfkitGeoPDF.js` and `dxfGenerator.js`, so PDF and DXF can never diverge on
this rule — same parity guarantee the file already provides for
`computeScheduleColumnWidths` etc.). It returns `{ mandatory500: boolean }`:

- Count stands (parcel features), excluding any with
  `properties.isOutsideFigure === true`,
  `properties.metadata?.isOutsideFigure === true`, or a `stand`/`designation`
  string containing "outside figure" (same detection already used at
  `geopdf-vector.js:349-353`).
- For each remaining stand, resolve area from `properties.area_m2` if it is
  a finite number >0; otherwise compute it via shoelace from
  `geometry.coordinates[0]` (needed because the DXF route's raw `parcels`
  don't always carry `area_m2` — `dxfGenerator.js:1705` currently defaults
  a missing value to `0`, which would wrongly count as "small" without this
  fallback).
- `mandatory500 = (countAtOrBelow200 >= countAbove200)` — ties resolve to
  the mandate (the conservative/SG-safe default), matching a strict
  "majority >200m²" requirement for relaxation rather than "not a majority
  ≤200m²".
- Zero stands (e.g. a request with only an outside-figure parcel) resolves
  to `mandatory500 = true` — same conservative default, and a degenerate
  case that shouldn't occur for a real General Plan request.

This is deliberately the smallest change that satisfies the new rule: it
removes/relaxes an artificial ceiling rather than adding new overlap-
avoidance logic, so the already-working escalation/step-up retry loop gets
a real chance to pick a coarser scale for dense plans, with zero changes to
that loop itself.

Rejected alternatives:

- **Only relax `general-developed`, leave `general-undeveloped` always
  uncapped.** Rejected because it doesn't match the stated rule: an
  undeveloped township with mostly ≤200m² stands must also be mandated to
  1:500 going forward. This is a real, intentional behavior change for
  `general-undeveloped` plans, not just a relaxation of `general-developed`.
- **Build a new scale-search loop that explicitly checks schedule/figure
  overlap for each candidate scale before committing.** Rejected as
  unnecessary duplication — the existing sheet-size escalation + one-step
  scale-up + split-schedule polygon-overlap promotion (already merged,
  `e484de5`) already performs this check after the fact and retries. Once
  the false 1:500 ceiling is removed for majority->200m² cases, that
  machinery activates as designed.
- **Compute the majority check in the route layer** (`geopdf-vector.js`)
  and thread a new boolean through both generators' options. Rejected
  because both generators already receive the full `parcels`
  `FeatureCollection` as an option — computing the boolean where it's used
  avoids adding a new field to two request-shaping call sites for no
  benefit.

## Design

### 1. New constant

`app-backend/src/utils/si727Constants.js` — add near
`MIN_FIGURE_SIZE_MM2`:

```js
// Surveyor-General relaxation (2026): the mandatory 1:500 General Plan scale
// applies only when the majority of stands are at or below this area.
// Townships (developed or undeveloped) where the majority of stands exceed
// this threshold may use any SI 727 prescribed scale.
export const TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2 = 200
```

### 2. Shared helper

`app-shared/block-definitions.js` — add alongside `formatAreaValue`:

```js
/**
 * Determine whether a township General Plan must use exactly 1:500, per the
 * Surveyor-General's area-majority rule: mandatory only when the majority of
 * stands (excluding Outside Figure) have area <= thresholdM2. Ties resolve
 * to the mandate. Shared by pdfkitGeoPDF.js and dxfGenerator.js so PDF and
 * DXF can never resolve this differently for the same parcels.
 */
export function resolveTownshipScaleMandate(parcels, thresholdM2 = 200) {
  const features = parcels?.features || []
  let atOrBelow = 0
  let above = 0
  for (const f of features) {
    const props = f?.properties || {}
    const isOutsideFigure =
      props.isOutsideFigure === true ||
      props.metadata?.isOutsideFigure === true ||
      String(props.stand || '').toLowerCase().includes('outside figure') ||
      String(props.designation || '').toLowerCase().includes('outside figure')
    if (isOutsideFigure) continue

    let area = Number(props.area_m2)
    if (!Number.isFinite(area) || area <= 0) {
      area = shoelaceAreaM2(f?.geometry?.coordinates?.[0])
    }
    if (area <= thresholdM2) atOrBelow++
    else above++
  }
  return { mandatory500: atOrBelow >= above }
}

function shoelaceAreaM2(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0
  let coords = ring
  // Unwrap double-nested [[ring]] the same way geopdf-vector.js does.
  if (Array.isArray(coords[0]) && Array.isArray(coords[0][0])) coords = coords[0]
  let a = 0
  for (let i = 0; i < coords.length; i++) {
    const [x1, y1] = coords[i]
    const [x2, y2] = coords[(i + 1) % coords.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a / 2)
}
```

### 3. `pdfkitGeoPDF.js` call sites

- Import `resolveTownshipScaleMandate` from `app-shared/block-definitions.js`
  (already has an import from this module) and
  `TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2` from `si727Constants.js`.
- Where `calculateOptimalScale(...)` is called (`:11183`), compute the
  mandate once from the `parcels` already in scope in the enclosing
  function and pass it through instead of `planType`:

  ```js
  const { mandatory500 } = resolveTownshipScaleMandate(parcels, TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2)
  ```

- `calculateOptimalScale` (`:10363`) and `applyPlanTypeCeiling` (`:10500`):
  replace the `planType === 'general-developed'` check at `:10425` and the
  `SI727_MAX_DENOMINATOR_BY_PLAN[planType]` lookup at `:10501` with
  `mandatory500`:

  ```js
  const _exactMandateDenom = mandatory500 ? 500 : 0;   // was: planType === 'general-developed' ? 500 : 0
  ...
  const maxDenom = mandatory500 ? 500 : Infinity;      // was: planType ? (SI727_MAX_DENOMINATOR_BY_PLAN[planType] ?? Infinity) : Infinity
  ```

  `planType` is still threaded through unchanged for every other use in
  this file (title text, tiling messaging, DXF/PDF branch selection,
  etc.) — only the scale-ceiling decision changes.
- Guard: only compute/apply the mandate when
  `planType === 'general-developed' || planType === 'general-undeveloped'`.
  Other plan types (`diagram`, `working-plan`) never reach
  `calculateOptimalScale` today (they branch out earlier in the route), so
  this is a defensive guard rather than a behavior change, kept so the new
  code can't silently activate if a future plan type routes through the
  same function.

### 4. `dxfGenerator.js` call site

Replace `:614-621`:

```js
let S;
if (declaredS) {
  S = declaredS;
} else if (planType === 'general-developed') {
  S = 500;
} else {
  S = _figFit.S;
}
```

with:

```js
const { mandatory500 } = resolveTownshipScaleMandate(parcels, TOWNSHIP_SCALE_MANDATE_THRESHOLD_M2);
let S;
if (declaredS) {
  S = declaredS;
} else if (mandatory500) {
  S = 500;
} else {
  S = _figFit.S;
}
```

`declaredS` (the PDF→DXF scale handoff) keeps precedence unchanged — this
only changes the fallback branch used when no scale was handed off.

## Edge cases

- **Exact 50/50 stand split**: resolves to `mandatory500 = true` (tie goes
  to the mandate), per the confirmed rule.
- **Zero stands / all parcels flagged Outside Figure**: resolves to
  `mandatory500 = true` — conservative default; shouldn't occur for a real
  General Plan.
- **`area_m2` missing on some stands, present on others** (the realistic
  DXF-route case): each stand is resolved independently — present values
  are used as-is, missing ones fall back to shoelace. No all-or-nothing
  behavior.
- **PDF→DXF scale handoff (`declaredS`)**: unaffected — still takes
  precedence over the mandate, exactly as it takes precedence over the
  previous `planType`-based branch today.
- **`diagram` / `working-plan` plan types**: unaffected — they never reach
  this code path (routes branch to `generateDiagramDXF`/`generateDiagramPDF`
  first), and the added guard makes that explicit rather than implicit.
- **Multi-sheet tiling**: unchanged mechanically — `applyPlanTypeCeiling`
  still sets `needsTiling = true` if even a `mandatory500` plan's figure
  doesn't fit at 1:500 at the largest sheet; a non-mandatory plan almost
  never reaches tiling since it's free to step to a coarser scale instead.

## Testing

- **Unit tests for `resolveTownshipScaleMandate`** (new,
  `app-shared/__tests__/` or co-located with existing block-definitions
  tests): majority-count-below vs above threshold, exact tie, Outside
  Figure exclusion, `area_m2` present vs. missing (shoelace fallback path),
  zero-stand degenerate case.
- **`general-developed` regression — relaxation**: a dense fixture modeled
  on the Shabani Mine case (many stands, majority >200m²) — assert the
  resolved scale is not clamped to 1:500 and the final layout has no
  schedule/figure overlap (`warnings.scheduleOfAreasOverlapsPolygon` is
  `undefined`). Regenerate the actual Shabani Mine PDF as a manual visual
  check.
- **`general-undeveloped` regression — new restriction**: a fixture with a
  majority of stands ≤200m² — assert the resolved scale is now exactly
  1:500, where prior behavior would have auto-maximized past it.
- **DXF parity**: mirror both regressions above through `generateDXF`,
  confirming PDF and DXF resolve to the same scale for the same parcels.
- **Full backend suite**, explicitly checking `pdfkitGeoPDF.snapshot.test.js`
  for fixtures whose resolved scale changes as a result of this fix (per
  the standing note that this snapshot test silently "passes as unrelated"
  if not diffed by hand).

## Out of scope

- The fluid schedule search's fallback tiers that don't check the figure
  polygon (tiers 2/3 of `drawScheduleOfAreasMultiTable`) — unrelated to
  scale selection, already a documented rejected-alternative in the
  split-schedule escalation gate spec.
- Reconciling the broader PDF (`computeAreaConsistency`) vs. DXF
  (frontend-supplied `area_m2`) area-computation source-of-truth gap beyond
  the shoelace fallback needed for this specific majority check.
- Any change to how `planType` drives non-scale behavior (title text,
  edge-label suppression for developed plans, tiling messaging, etc.).
