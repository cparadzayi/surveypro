# Automatic scale + sheet-size selection — one resolver, one ladder

## Problem

A surveyor generating a General Plan must pick the scale by hand. Leaving the
Scale dropdown on its default (`auto`) yields a plan drawn at a scale so coarse
it is unusable — measured at 1:10000 for a 500 m × 420 m township, putting a
50 × 42 mm figure on a 1000 × 800 mm sheet — and a PDF and DXF that disagree
with each other about the scale.

The system already contains everything needed to choose a scale automatically —
five times over. None of the five is authoritative, they disagree with one
another, and the one the export path actually depends on can fail silently.

## Root cause

### Five independent deciders

| Location | Decides | Algorithm |
|---|---|---|
| `app-backend/src/routes/surveyPlanPreview.js:255-340` | scale **and** sheet, jointly | legibility floor → smallest sheet → smallest fitting denominator |
| `app-backend/src/services/pdfkitGeoPDF.js:9810` `selectPageSize` | sheet | smallest sheet where required scale ≤ 1:5000 (hardcoded constant) |
| `app-backend/src/services/pdfkitGeoPDF.js:9633` `calculateOptimalScale` | scale | fit + 90% margin step-up loop + Reg 32(3) ceiling |
| `app-backend/src/utils/si727Constants.js:103` `selectFigureScale` | scale | reserve-fraction fit (`reserveW = 0.72`, `reserveH = 0.85`) |
| `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue:1356`, `:2736` | paper, tile grid | its own mm arithmetic |

Three consequences follow directly.

### 1. PDF and DXF run different scale algorithms

`selectFigureScale`'s docstring states:

> SHARED by both generators (pdfkitGeoPDF.js + dxfGenerator.js) so PDF and DXF
> always resolve to the SAME scale → PDF↔DXF parity / lockstep.

`pdfkitGeoPDF.js` never imports it. The only importer is `dxfGenerator.js:78`,
used at `:607`. PDF resolves its scale through `calculateOptimalScale`
(`pdfkitGeoPDF.js:9633`), a different algorithm with a different fit model. The
parity the docstring asserts does not exist and nothing tests for it.

### 2. The sheet is chosen before the scale

`pdfkitGeoPDF.js:10315`:

```js
const pageSize = selectPageSize(calculatedExtent, logger, sheetSize, scale);
```

The `scale` argument is only ever *logged* (`:9821`). When no sheet is
requested, `selectPageSize` picks the smallest sheet where the extent fits at a
hardcoded ≤ 1:5000 — a bound unrelated to the scale actually about to be used,
blind to the Reg 32(3) 1:500 mandate, and blind to the space the Schedule of
Areas and endorsement blocks need. The real scale is then resolved 150 lines
later at `:10466`, constrained to fit a sheet chosen by that placeholder rule.
The dependency runs backwards.

### 3. For General Plans, the surveyor's chosen scale is never read

`SurveyPlanMapView.vue:4085-4089`:

```ts
const resolvedScale = config.value.planType === 'diagram'
  ? (config.value.scale && config.value.scale !== 'auto' ? config.value.scale : undefined)
  : (intelligentPreview.value?.scale?.label || undefined)
const resolvedSheetSize = config.value.planType === 'diagram'
  ? (config.value.sheetSize === 'A3' ? 'A3' : 'A4')
  : (intelligentPreview.value?.sheetSize || undefined)
```

`config.value.scale` is consulted **only** for the Diagram plan type. For every
General Plan, both scale and sheet come solely from `intelligentPreview`.

A manual scale selection therefore reaches the renderer only as a *round trip*:
the user picks 1:500 → `updateScale()` (`:3375`) re-runs `loadIntelligentPreview()`
→ the preview endpoint echoes `{ value: 500, label: '1:500' }` back → that
echoed value is what gets sent.

And `loadIntelligentPreview()` swallows its own failures (`:1560`):

```ts
} catch (error) {
  // Non-critical - continue without intelligent features
}
```

When that call fails — a 422 from `surveyPlanPreview.js:117` on unparseable
geometry, any 5xx, a timeout — `intelligentPreview.value` stays null, and
`resolvedScale` **and** `resolvedSheetSize` both go `undefined` together. The
manual selection is lost along with the automatic one. The render then falls
into `selectPageSize`'s ≤1:5000 heuristic with no scale at all.

So `auto` was never a designed path. It is what happens when the recommender
goes quiet, and it lands in the one code path that models neither the mandate
nor block placement.

### Why `auto` misses even when the preview succeeds

The preview optimiser and the two renderers measure *different drawing areas*
for the same sheet:

- `calculateSI727Layout(...).drawingArea` (`si727LayoutCalculator.js:15`) —
  margins, title block, and a modelled bottom strip for beacon descriptions +
  scale bar + schedule.
- `pdfkitGeoPDF`'s `mapBounds` / `figureBounds`.
- `dxfGenerator`'s content area, via `selectFigureScale`'s `0.72` / `0.85`
  reserve fractions.

The preview's "this combination fits" verdict is therefore not the renderer's
verdict. This is the same ~73pt PDF-vs-DXF discrepancy already recorded as an
open follow-up. A recommendation the renderer then has to escalate away from is
worse than no recommendation, because the escalation ladders
(`dxfGenerator.js:2075`, and the PDF equivalent) are capped at
`MAX_SHEET_UP_ATTEMPTS = 2` (`app-shared/sheetEscalation.js`).

## Measured behaviour (2026-08-31)

Confirmed by running the `sampleMaglasPlan` fixture (240 stands of 875 m²,
extent 500 m × 420 m, mandate **not** active) through all three deciders.

**What each decider says, per sheet:**

| Decider | SI727_500x400 | SI727_800x500 | SI727_1000x800 |
|---|---|---|---|
| Preview joint optimiser | 1:10000 | 1:4000 | 1:1250 |
| DXF `selectFigureScale` | 1:2500 | 1:1250 | 1:1000 |

**What the generators actually produce:**

| Input | PDF | DXF | Agree? |
|---|---|---|---|
| Auto — i.e. the preview's own recommendation (`1:10000` on `SI727_500x400`) | 1:10000 on SI727_1000x800 — figure **50 × 42 mm** | 1:10000, same sheet | yes |
| Nothing declared | 1:1250 — figure 400 × 336 mm | **1:1000** — schedule renders over the figure | **no** |
| Surveyor picks 1:1000 | **1:1250** (silently overridden) | 1:1000 — schedule over figure | **no** |

Three conclusions, two of which amend this spec's original diagnosis:

1. **`auto` does not fail to produce output — it produces an unusable one.**
   The figure lands at 50 × 42 mm on a 1000 × 800 mm sheet: 0.26% of the sheet.
   This is the reported symptom. The renderer is not at fault; it faithfully
   honours a declared 1:10000.

2. **The culprit is `calculateSI727Layout(...).drawingArea`.** For 240 stands
   on SI727_500x400 it returns a drawing area of **300 × 50 mm** — its
   `scheduleHeight` term grows with `parcelCount` (capped at 100 mm) and, with
   the beacon-description and scale-bar strips, leaves a 50 mm-tall band. The
   preview picks the smallest sheet that "fits" that band, yielding 1:10000.
   The model degrades precisely in the high-stand-count case General Plans care
   about.

3. **PDF and DXF diverge whenever the scale is not pinned**, confirming the
   docstring defect above. They agree in exactly one case — when the preview
   pins both scale and sheet. The system's only current consistency guarantee
   is its own bad recommendation. Fixing the recommendation *without* the
   shared resolver would therefore expose the divergence rather than fix it.

Also observed: at 1:1000 the DXF schedule renders over the figure
(`scheduleOfAreasOverlapsPolygon` warning). PDF escapes the same collision via
its 90%-margin step-up to 1:1250, which DXF has no equivalent of.

## What cannot be solved analytically

Every pre-flight optimiser above reasons about the figure's **bounding box**.
Whether a plan actually renders depends on whether the Schedule of Areas,
coordinate list and endorsement block find real whitespace — which is a
function of the figure's *shape*, not its bbox. That is why both renderers
already have post-hoc `needsScaleUp` escalation.

The design must therefore not promise a closed-form optimum. It promises a
single, shared, deterministic **candidate ladder**, with render-and-escalate
retained as the arbiter — walking that ladder instead of improvising.

## Design

### `app-shared/planSheeting.js` — the one resolver

```js
export function resolvePlanSheeting({
  extentM,          // { widthM, heightM } — ground extent of the outside figure
  parcels,          // FeatureCollection — mandate + legibility inputs
  planType,         // 'general-developed' | 'general-undeveloped' | 'working-plan'
  declaredScale,    // number | null — surveyor's explicit denominator
  declaredSheet,    // string | null — surveyor's explicit sheet name
}) {
  return {
    candidates: [        // ordered, best first, never empty
      { scaleDenominator, scaleLabel, sheetSize, needsTiling, reason },
      // …
    ],
    mandate:         { mandatory500, thresholdM2 },
    legibilityMaxDenominator, // coarsest denominator the narrowest stand tolerates
  }
}
```

`app-shared/` is the correct home: `block-definitions.js`,
`si727SheetSizes.js`, `sheetEscalation.js` and `tickMarks.js` already live
there for exactly this reason — both generators import from it, so neither can
drift.

Inputs it reuses rather than reinvents:

- `resolveTownshipScaleMandate` (`app-shared/block-definitions.js`) — the
  Reg 32(3) area-majority mandate, already shared by both generators.
- A legibility bound derived from the narrowest stand. **Not**
  `calculateMinimumScaleForLegibility` (`app-backend/src/utils/scaleSelector.js`)
  — see "Legibility is a ceiling, not a floor" below.
- `SI727_PRESCRIBED_SCALES`, `SI727_GENERAL_PLAN_SHEET_SIZES`, `SHEET_ORDER`.

### Legibility is a ceiling, not a floor

Corrected during implementation; this reverses what earlier drafts of this spec
said, following the code they described.

`calculateMinimumScaleForLegibility` returns a denominator **floor** derived
from *average beacon spacing*. Both halves of that are wrong for this purpose:

- **Direction.** Legibility fails when a plan is drawn too *small*, i.e. at too
  large a denominator. So legibility bounds the denominator from ABOVE. Treating
  it as a floor forces a plan coarser the more room it has.
- **Input.** Average beacon spacing is a proxy for crowding, not for whether a
  label fits. Maglas has four outside-figure beacons across a 500 x 420m site,
  giving ~229m average spacing and a floor near 1:30000 — which is the other
  half of the 1:10000 defect, alongside the collapsing drawing area.

The resolver instead computes
`legibilityMaxDenominator = narrowestStandWidthM * 1000 / 7.5`, where 7.5mm is
the existing minimum-label allowance (2.5mm glyph + 5mm clearance) and the
narrowest stand width is the polygon-thickness walk ported from
`analyzeParcelGeometry`. For Maglas that is 25m -> 1:3333.

`calculateMinimumScaleForLegibility` is left in place; only the preview route
stopped calling it.

### Ladder ordering

Preference order, decided with the user: **avoid tiling > smaller sheet >
larger figure.** A multi-sheet General Plan is a real cost to the surveyor and
to the Surveyor-General, so avoiding it dominates sheet economy.

1. **Mandate active** (`mandatory500` — majority of stands ≤ 200 m²).
   Denominator pinned to 500. Ladder = 1:500 on each sheet in `SHEET_ORDER`
   ascending, then tiled 1:500 on the largest sheet. Not overridable by
   `declaredScale`: it is regulation. A conflicting `declaredScale` is reported
   in `reason` and ignored.

2. **`declaredScale` set, no mandate.** Filter to that denominator; ladder =
   that scale on each sheet ascending, then tiled. Decided with the user: an
   explicit scale is a professional decision, so it is **honoured and the sheet
   escalates**, rather than being silently corrected as
   `calculateOptimalScale`'s margin loop does today.

3. **Auto.** Enumerate every `(sheet, scale)` pair with
   `scale ≤ legibilityMaxDenominator`. Partition into non-tiling and tiling. Sort
   non-tiling by sheet index ascending, then denominator ascending (finest
   figure first within a sheet). Append tiling candidates last, same sort.

`declaredSheet`, where given, filters the ladder to that sheet — plus its
escalation successors, since rule 2 requires the sheet to be free to climb.

**Feasibility model in Phase 1.** Deciding `needsTiling` for a candidate needs
*some* model of the available drawing area. Phase 1 adopts
**`selectFigureScale`'s reserve-fraction model** — sheet dimensions less the SI
727 margins, times `reserveW = 0.72` / `reserveH = 0.85` — as the canonical
one, moved into the resolver.

It must **not** use `calculateSI727Layout(...).drawingArea`
(`si727LayoutCalculator.js:15`). Measurement (see "Measured behaviour" above)
shows that function is the direct cause of the reported bug: its drawing area
collapses as stand count rises, returning 300×50mm for a 240-stand plan on
SI727_500x400 and driving the 1:10000 recommendation. The reserve-fraction
model is stand-count-independent and lands within one prescribed step of what
both renderers actually resolve.

This is still an approximation of the renderers' true `mapBounds` — Phase 2
replaces it with the real thing. Phase 1's value is that all five call sites
share *one* approximation that is close, instead of three that are far apart
and one that is catastrophic.

`reason` is a human-readable string that surfaces in the UI and the logs, so
the choice is never opaque:

> `1:500 on SI727_800x500 — Reg 32(3) mandate (214 of 279 stands ≤ 200 m²);
> escalated one sheet from SI727_500x400 to fit`

### Call sites

| File | Change |
|---|---|
| `surveyPlanPreview.js:255-340` | replace the inline joint optimiser with `resolvePlanSheeting(...).candidates[0]`; keep the response shape unchanged so the frontend contract holds |
| `pdfkitGeoPDF.js:9810` `selectPageSize`, `:9633` `calculateOptimalScale` | replace both with a walk of the ladder. Keep the 90% margin check and `needsScaleUp`, but advance to `candidates[n+1]` instead of ad-hoc stepping |
| `dxfGenerator.js:607` | same walk. `selectFigureScale` becomes an internal helper of the resolver — which makes its "SHARED by both generators" docstring true for the first time |
| `SurveyPlanMapView.vue:4085-4089` | for General Plans, send `config.value.scale` when it is not `auto`, and `undefined` when it is. Stop routing the surveyor's choice through `intelligentPreview` |
| `SurveyPlanMapView.vue:1560` | stop swallowing the preview failure — surface a visible warning. With the line above, a failed preview no longer blocks generation |
| `SurveyPlanMapView.vue` display | read back `X-Used-Scale` / `X-Used-Sheet-Size`, already parsed by `geopdf.ts:166-167` and already surfaced as `usedScale` / `usedSheetSize`. The preview becomes a *hint*; the renderer is the authority |

### Phasing

**Phase 1 — the resolver and the wiring.** Everything above. This makes `auto`
a designed path, makes a manual selection reach the renderer directly, and
makes a preview failure non-fatal. It fixes the reported symptom.

**Phase 2 — one drawing-area model. SUPERSEDED 2026-09-01.** This paragraph
scoped the wrong problem and is kept only for the record. It proposed promoting
one canonical `drawingAreaFor(sheetName, { parcelCount, beaconExceptionCount })`
into `app-shared/` so both renderers would stop on the same *rung* of the shared
ladder, subsuming the tracked ~73pt PDF/DXF `mapBounds` sizing gap.

Measuring the renderers before implementing it showed the premise was false: the
PDF does not draw at the scale it reports at all. It fits the figure to a box and
prints a separately-computed denominator beside it, so `sampleRealisticPlan`
renders at a true 1:439 whether it is labelled 1:600 or 1:1000 — the geometry is
identical either way. Agreeing on a rung would have agreed on a number the PDF
does not honour.

Phase 2 is re-scoped in
`2026-09-01-scale-truth-and-canonical-drawing-area-design.md`: the PDF draws at
the resolved scale, with the canonical drawing area as the mechanism rather than
the goal. Phase 1 remains independently shippable and is unaffected.

## Verification — done 2026-08-31

Carried out against the `sampleMaglasPlan` fixture rather than a live project,
which needs no database and is reproducible from the test suite. Results are in
"Measured behaviour" above; the spec was amended before implementation on two
points:

- the symptom is an unusable 50 × 42 mm figure, not a failure to render;
- the Phase 1 feasibility model switched from
  `calculateSI727Layout(...).drawingArea` to `selectFigureScale`'s
  reserve-fraction model, the former having turned out to be the direct cause.

The structural defects in "Root cause" were read from source and are unchanged
by the measurement.

## Testing

- **Resolver unit tests** (`app-shared/__tests__/planSheeting.test.js`):
  mandate case, relaxed case, `declaredScale` honoured with sheet escalation,
  `declaredScale` overridden by an active mandate, legibility ceiling, tiling
  fallback, ladder ordering, and non-empty `candidates` for degenerate
  zero-extent input.
- **PDF↔DXF parity test**: both generators resolve an identical
  `(scale, sheetSize)` across every fixture in
  `app-backend/src/services/__tests__/fixtures/`. Modelled on the existing
  `sheetLayoutPlanner.parity.test.js`. This is the test whose absence let the
  two generators drift apart under a docstring claiming they had not.
- **Regression**: `sampleMaglasPlan.js` with no declared scale, pinning what
  `auto` produces.
- **Frontend**: `SurveyPlanMapView` sends `config.value.scale` for General
  Plans when it is not `auto`; a rejected preview call no longer prevents
  generation.

### Known test hazard

`pdfkitGeoPDF.snapshot.test.js` snapshots exact rendered text x/y for three
fixtures. Any change that repositions the figure fails it, and the failure is
easy to misread as pre-existing. It must be regenerated deliberately and the
diff inspected by eye — not waved through.

The Maglas fixture suite is slow enough to exceed a default tool timeout. Run
it synchronously and wait, per the backend ESM runner:

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>
```

## Implementation notes (2026-08-31)

Phase 1 landed as designed, with two deviations recorded above: the legibility
ceiling correction, and the Phase 1 feasibility model switching to
`selectFigureScale`'s reserve fractions.

**Parity-test cost.** The first cut of the parity suite ran every assertion
end-to-end over the dense fixtures and took ~14 minutes (Maglas auto 320s, the
declared-scale case 495s), because each PDF `needsScaleUp` escalation re-renders
the whole plan. A test nobody will run is not a regression guard. Restructured
to ~97s by keeping the PDF↔DXF end-to-end assertions on the light
`sampleRealisticPlan` (~13s each) and covering the dense fixtures DXF-side,
where a render is seconds. The pure-resolver suite carries the combinatorial
cases at millisecond cost.

**Escalation interaction.** Both generators consult the resolver constrained to
the sheet currently being rendered. A block-placement failure escalates the
sheet and re-enters the resolver, which is how the ladder gets walked — so the
existing `needsScaleUp` / `_sheetSizeUpAttempt` machinery is preserved rather
than replaced. In `pdfkitGeoPDF`, the resolver's denominator is authoritative
only on the first pass; a retry (`_forceMinDenominator > 0`) passes 0 so it stays
free to step past the shared answer, and `calculateOptimalScale`'s enlargement
pass is suppressed whenever the resolver supplied the denominator, so PDF cannot
drift finer than the answer DXF is using.

## Out of scope

- The Diagram plan type's A4/A3 sizing (`diagramPdf.js` / `diagramDxf.js`,
  a different SI 727 provision) — unchanged.
- The multi-sheet tile grid itself (`SurveyPlanMapView.vue:2736`,
  `generateTiledGeoPDF`). The resolver only *flags* `needsTiling`; how tiles
  are cut is unchanged.
- Any change to the Reg 32(3) mandate rule itself
  (`2026-08-10-township-scale-mandate-design.md`).
