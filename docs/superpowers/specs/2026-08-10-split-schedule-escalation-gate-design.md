# Split-schedule paper-size escalation gate ("sub-project B")

## Revision note (post-implementation)

During implementation, empirical testing (full escalation trace on
`sampleMaglasPlan`, captured via temporary diagnostic logging) confirmed the
fix works exactly as designed — `needsScaleUp` is correctly re-checked and
promoted at every level: `ISO_A2` → `ISO_A1` (still overlaps, composite
1296×1250) → `ISO_A0` (still overlaps, composite 860×1850) → scale step-up
`1:1000`→`1:1250` (still overlaps) → exhausted. But `sampleMaglasPlan`'s
240-stand schedule composite (860×1850pt ≈ 30×65cm) is genuinely too large
to fit anywhere on the page even at the largest sheet plus a scale step-up —
a real, quantified density limit, not an escalation-gate defect. This was
not verified before writing the original "Testing" section below, which
wrongly assumed escalating this specific fixture would fully resolve the
overlap (only that it wasn't *already* at the largest size, which is a
weaker claim). The Testing section is superseded by the plan document's
revised Task 1/2 test expectations: `sampleMaglasPlan` becomes a
characterization case (escalation genuinely attempted through exhaustion,
overlap warning legitimately persists) — the same pattern as `sgSignature`'s
documented residual gap from the prior fix
(2026-08-09-relocation-pass-figure-accuracy). The code design and fix below
are unchanged and were confirmed correct by this same trace.

## Problem

On dense plans where the Schedule of Areas must split into multiple
side-by-side sub-tables (`isScheduleWithFluidFallback`), the PDF generator
can render the schedule's composite bounding box on top of the parcel
figure — and never gets a chance to try a larger sheet size to fix it.

This is a known, already-tracked gap. `sheetLayoutPlanner.parity.test.js:87`
("dense Maglas: DXF resolves the schedule-over-figure overlap; PDF has a
known, tracked gap (sub-project B)") documents it directly: DXF resolves the
overlap for the 240-stand `sampleMaglasPlan` fixture, PDF does not.

Confirmed by direct measurement: `generateGeoPDF(sampleMaglasPlan, ...)`
lands on `ISO_A1` (not the largest available sheet, `ISO_A0`) and returns
`warnings.scheduleOfAreasOverlapsPolygon` with a composite rect of
`1295.6×1250` — while the log shows both of the schedule search's
polygon-avoidance fallback tiers failing outright:

```
[PDFKit] 📊 Side-by-side: no topology candidate fits composite 1296×1250pt — bounds-only fallback
[PDFKit] 📊 Side-by-side: bounds-only fallback empty — using engine startX/Y as anchor
```

## Root cause

`calculateBlockPositions` (`pdfkitGeoPDF.js`) has an existing escalation
gate: any "mandatory" block (`outsideFigureData`, `scheduleOfAreas`,
`scaleBar`, `surveyStatement`) that overlaps the figure polygon promotes
`needsScaleUp`, which triggers a retry of the whole generation at the next
larger SI 727 sheet size (`ISO_A2` → `ISO_A1` → `ISO_A0`,
`app-shared/sheetEscalation.js`).

But `scheduleOfAreas` is explicitly excluded from this gate whenever the
schedule needs to split (`pdfkitGeoPDF.js:7139`,
`isScheduleWithFluidFallback`), on the stated assumption (line 7138's
comment) that "the fluid table always finds clear slots." That assumption
is false. The fluid search
(`drawScheduleOfAreasMultiTable`'s side-by-side layout, ~line 8540-8610) has
three fallback tiers:

1. Topology-aware search for an anchor where the composite clears the
   figure polygon and other blocks.
2. If that fails: a "bounds-only" scan that only avoids five *named*
   critical blocks (`titleBlock`, `northArrow`, `scaleBar`, `sgSignature`,
   `surveyStatement`) — **it does not check the figure polygon at all.**
3. If that also fails: fall back to the engine's original placement hint
   with **no collision checking whatsoever.**

When tier 1 fails on a dense plan, tiers 2 and 3 can silently accept a
position that overlaps the figure — and because the escalation gate is
blanket-suppressed for the split case, `needsScaleUp` never gets promoted,
so the plan never even tries a bigger sheet where more room might exist.

DXF already solved the equivalent problem with a "post-emission escalation"
check (`dxfGenerator.js:2239-2263`, comment: "Mirrors the PDF's
`_polyCollisionOnMandatory` → `needsScaleUp` promotion"). DXF needs that
check to run *after* its own emission step specifically because DXF's
emission logic can re-split tables and diverge from the shared planner's
search result — the comment there explains "the shared planner runs a
coarser placement search than the schedule emitter's actual sub-table
footprints." PDF does not have this divergence: PDF's render step consumes
the planner's search result verbatim via `precomputedPlacedTables` (no
re-search at draw time — see the existing comment at
`pdfkitGeoPDF.js:7174-7181`), so the planner's own composite bounding box
*is* the ground truth for what will actually render.

## Scope decision

**Approach A (chosen):** Right after the planner-side fluid search resolves
`scheduleOfAreasFinal` (the composite bounding box of all placed
sub-tables), check that composite against the figure polygon using the same
`rectangleOverlapsPolygon` helper and buffer(2) convention the existing
single-table mandatory-block check already uses, and promote
`needsScaleUp` if it overlaps — replacing the blanket suppression with an
actual verification of the search's own result. This flows into the
already-working escalation-retry loop (`pdfkitGeoPDF.js:12165+`) with zero
changes needed there.

Rejected alternatives:

- **Mirror DXF's post-emission pattern exactly** (check the overlap warning
  after full PDF rendering, then retry) — rejected because it would mean
  drawing the entire PDF just to discover it needs to retry. DXF only pays
  that cost because of its own re-emission divergence, which PDF's render
  path does not have.
- **Make the fluid search's fallback tiers refuse to ever return an
  overlapping position** — rejected as a much larger, riskier change to an
  ~800-line function shared by both PDF and DXF. Some dense fixtures may
  currently rely on that fallback to place the schedule *at all* at the
  current sheet size; refusing to ever return a position would need a
  broader contract change rippling through both callers, for no benefit
  beyond what Approach A already achieves more safely.

## Design

In `app-backend/src/services/pdfkitGeoPDF.js`, immediately after the
existing block that computes `scheduleOfAreasFinal`
(the `if (_schedNeedsSplit && parcels?.features?.length > 0 && schedulePos) { ... }`
block, currently ending around line 7218) and before the "Schedule
balancing is applied at DRAW time" comment (currently ~line 7220), add:

```js
  // Escalate if the fluid multi-table search still leaves the schedule
  // composite overlapping the figure. isScheduleWithFluidFallback (above)
  // blanket-suppressed this on the assumption the fluid search always finds
  // a clear slot — it doesn't: drawScheduleOfAreasMultiTable's fallback
  // tiers (bounds-only / engine-startXY) can accept an overlapping anchor
  // when no polygon-clear slot exists. Mirrors the single-table
  // mandatory-block promotion above (same buffer=2 convention).
  if (_schedNeedsSplit && _collisionPolyPts?.length > 0 && scheduleOfAreasFinal) {
    const _schedRect = {
      x: scheduleOfAreasFinal.x,
      y: scheduleOfAreasFinal.y,
      width: scheduleOfAreasFinal.width,
      height: scheduleOfAreasFinal.height,
    };
    if (rectangleOverlapsPolygon(_schedRect, _collisionPolyPts, 2) && !needsScaleUp) {
      needsScaleUp = true;
      logger.warn(
        "[PDFKit] ⚠️  Split schedule composite overlaps polygon after fluid search — promoting needsScaleUp for paper-size escalation"
      );
    }
  }
```

`_collisionPolyPts` (`mapFeatureBounds?.pdfPoints`), `rectangleOverlapsPolygon`,
and `needsScaleUp` (declared `let` earlier in the same function) are all
already in scope — no new imports, no new helper functions, no changes to
`drawScheduleOfAreasMultiTable`.

`scheduleOfAreasFinal` (not `schedulePos`) is checked so the new gate covers
both outcomes of the search: the real composite when `_schedSearch`
succeeds, or the original stacker hint (`schedulePos`) if `_schedSearch`
threw or returned no `placedTables` — both cases currently fall through
`isScheduleWithFluidFallback`'s blanket suppression today.

No other part of the pipeline changes. DXF is untouched — its own
post-emission escalation already works independently.

## Edge cases

- **No figure polygon at all**: `_collisionPolyPts?.length > 0` guards the
  new check — skipped entirely, no crash, no false escalation. Same
  short-circuit the existing mandatory-block loop already relies on.
- **Single-table schedule** (`_schedNeedsSplit` false): the new check is
  gated on `_schedNeedsSplit`, so it never runs for the non-split path —
  that path is already correctly handled by the pre-existing mandatory-block
  loop, since `isScheduleWithFluidFallback` is `false` there.
- **`needsScaleUp` already promoted by another block**: guarded by
  `&& !needsScaleUp`, avoiding a redundant re-promotion or duplicate
  warning — consistent with the existing pattern at
  `pdfkitGeoPDF.js:7150-7153`.
- **Composite genuinely clear** (tier-1 topology search succeeded): no
  escalation fires, same as today. This preserves the original comment's
  legitimate intent (don't escalate on every split schedule) — the fix
  removes only the incorrect blanket assumption, not the correct
  no-escalation-when-clear case.
- **Escalation exhausted at `ISO_A0`**: no new behavior needed. The existing
  retry loop (`pdfkitGeoPDF.js:12165+`) already produces
  `scheduleEscalationExhausted` when `MAX_SHEET_UP_ATTEMPTS` (2) is reached,
  and the final `_pdfWarnIfOverlap` check still correctly reports
  `scheduleOfAreasOverlapsPolygon` if the composite genuinely still overlaps
  at max size. This is the same honest, documented-residual-gap pattern as
  `sgSignature` from the previous fix (relocation-pass-figure-accuracy) —
  not a new failure mode.

Confirmed empirically before writing this spec:
`generateGeoPDF(sampleMaglasPlan, ...)` currently lands on `ISO_A1` (not the
max `ISO_A0`) with both fallback tiers failing on the schedule composite —
so there is a genuine next escalation step available, not an immediate
dead end.

## Testing

- **Primary acceptance criterion**: flip
  `sheetLayoutPlanner.parity.test.js:148` from
  `expect(pdfWarnKeys).toContain('scheduleOfAreasOverlapsPolygon')` (marked
  `KNOWN GAP — sub-project B, not yet fixed`) to
  `expect(pdfWarnKeys).not.toContain('scheduleOfAreasOverlapsPolygon')`, and
  remove the now-stale "KNOWN GAP" comment and the surrounding explanation
  of why PDF doesn't resolve it (update to reflect that it now does).
- **Direct regression test** in
  `pdfkitGeoPDF.scheduleNoOverlap.test.js` (same file/style as the previous
  phase's tests): call `generateGeoPDF(sampleMaglasPlan, logger)` directly
  (no DXF involved) and assert `warnings.scheduleOfAreasOverlapsPolygon` is
  `undefined` — isolates the PDF-side fix from the parity test's DXF
  machinery.
- **Full backend suite**, explicitly including `pdfkitGeoPDF.snapshot` (per
  the lesson from the previous phase — sheet-size changes are very likely to
  shift rendered text positions on the Maglas snapshot fixture, and that
  snapshot test's name doesn't overlap with the more obvious suites this
  work touches).
- **Visual verification**: regenerate the Maglas PDF and confirm the
  schedule no longer visually overlaps the figure, and note the resulting
  sheet size in the verification notes (expected `ISO_A0`, since `ISO_A1`
  was empirically shown to fail above) so an unexpectedly large escalation
  is visible if it happens.

## Out of scope

- Any change to `drawScheduleOfAreasMultiTable`'s fallback tiers themselves
  — deliberately left alone per the rejected Approach C above.
- DXF's schedule placement or its post-emission escalation — already
  working independently, not touched.
- The PDF/DXF corner-rounding mismatch and multi-sheet tiling — separate,
  already-tracked items, unrelated to this fix.
