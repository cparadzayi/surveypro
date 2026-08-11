# Block-placement escalation gate checks the wrong figure polygon

## Problem

The SI 727-native sheet-size refactor (merged `f052648`) correctly shrank
General Plan paper from the oversized ISO A-series substitutes to the real,
smaller SI 727 Section 62(1) sizes. As a direct, honest consequence, 7 tests
now show the `scheduleOfAreas`/`sgSignature` block genuinely overlapping the
parcel figure on dense fixtures — a real visual defect, previously masked by
the extra whitespace the oversized substitute paper provided. Per prior
decision these were converted to documented characterization tests
referencing this spec:

- `pdfkitGeoPDF.scheduleNoOverlap.test.js` — `sampleRealisticPlan` (12 stands)
- `pdfkitGeoPDF.townshipScaleMandate.test.js` — `sampleDevelopedLargeStandsPlan`
- `dxfGenerator.integration.test.js` — 4 assertions on `sampleFixture`,
  all `sgSignatureOverlapsPolygon`

## Root cause

This is **not** a genuine density limit like the already-accepted 240-stand
Maglas case (`2026-08-10-split-schedule-escalation-gate-design.md`). Every
one of these 7 cases has real, unused headroom — at least one larger sheet
size was never tried. Escalation isn't exhausted; it's wired to the wrong
signal.

### PDF: the escalation gate checks an idealized polygon, not the real one

`calculateBlockPositions` (`pdfkitGeoPDF.js:6384`, shared by both PDF and DXF
via the `planSheetLayout` wrapper, `sheetLayoutPlanner.js:54`) receives a
single `mapFeatureBounds` parameter and uses `mapFeatureBounds.pdfPoints` for
two purposes that should NOT share the same polygon:

1. **The placement engine's own coarse candidate search** — legitimately
   wants a polygon built by `buildPlannerObstacles()`
   (`polygonForPlanner.js:82`), which deliberately **re-centers** the outside
   figure within `mapBounds` so PDF and DXF always see an identical,
   idealized polygon and make the same placement decisions (the "3-v8"
   parity work this comment block documents). This is correct and must not
   change.
2. **The mandatory-block escalation gate** (`_polyCollisionOnMandatory`,
   `pdfkitGeoPDF.js:7196-7222`) and **the split-schedule composite check**
   (`pdfkitGeoPDF.js:~7288-7313`) — these decide whether to promote
   `needsScaleUp` and retry at a bigger sheet. They use the *same* idealized,
   re-centered polygon, when they should be asking "does this block overlap
   where the figure will *actually* be drawn?"

PDF already computes the real answer to that question — `_topoPolyPts` /
`mapFeatureBounds.pdfPoints` (the *outer*, accurate variable,
`pdfkitGeoPDF.js:12000-12027`) — built from `transformCoords` against the
final `calculatedExtent`/`figureBounds`, **before** `planSheetLayout` is even
called. But the call site (`pdfkitGeoPDF.js:12220-12241`) only ever passes
`mapFeatureBoundsForPlanner` (the re-centered one, `12171-12175`) into
`planSheetLayout` — the accurate polygon is computed and then never used for
the gate.

Confirmed empirically (instrumented run, `sampleRealisticPlan`): at
`SI727_500x400` the idealized-polygon gate *does* flag `scheduleOfAreas` and
escalates once to `SI727_800x500`. At `SI727_800x500` the same idealized
check reports zero collisions, so escalation stops — but the real polygon
disagrees, and the final render shows `scheduleOfAreasOverlapsPolygon`.
`sampleDevelopedLargeStandsPlan` is worse: the idealized gate never fires
even once.

This is the same class of bug already fixed once for `sgSignature`/
`surveyStatement` (`2026-08-09-relocation-pass-figure-accuracy-design.md`) —
that fix added a late relocation pass checking those two blocks against the
accurate polygon (`pdfkitGeoPDF.js:12351-12419`), which is exactly why they
pass clean today. It did not touch the escalation *gate* itself, so
`scheduleOfAreas` (mandatory, not relocatable) and the split-schedule
composite check inherited the same flaw. The relocation pass's own success
is the proof this comparison is coordinate-valid: it already compares
`blockPositions[name]` (returned from `calculateBlockPositions`, i.e.
planner-space-relative-to-`mapBounds`) directly against
`mapFeatureBounds.pdfPoints` (accurate) with no transform in between, and it
works.

### DXF: same shared-engine gap, plus a second, narrower gap for `sgSignature`

DXF passes the same kind of idealized, re-centered polygon into
`planSheetLayout` (`dxfGenerator.js:2015-2033`, built via the identical
shared `buildPlannerObstacles()` helper, `dxfGenerator.js:1961`) — so DXF's
copy of the shared gate has the identical flaw. DXF already has its own true
accurate polygon ready and in use elsewhere: `figurePolygon`
(`dxfGenerator.js:1887-1889`), which DXF's own `sgSignature` relocation logic
(`_placeClear`, `dxfGenerator.js:2298-2316`) already checks blocks against
successfully — confirming `figurePolygon` is coordinate-compatible with
`contentArea`/block-position space, the same way `mapFeatureBounds.pdfPoints`
is confirmed compatible on the PDF side.

DXF also has a second, independent gap, unrelated to the polygon-accuracy
bug: `sgSignature`'s placement (`_placeClear`) already correctly determines
it cannot find a clear slot and correctly sets
`warnings.summary.sgSignatureOverlapsPolygon` (via `_warnIfOverlap`,
`dxfGenerator.js:2370-2386`, invoked at `dxfGenerator.js:2391`) — but DXF's
post-emission escalation retry (`dxfGenerator.js:2251-2275`) only inspects
`warnings.summary.scheduleOfAreasOverlapsPolygon`. `sgSignatureOverlapsPolygon`
is set well *after* that escalation check already ran (schedule emission and
its escalation check happen before the bottom-zone block placement pass that
places `sgSignature`), so there is currently no checkpoint that ever sees it.
Confirmed empirically (`sampleFixture`): schedule places cleanly, only
`sgSignature` fails, sheet stays at `SI727_500x400`, and DXF never attempts
escalation — both larger sheets go untried.

## Scope decision

**Approach (chosen):** Two independent, narrowly-scoped fixes, both
extending existing machinery rather than introducing new mechanisms.

1. **Thread the accurate figure polygon into the shared escalation gate**,
   as a new parameter distinct from the polygon used for placement search.
   `calculateBlockPositions`/`planSheetLayout` gain an
   `accurateFigurePolygon` parameter, defaulting to `mapFeatureBounds.pdfPoints`
   when omitted (so any caller that doesn't pass it keeps today's behavior —
   there should be none after this change, but this avoids a silent breakage
   for an untraced caller). Both `_polyCollisionOnMandatory` and the
   split-schedule composite check use `accurateFigurePolygon` instead of
   `mapFeatureBounds.pdfPoints`. PDF passes its already-computed accurate
   `mapFeatureBounds.pdfPoints` (the outer variable); DXF passes its
   already-computed `figurePolygon`. The engine's own candidate search
   (`polyPts` parameter, whitespace scoring) is untouched — still fed the
   idealized, re-centered polygon, preserving PDF/DXF placement parity.

   This resolves the gate for `scheduleOfAreas` on **both** formats and for
   the split-schedule composite check, before any drawing/emission happens —
   no wasted render-then-discard work, unlike the "post-emission check and
   retry" pattern DXF already pays for elsewhere.

2. **Add a second DXF escalation checkpoint** after the bottom-zone block
   placement pass (`dxfGenerator.js`, right after the `_warnIfOverlap`
   calls, `~2394`), mirroring the existing schedule checkpoint's shape
   exactly: if `warnings.summary.sgSignatureOverlapsPolygon` is set and
   `_sheetSizeUpAttempt < MAX_SHEET_UP_ATTEMPTS`, escalate to the next sheet
   via the same recursive `generateDXF(...)` retry.

Rejected alternatives:

- **Post-emission check-and-retry for PDF too** (mirroring DXF's existing
  pattern: render fully, check the accurate polygon, retry if it overlaps).
  Rejected — the whole point of PDF's render path is that it consumes the
  planner's search result verbatim with no re-search at draw time (per the
  2026-08-10 spec), so once the *gate* itself is checking the right polygon,
  there is nothing left to catch after the fact. Paying a full-render cost
  to catch a case the gate already correctly prevents would be pure waste.
- **Widen `_mandatoryBlockNames` to include `sgSignature` for PDF.**
  Rejected — PDF's `sgSignature` is already correctly handled by the
  existing relocation pass (2026-08-09 fix); it is not one of the 7 failing
  cases. Adding it to the gate would be solving an already-solved problem
  and risks interfering with the working relocation pass's own retry
  semantics.
- **Give DXF's `sgSignature` its own relocation-search retry instead of
  escalation** (e.g. a wider search radius or relaxed buffer). Rejected —
  `_placeClear` already searches the full available whitespace via
  `findBlockPosition`; the fixture genuinely has no clear slot at the
  current sheet size. Escalating to more paper is the correct SI 727-
  legibility-preserving response (per Reg 32(2), matching how every other
  escalation path in this codebase already prefers a bigger sheet over a
  cramped fit), not a smarter squeeze.

## Design

### 1. `calculateBlockPositions` signature (`pdfkitGeoPDF.js:6384-6400`)

Add a new parameter after `polyPts`:

```js
export function calculateBlockPositions(
  doc,
  metadata,
  parcels,
  outsideFigureData,
  beacons,
  mapBounds,
  mapFeatureBounds,
  logger,
  scale,
  extent,
  tickMarkBounds = [],
  zOrderCollisionRegistry = null,
  figureBounds = null,
  polyPts = [],
  scheduleColumnWidthsPt = null,
  accurateFigurePolygon = null,   // NEW: real (non-re-centered) figure polygon,
                                   // used ONLY for the escalation-gate collision
                                   // checks below, never for placement search.
) {
```

Near the top of the function body, resolve the effective gate polygon once:

```js
  // The escalation gate must check against the REAL figure position, not the
  // idealized/re-centered polygon buildPlannerObstacles() hands the engine's
  // own candidate search (mapFeatureBounds.pdfPoints / polyPts stay as-is for
  // that search — changing those would reintroduce PDF/DXF placement
  // divergence). Falls back to mapFeatureBounds.pdfPoints only if no caller
  // supplies the accurate polygon (should not happen after this change).
  const _gatePolyPts = (accurateFigurePolygon && accurateFigurePolygon.length >= 3)
    ? accurateFigurePolygon
    : mapFeatureBounds?.pdfPoints;
```

### 2. Escalation gate uses `_gatePolyPts` (`pdfkitGeoPDF.js:7196-7222`)

Replace line 7198:

```js
  const _collisionPolyPts = mapFeatureBounds?.pdfPoints;
```

with:

```js
  const _collisionPolyPts = _gatePolyPts;
```

(`_collisionPolyPts` is also the variable the split-schedule composite check
around `pdfkitGeoPDF.js:~7288-7313` already reuses — confirm at
implementation time that it reads the same `_collisionPolyPts` binding
rather than re-deriving `mapFeatureBounds.pdfPoints` itself; if it does
re-derive, apply the same substitution there.)

### 3. `planSheetLayout` wrapper (`sheetLayoutPlanner.js:54-87`)

Add and thread the new parameter:

```js
export function planSheetLayout(args) {
  const {
    metadata, parcels, outsideFigureData, beacons,
    mapBounds, mapFeatureBounds, logger, scale, extent,
    tickMarkBounds = [], figureBounds = null, polyPts = [],
    zOrderCollisionRegistry = null,
    measureText,
    scheduleColumnWidthsPt = null,
    accurateFigurePolygon = null,   // NEW
  } = args;
```

```js
  const blockPositions = calculateBlockPositions(
    doc, metadata, parcels, outsideFigureData, beacons,
    mapBounds, mapFeatureBounds, logger, scale, extent,
    tickMarkBounds, zOrderCollisionRegistry,
    figureBounds, polyPtsClosed,
    scheduleColumnWidthsPt,
    accurateFigurePolygon,          // NEW 16th positional arg
  );
```

Update the JSDoc block (`sheetLayoutPlanner.js:38-53`) to document the new
parameter, distinguishing it from `polyPts`/`mapFeatureBounds`.

### 4. PDF call site (`pdfkitGeoPDF.js:12220-12241`)

Add one line:

```js
  const blockPositions = planSheetLayout({
    metadata,
    parcels: filteredParcels,
    outsideFigureData,
    beacons: filteredBeacons,
    mapBounds,
    mapFeatureBounds: mapFeatureBoundsForPlanner,
    logger,
    scale: optimalScale,
    extent: calculatedExtent,
    tickMarkBounds: _plannerTickBounds,
    zOrderCollisionRegistry,
    polyPts: _polyForPlanner,
    accurateFigurePolygon: mapFeatureBounds.pdfPoints,   // NEW — the accurate
                                                          // outer variable
                                                          // (12000-12027),
                                                          // NOT mapFeatureBoundsForPlanner.
    measureText: pdfKitMeasureText,
    scheduleColumnWidthsPt: _scheduleColumnWidthsPt,
  });
```

### 5. DXF call site (`dxfGenerator.js:2015-2033`)

Add one line:

```js
  const blockPositions = planSheetLayout({
    metadata,
    parcels:           { type: 'FeatureCollection', features: surveyedFeatures },
    outsideFigureData,
    beacons:           beacons || { type: 'FeatureCollection', features: [] },
    mapBounds:         { x: 0, y: 0, width: contentWidthPt, height: contentHeightPt },
    mapFeatureBounds:  { x: 0, y: 0, width: contentWidthPt, height: contentHeightPt, pdfPoints: polyPtsForPlanner, parcelSegments: parcelSegmentsForPlanner },
    scale:             { value: S, label: `1:${S}` },
    extent:            { minX: pageL, maxX: pageR, minY: pageB, maxY: pageT },
    tickMarkBounds:    _crossBoundsForPlanner,
    polyPts:           polyPtsForPlanner,
    accurateFigurePolygon: figurePolygon,   // NEW — already computed at :1887-1889
    measureText:       plannerMeasure,
    logger,
    scheduleColumnWidthsPt,
  });
```

`figurePolygon` can be `null` (when `ofResult`/vertices are unusable,
`dxfGenerator.js:1887`) — `calculateBlockPositions`'s fallback (`_gatePolyPts`
above) already handles a falsy `accurateFigurePolygon` by using
`mapFeatureBounds.pdfPoints`, so no additional null-guard is needed at this
call site.

### 6. New DXF escalation checkpoint for `sgSignature` (after `dxfGenerator.js:~2394`, right after the `_warnIfOverlap` calls)

```js
  // Second escalation checkpoint, mirroring the schedule one above
  // (dxfGenerator.js:2251-2275) but for sgSignature. Its own placement
  // (_placeClear) already searches the real figure polygon and can
  // correctly determine there's no clear slot — that failure just wasn't
  // wired into any escalation retry until now. See
  // docs/superpowers/specs/2026-08-11-block-placement-real-paper-robustness-design.md.
  if (warnings.summary.sgSignatureOverlapsPolygon
      && _sheetSizeUpAttempt < MAX_SHEET_UP_ATTEMPTS) {
    const nextSheet = nextSheetUp(normalizedSheetSize);
    if (nextSheet) {
      logger.warn(
        `[DXF] sgSignature overlaps the figure on ${normalizedSheetSize} — ` +
        `escalating to ${nextSheet} (attempt ${_sheetSizeUpAttempt + 1}/${MAX_SHEET_UP_ATTEMPTS})`
      );
      return generateDXF({
        ...options,
        sheetSize: nextSheet,
        _sheetSizeUpAttempt: _sheetSizeUpAttempt + 1,
      }, logger);
    }
  }
```

Placed after all six `_warnIfOverlap(...)` calls (`~2388-2393`) so
`warnings.summary.sgSignatureOverlapsPolygon` is actually set by the time
this check runs — placing it any earlier would always see it undefined
(the exact ordering bug this fix closes).

## Edge cases

- **`accurateFigurePolygon` is `null`/too short** (PDF: `_topoPolyPts` could
  be empty if `outsideFigure` has no usable ring; DXF: `figurePolygon` is
  `null` when `ofResult` is unusable): `_gatePolyPts` falls back to
  `mapFeatureBounds.pdfPoints`, identical to today's behavior — no crash, no
  false escalation, same degraded-input handling as before this change.
- **Genuinely too-dense fixtures** (the accepted 240-stand Maglas case):
  unaffected — that case already exhausts every escalation level under the
  *idealized* polygon too (per the 2026-08-10 spec's confirmed trace); a
  more accurate gate can only escalate *more* readily, never less, so this
  fix cannot make an already-exhausted case worse. `MAX_SHEET_UP_ATTEMPTS`
  (2) and the existing `scheduleEscalationExhausted` graceful-fallback
  warning are unchanged.
- **DXF's existing schedule escalation checkpoint** (`2251-2275`): unchanged
  in shape; it becomes largely redundant for cases the gate now catches
  earlier, but stays as defense-in-depth for the reason its own comment
  already documents (DXF's emission can re-split tables and diverge from
  the planner's search result) — not removed.
- **PDF's existing `sgSignature`/`surveyStatement` relocation pass**
  (`12351-12419`): unchanged — those two blocks were never broken; this fix
  only touches the escalation *gate* that `scheduleOfAreas` and the
  split-schedule composite depend on.

## Testing

- **Primary acceptance criterion**: the 7 characterization-test assertions
  this spec is written to close should now genuinely resolve. Flip them back
  from "documents the overlap" to "asserts no overlap" **only after**
  confirming — for each fixture — that the accurate polygon fix actually
  clears it (some may still need one more escalation step than expected;
  verify empirically, the same discipline used throughout the sheet-size
  branch, rather than assuming success):
  - `pdfkitGeoPDF.scheduleNoOverlap.test.js` — `sampleRealisticPlan`
  - `pdfkitGeoPDF.townshipScaleMandate.test.js` — `sampleDevelopedLargeStandsPlan`
  - `dxfGenerator.integration.test.js` — the 4 `sampleFixture` assertions
    (revert the `warnings.count` bumps back toward their pre-branch values
    if escalation now resolves them; if any still show a bumped count,
    diagnose why — that specific case may be a different problem this spec
    didn't anticipate)
- **Regression check**: `sheetLayoutPlanner.parity.test.js`'s Maglas
  characterization test must continue to show genuine exhaustion (same
  sheet/attempts numbers as documented) — a more accurate gate should not
  change that fixture's fundamentally-too-dense verdict, only fixtures with
  real headroom.
- **PDF/DXF parity**: for at least one fixture, confirm PDF and DXF resolve
  to the *same* final sheet size, since both now escalate off equivalent
  (per-format accurate) polygons — this is the same lockstep guarantee the
  2026-06-12 shared-planner design already establishes for other inputs.
- **Full backend suite** (`cd app-backend && npm test`), checking for any
  snapshot whose rendered sheet size shifts as an intended consequence of a
  fixture now escalating correctly instead of silently rendering an overlap.

## Out of scope

- Any change to the placement engine's own candidate-search polygon
  (`polyPts`, `mapFeatureBounds.pdfPoints` as fed to search/scoring) — stays
  the idealized, re-centered, PDF/DXF-shared polygon. Touching this risks
  reintroducing the placement divergence the 3-v8 parity work fixed.
- The Maglas 240-stand genuinely-too-dense case — already correctly
  documented as an accepted limitation, unaffected by this fix.
- Any change to `MAX_SHEET_UP_ATTEMPTS` / `MAX_SCALE_UP_ATTEMPTS` or the
  scale-step-up fallback tier — this fix only corrects which polygon feeds
  an existing decision, not the decision's retry budget.
