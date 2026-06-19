# Schedule-of-Areas Whitespace-Driven Placement — Design Spec

**Date:** 2026-06-19
**Status:** Design (approved direction; ready for implementation plan)
**Sub-project:** General-Plan "match the ideal" — dimension ① (compact tall schedule)

---

## 1. Context & problem

The Schedule of Areas should be placed and shaped to **match the SI 727 General
Plan convention shown in the reference plan** (`…/saunyama maglas 1438 to 1597/
3 General Plan developed portion 1 20250714.dxf`): a **tall, narrow schedule
column down the far-left edge AND another down the right edge, with the figure
centred between them**.

Dimension ② (scale enlargement) already stopped the schedule from sprawling
horizontally — on the 240-stand fixture it now renders as **two tall column-
groups, but both pooled on the right**, with the figure pushed centre-left. The
remaining gap is **balance**: the ideal splits the schedule across both side
strips with a centred figure; ours pools one side.

The deliberate current behaviour (`pdfkitGeoPDF.js:11193`
`figureBounds.alignX = hSlack > 40 ? 'left' : 'center'`) left-aligns the figure
specifically to pool one contiguous right strip for the schedule. A naive
"always centre" experiment was a **no-op** for the DXF (the DXF figure position
and schedule slot are not driven by `alignX`), confirming the rebalance needs a
real change to the placement engine, not a one-liner.

## 2. Goals / non-goals

**Goals**
- Place the schedule into the whitespace that **actually exists** for the
  figure's orientation + size, in a shape that fits it.
- When two usable side strips exist: **balance** the schedule across left + right
  with the figure centred (the ideal's look).
- Keep the safe fallbacks: pool one side, lay flat top/bottom, or escalate sheet.
- The schedule's **shape adapts** to the chosen strip (tall thin strip ⇒ 1 narrow
  column × many rows; wide strip ⇒ more columns × fewer rows).
- **Tick-mark rule:** never overlap the **extreme** (top-most / bottom-most) grid
  ticks + labels; **intermediate** ticks under a placed table are removed.
- **PDF↔DXF lockstep:** both generators make the identical decision (the PDF
  decides; the DXF consumes — same as the scale/sheet/orientation handoff).

**Non-goals**
- Multi-sheet tiling (sub-project #5) — unchanged; remains the final escalation.
- Changing schedule column *content* (SI 727 columns) or the dynamic
  column-width calc.
- Re-styling the schedule grid/borders (separate from placement).

## 3. Current architecture (what already exists — reuse, don't reinvent)

- **Quadrant whitespace ranking** (`pdfkitGeoPDF.js` ~6600): `_quadrants` ranks
  the four sheet quadrants by polygon coverage; each block (`scheduleOfAreas`,
  `outsideFigureData`, …) is given a `preferredZone` from the emptiest quadrant
  via `_nextZone()`.
- **Block placement engine:** `placeBlocks()` positions block descriptors
  (`name, width, height, mandatory, preferredZone`) avoiding the polygon +
  pre-placed blocks.
- **Schedule split path:** `_schedNeedsSplit` + a planner-side schedule search
  (`pdfkitGeoPDF.js` ~7175-7206) already split the schedule into sub-tables and
  set `blockPositions.scheduleOfAreas.placedTables`.
- **Whitespace scanner:** `computeWhitespaceZones` (`dxfTopology.js`, 3-v4) walks
  the polygon and returns clear-strip rectangles per side — already used by the
  DXF topological emitter.
- **Dynamic column widths:** `computeScheduleColumnWidths`
  (`app-shared/block-definitions.js`) gives one column-group's width.
- **DXF emit:** `emitScheduleOfAreasTopological` (`dxfScheduleEmitter.js`)
  consumes `fixedPosition` / `placedTablesGround` from the planner.
- **Grid ticks (DXF):** `addGridReferences` (`dxfGenerator.js` ~760) emits short
  inward ticks at round Cape-Lo Y/X multiples along the four drawing-bound edges.

The rebalance is therefore: **make the split path target both side strips and
centre the figure**, plus a tick-classification + cull pass.

## 4. Design

### 4.1 Whitespace measurement (before placement)

A pure function, computed once at layout time, from already-known inputs:

```
measureFigureWhitespace({ figureBBox, contentArea, fixedBlocks }) -> strips
  figureBBox  : oriented bounding box of the polygon in paper-mm at the chosen
                scale (rotation already baked into the projected points → use the
                projected pdfPoints' min/max, NOT the un-rotated extent).
  contentArea : sheet minus SI 727 margins (50 L / 150 R / 50 T / 50 B mm) minus
                the mandatory fixed blocks (title strip, SG box).
  fixedBlocks : bboxes already reserved (title, north arrow, scale bar).
  returns strips = { left, right, top, bottom } each { x, y, w, h } = the clear
                rectangle between the figure bbox and the content edge on that
                side, with the fixed blocks subtracted.
```

This is the same information `computeWhitespaceZones` already derives; the new
function is a thin, testable wrapper that returns the **four canonical strips**
plus the figure bbox so the strategy layer can reason about them directly.

### 4.2 Strategy decision tree

```
chooseScheduleStrategy({ strips, colW, rowH, headerH }) -> decision
  colW = one schedule column-group width (computeScheduleColumnWidths)

  usableSide(s) = s.w >= colW && s.h >= headerH + rowH*MIN_ROWS_PER_TABLE
  usableFlat(s) = s.h >= headerH + rowH*MIN_ROWS_PER_TABLE && s.w >= flatTableW

  if usableSide(left) && usableSide(right):
      → { figureAlign:'center', regions:[left,right], mode:'balance' }
  elif usableSide(left) || usableSide(right):
      wider = argmax(left.w, right.w)
      → { figureAlign: wider==left?'right':'left', regions:[wider], mode:'pool' }
  elif usableFlat(top) || usableFlat(bottom):
      → { figureAlign:'center', regions:[top|bottom], mode:'flat' }
  else:
      → { mode:'escalate' }   // sheet up / multi-sheet (unchanged path)
```

`MIN_ROWS_PER_TABLE` reuses the existing split constant. The decision returns a
`figureAlign` that replaces today's `alignX` heuristic, and an ordered list of
**target regions** the split path fills.

### 4.3 Multi-region schedule split + emit

- Extend the planner-side split (`_schedNeedsSplit` path) so `availableGaps` is
  the **ordered region list** from `chooseScheduleStrategy`, not a single slot.
  `planScheduleSplit` already distributes rows across multiple gaps largest-first
  — feed it both side strips so it fills left + right.
- The PDF writes the resulting `placedTables` onto
  `blockPositions.scheduleOfAreas.placedTables` (already the contract).
- The DXF consumes them verbatim via `placedTablesGround`
  (`emitScheduleOfAreasTopological`) — **no independent DXF decision** → lockstep,
  same pattern as the scale/sheet/orientation handoff.
- Each sub-table's **rows-per-column = floor((region.h − headerH) / rowH)** so the
  shape fits the strip (tall strip ⇒ many rows; flat strip ⇒ adjust columns).

### 4.4 Figure centring

Replace the `alignX` heuristic with the strategy's `figureAlign`. Verify the DXF
figure-position path honours it (the experiment showed the DXF ignores the PDF's
`alignX` today — the DXF computes its own figure offset, so this must be wired in
`dxfGenerator.js` figure placement, fed the same `figureAlign`).

### 4.5 Tick-mark handling

**Classification (per edge):** the top-most and bottom-most emitted tick on each
vertical edge (and left/right-most on horizontal edges) = **extreme**; the rest =
**intermediate**.

1. **Extreme ticks + labels are obstacles.** Add their bounding boxes to the
   pre-occupied set passed to `placeBlocks` / the split search so no schedule
   sub-table is placed over an extreme tick or its coordinate label.
2. **Intermediate ticks are culled under tables.** Emit grid ticks **after** the
   schedule `placedTables` are known; skip any tick (and its label) whose point
   falls inside a placed table's footprint. Extremes and any tick outside the
   tables remain, so the coordinate grid stays anchored and readable.

In the DXF this means `addGridReferences` takes the `placedTables` list and a
`{min,max}` per edge, and gates each tick emission on
`!insideAnyTable(tick) || isExtreme(tick)`. The PDF mirrors the same gate in its
grid-tick renderer.

## 5. PDF↔DXF lockstep

The **PDF decides** (figureAlign + region list + placedTables) and **returns**
them; the DXF **consumes** verbatim — identical to the scale/sheet/orientation
contract already shipped. The shared decision functions
(`measureFigureWhitespace`, `chooseScheduleStrategy`) live in a shared module so
both call the same deterministic code if a handoff value is ever absent.

## 6. Implementation plan (incremental — render checkpoint after each)

1. **Pure primitives + unit tests:** `measureFigureWhitespace`,
   `chooseScheduleStrategy` in a new shared module. No behaviour change yet.
2. **Wire `figureAlign`** from the decision into both the PDF (`alignX`) and the
   DXF figure-offset path. Render the 240-fixture: figure should centre when both
   sides are usable. *(checkpoint)*
3. **Multi-region split:** feed both side strips into `planScheduleSplit`; emit
   balanced left+right. Render: schedule on both edges like the ideal.
   *(checkpoint)*
4. **Tick handling:** extreme-as-obstacle + intermediate-cull, PDF and DXF.
   Render zoomed: no schedule over extreme ticks; intermediates gone under
   tables. *(checkpoint)*
5. **Fallback branches:** pool / flat / escalate — verify on a wide figure and a
   sparse figure. *(checkpoints)*
6. **Regenerate snapshots; full suite green** (dxf/schedule/pdfkit/geopdf/parity);
   update the parity test if warning sets shift.

## 7. Testing & verification

- **Unit:** `chooseScheduleStrategy` truth table (balance / pool / flat /
  escalate) over synthetic strip sets; `measureFigureWhitespace` geometry.
- **Integration:** 240-stand fixture → balanced both-sides; a wide synthetic
  fixture → flat; a sparse fixture → no schedule overflow.
- **Visual:** ezdxf→PNG render checkpoints per step, compared to the ideal.
- **Regression:** existing dxf/schedule/pdfkit/geopdf/parity suites stay green;
  DXF snapshots regenerated intentionally.

## 8. Risks & mitigations

- **Most-tested code.** Mitigate: pure primitives first; wire incrementally with
  a render + suite run per checkpoint; keep the pool/flat/escalate fallbacks so
  no figure-shape regresses.
- **PDF/DXF divergence.** Mitigate: PDF decides, DXF consumes verbatim (proven
  pattern); shared deterministic functions as the floor.
- **Tick culling removing too much.** Mitigate: only cull *intermediate* ticks
  strictly inside a table; extremes always survive; unit-test the gate.
- **Strip too thin for any column.** Mitigate: `usableSide` guard falls through to
  pool → flat → escalate; never force an overflowing placement.
