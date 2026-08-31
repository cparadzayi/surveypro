# Automatic scale + sheet-size selection — one resolver, one ladder

## Problem

A surveyor generating a General Plan must pick the scale by hand. Leaving the
Scale dropdown on its default (`auto`) does not reliably produce output.

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
    legibilityFloor, // finest denominator the narrowest parcel tolerates
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
- `calculateMinimumScaleForLegibility` (`app-backend/src/utils/scaleSelector.js`)
  — moves to `app-shared/` alongside the resolver. It is currently reachable
  only from the preview route.
- `SI727_PRESCRIBED_SCALES`, `SI727_GENERAL_PLAN_SHEET_SIZES`, `SHEET_ORDER`.

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
   `scale ≥ legibilityFloor`. Partition into non-tiling and tiling. Sort
   non-tiling by sheet index ascending, then denominator ascending (finest
   figure first within a sheet). Append tiling candidates last, same sort.

`declaredSheet`, where given, filters the ladder to that sheet — plus its
escalation successors, since rule 2 requires the sheet to be free to climb.

**Feasibility model in Phase 1.** Deciding `needsTiling` for a candidate needs
*some* model of the available drawing area. Phase 1 uses the existing
`calculateSI727Layout(sheetSize, parcelCount).drawingArea`
(`si727LayoutCalculator.js:15`) — the preview optimiser's current model, moved
to `app-shared/` with the resolver. This is deliberately a known-imperfect
model: it is not what either renderer measures, which is precisely what Phase 2
fixes. Phase 1's value is that all five call sites now share *one* imperfect
model instead of holding three different ones, so disagreement becomes a single
correctable number rather than a structural property.

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

**Phase 2 — one drawing-area model.** Phase 1 guarantees both renderers walk
the *same ladder*; it does not yet guarantee they stop at the same *rung*,
because they still measure the available area differently (see "Why `auto`
misses even when the preview succeeds"). Phase 2 promotes one canonical
`drawingAreaFor(sheetName, { parcelCount, beaconExceptionCount })` into
`app-shared/`, has the resolver use it for candidate feasibility, and has both
`mapBounds` (PDF) and the DXF content area derive from it.

Phase 2 subsumes the tracked ~73pt PDF/DXF `mapBounds` sizing gap and is the
change that makes candidate #1 correct most of the time — but it moves the
figure on every existing plan, so it carries the real regression risk. Phase 1
is independently shippable and is not blocked by it.

## Verification before coding

The structural defects above are all read directly from the source. The exact
runtime failure the user observes on `auto` is **not** yet confirmed from a
log. Before writing code, reproduce with the Maglas project
(`MAG1_SH1_Shabani_2026-06-16`, 279 stands, the fixture already captured as
`app-backend/src/services/__tests__/fixtures/sampleMaglasPlan.js`):

1. Generate with Scale = `auto`, capture the backend log.
2. Confirm whether `intelligentPreview` returned at all, what
   `[SurveyPlanPreview] 📄 Joint Scale+Sheet Selection` logged, what
   `[PDFKit] 📐 Forwarding scale=…` received, and whether the run ended in
   exhausted `needsScaleUp` escalation.

If the observed failure turns out to have a different cause, this spec is
amended before implementation rather than after.

## Testing

- **Resolver unit tests** (`app-shared/__tests__/planSheeting.test.js`):
  mandate case, relaxed case, `declaredScale` honoured with sheet escalation,
  `declaredScale` overridden by an active mandate, legibility floor, tiling
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

## Out of scope

- The Diagram plan type's A4/A3 sizing (`diagramPdf.js` / `diagramDxf.js`,
  a different SI 727 provision) — unchanged.
- The multi-sheet tile grid itself (`SurveyPlanMapView.vue:2736`,
  `generateTiledGeoPDF`). The resolver only *flags* `needsTiling`; how tiles
  are cut is unchanged.
- Any change to the Reg 32(3) mandate rule itself
  (`2026-08-10-township-scale-mandate-design.md`).
