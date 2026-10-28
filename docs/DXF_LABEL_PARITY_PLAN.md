# Plan: bring the DXF beacon labels up to the PDF's label rules

Written 28 October 2026. This is a plan, not a change: nothing in the renderers was touched.

## 1. Where the two outputs stand

**PDF** (`pdfkitGeoPDF.js`, `renderBeacons` ≈ lines 2687–4100). For each beacon label it:

1. fits the letter *wholly inside its own stand*, clear of every boundary line, with an ink-accurate box, by `diagram/suffixLabelFit.js` (pure geometry);
2. tries, in order: its size → a smaller size (floor 6 pt) → a free rotation (up to 20°) → an inset;
3. never lets a letter land in a foreign stand, over a line, or far from its beacon;
4. for beacons that stay cramped, writes **"Inset N"** beside the beacon (no leader line), sized and turned to match the nearest road name, and draws the inset block on the sheet (`insetManager`, `beaconClusterInset`; up to 30 insets, nearby clusters merged);
5. places outside-figure vertex labels wholly outside the figure along the corner's bisector (`renderOutsideFigureVertexLabels`);
6. reports what it did in `labelMetrics`, and `pdfkitGeoPDF.labelGate.test.js` fails the build when a hard rule is broken.

**DXF** (`dxfGenerator.js` ≈ lines 1616–1810, helpers in `dxfBeaconPlacer.js` and `dxfLabelPlacer.js`). One compact loop, no insets, no gate:

| Rule | PDF | DXF today |
|---|---|---|
| Letter wholly inside its stand, clear of lines | `fitSuffixLabel`, ink-accurate | `placeSuffixLabelPOIDirected`: steps out along the corner bisector and accepts the first spot whose box **centre** is inside the stand and clear of other labels (the same centre-only test the PDF used before it was fixed, so a letter can straddle a boundary line); if nothing passes it uses the **stand centroid** |
| Smaller size when cramped | yes, down to 6 pt | no: one fixed height for every label |
| Free rotation at tight corners | yes, ≤ 20° | no: `addText` is called without a rotation |
| Inset for what still does not fit | yes ("Inset N" + block) | none: a cramped letter goes to the centroid fallback, which may be far from its beacon |
| Never in a foreign stand | enforced | not enforced |
| Outside labels wholly outside the figure | enforced (`straddlesFigure`) | `tryTightFullBeaconLabelPosition`, then edge-anchored, then a fixed offset as a last resort, with no "wholly outside" check |
| Measured | `labelMetrics` + a regression gate | nothing |

The DXF's own header says it "matches the PDF generator's renderBeacons logic" and cites PDF line numbers from an earlier version: it is a **snapshot** of the PDF's old placement, not a shared rule. `suffixLabelFit.js` was written to be shared (its header says "the PDF and DXF writers share one rule"), but today only the PDF and `beaconClusterInset.js` import it. The single-stand **diagram** renderers do share `diagram/vertexLabel.js` between PDF and DXF; the general-plan renderers never got the same treatment.

## 2. What can be reused and what cannot

Reusable as they are (pure geometry, no PDFKit): `diagram/suffixLabelFit.js` (`fitSuffixLabel`, `boxFitsInside`), `beaconClusterInset.js` (`clusterCramped`, `clusterWindow`, `rotatedBoxClear`, `fitIndicatorRing`, `placeStandNumber`), the spatial-grid `LabelCollisionDetector` (needs moving out of `pdfkitGeoPDF.js`).

Needs extracting before it can be shared: the decision logic inside `renderBeacons` is a ~1,400-line function in which geometry and `doc.*` drawing calls are interleaved (`noteLetter`, `placeTag`, the road-name sizing, the group-inset creation, `renderOutsideFigureVertexLabels`).

Has no DXF counterpart at all: drawing the inset **block** (`renderBeaconClusterInset(doc, …)` and the composite cells in `insetManager`). The DXF page has its own block placer (`dxfBlockPlacer.js`) and emitters (`dxfScheduleEmitter.js`); an inset emitter would be new.

DXF facts that make the port easier than it looks: `addText` already accepts a rotation (group 50, degrees); the text width is exactly `characters × height × 0.55` because the entity carries width factor 0.55 (group 41), so the box estimate can be exact; the UI-supplied `beaconLabelMap` already carries the same label decisions the PDF uses (`labelDecision`).

Facts that make it harder: DXF is y-up in ground metres with a baseline-left insertion point, the PDF is y-down in points with a centred box, so every rotation and anchor needs converting once, in one place; the DXF tests that render the big Maglas plan take 20–30 minutes each, so new checks must use small fixtures.

## 3. Phases

Each phase ends green and can be shipped on its own. Phases 1–2 change no page layout; Phase 3 does.

### Phase 0: measure first (about half a day)
- Build a DXF test helper that renders the label-gate survey (`fixtures/labelGateSurvey.json`, via `helpers/buildSurveyPlan.js`) and parses the `BEACON_LABELS` TEXT entities (position, height, rotation) with the existing `dxfParse.js`.
- Compute the DXF equivalent of the PDF hard rules from those entities and the parcel rings: letters whose box crosses a boundary line, letters outside their own stand or inside a foreign one, outside-figure labels that touch the figure, letters smaller than the floor, mean distance to the beacon.
- Record today's numbers as the baseline. **This tells us how big the gap really is before anything is changed**, and it may show some rules are already met.
- Add `dxfLabelGate.test.js` with budgets set to the baseline (they only tighten), as the PDF gate does.

### Phase 1: in-stand letters through the shared rule (about 1 day)
- Replace `placeSuffixLabelPOIDirected` in the DXF loop with `fitSuffixLabel`, passing ground-metre coordinates, `fontSize = beaconLabelHeight`, `widthAt = n × h × 0.55`, `ink: true`, and the collision registry as `collides`.
- Convert the result once (a small `toDxfText()` helper): box centre and angle → baseline-left insertion point and group-50 rotation, with the y-up sign flip.
- Floor and shrink in ground units (`ptToGround`), so the 6 pt floor holds on every scale.
- Letters that come back `cramped` are *kept where they are* in this phase (no insets yet) and counted, so Phase 3 has its input.
- Gate: the in-stand hard rules go to zero violations; PDF gate must stay green.

### Phase 2: outside labels and the shared collision grid (about 1 day)
- Move `LabelCollisionDetector` into a shared module and use it in both writers (the DXF registry is a simple list today).
- Extract the pure part of `renderOutsideFigureVertexLabels` (bisector bearing, `straddlesFigure`, distance-first search) and call it from the DXF in place of `tryTight…`/`calculateFullBeaconLabelOutsideOnEdge`.
- Gate: no outside label touches the figure; labels stay close to their beacon.
- Risk: touching the PDF function. Protected by `pdfkitGeoPDF.labelGate.test.js` (about 4.5 minutes) and the existing PDF label tests; run both before each commit.

### Phase 3: insets in the DXF (about 3–4 days, the large part)
1. **Extract the decision from the drawing** in `renderBeacons`: a pure `planBeaconInsets({ cramped, beacons, parcels, roadNotes, … })` that returns the clusters, their numbering, the tag position/size/rotation beside each beacon, and the inset window for each cluster. The PDF then calls it and draws; this refactor is the main risk and is done first, with the PDF gate as the safety net and *no behaviour change* as the acceptance test.
2. **DXF "Inset N" tags**: emit the planned tags as TEXT on `BEACON_LABELS`, using the same size/rotation rules (nearest road name, 5–8 pt equivalent, 6 pt floor).
3. **DXF inset blocks**: a new emitter that draws each cluster window (boundary lines, beacon circles, letters, stand numbers) at the enlarged scale, in the DXF's own block placement, following the schedule emitter's pattern. Respect the PDF's cap of 30 and its merging of neighbouring clusters.
4. Capacity: the block placer must be told about the extra blocks; if there is no room it should raise the same "plan too dense" warning the PDF does, not overlap the figure.

### Phase 4: parity check (about half a day)
- A test that renders the same survey to both formats and compares *decisions*, not pixels: same set of beacons in insets, same inset numbering, same letters inside stands, within a small positional tolerance.
- Add the DXF to `docs` as covered by the label rules, and note the gate in `CLAUDE.md` next to the PDF gate.

## 4. Decisions needed from you

1. **Ring and leader.** The PDF draws a dashed ring round each inset cluster (restored in your own commits after the "no ring, no leader" rule). Should the DXF draw the ring, or follow the rule as originally stated (label beside the beacon only)?
2. **Scope.** Phases 0–2 alone fix every *in-stand* and *outside* rule with no layout change and no new blocks. Do you want Phase 3 (insets) at all in the DXF, given that CAD users can nudge a label by hand?
3. **Inset block placement.** In the DXF, should insets live on the sheet as blocks like the PDF, or on a separate layer/sheet so the main drawing stays clean?
4. **Fixtures.** Phase 0 uses the label-gate survey. Is there a smaller plan you would rather the DXF be judged on, given the Maglas plan takes 20–30 minutes to render in tests?

## 5. Risks

- **PDF regressions** from extracting shared code: mitigated by running the PDF label gate and tests before every commit, and by doing extraction steps as no-behaviour-change commits.
- **Viewer differences**: DXF text is drawn by the CAD program's own font, so a box estimate is only as good as the 0.55 width factor; the gate should allow a small margin and a note in the output says so.
- **Test time**: keep every new DXF check on small fixtures; run the Maglas suites only at the end.
- **Scope creep**: Phase 3 is a project in itself. Ship 0–2 first.

## 6. Suggested order and size

Phase 0 → 1 → 2 as one piece of work (about 2.5 days, no layout change). Decide on Phase 3 after seeing the Phase 0 baseline and the Phase 1–2 results.

## 7. Progress (28 October 2026)

| Phase | Result | Commit |
|---|---|---|
| 0 Measure | `generateDXF` returns `labelMetrics`; `dxfLabelMetrics.js` counts the rules; `dxfLabelGate.test.js` guards them. Baseline on the surveyed plan: **36 of 357 letters over a boundary line, 3 in a foreign stand, 5 of 5 figure-corner names over the figure, furthest letter 8.8 m from its beacon.** | `8804684` |
| 1 In-stand letters | Letters go through the PDF's shared `suffixLabelFit` (wrapper `dxfLetterFit.js` converts ground metres, y up, to the fit's points, y down, and back). **Letters over lines 36 → 0, foreign stand 3 → 0, furthest letter 8.8 m → 3.3 m, none cramped.** | `9cfdf47` |
| 2 Outside labels | Figure-corner names by the PDF's outside-vertex rule (`dxfOutsideLabel.js`): **over the figure 5 → 0**, 19 pt from their beacons (the PDF's bound is 30 pt). | this commit |

**Baseline decision for Phase 3 (insets).** At the DXF's own scale (1:500 for this plan) the shared fit places **all 357 letters at full tier, none cramped**, so nothing would go to an inset in the DXF here. The PDF needed 2 insets because it chose 1:600 for the same plan. Insets in the DXF would only matter on a plan the DXF has to draw at a coarser scale than 1:500; that is a reason to defer Phase 3 rather than build it now.

**Notes and limits**
- The checks use the placer's own box model for the text (width = characters × cap height × 0.55). They hold with glyphs 15 % wider than that model and start to fail at 30 % wider (25 letters), so a wide capital such as M or W in a CAD font is the margin to watch.
- The outside-vertex search is a **copy** of the PDF's (`renderOutsideFigureVertexLabels`), not a shared module: extracting the PDF's inline version was left out to keep the PDF untouched. The two should be unified if either changes.
- `dxfGenerator.snapshot.test.js` was already failing before this work (its stored entity lists predate the scale-derived tick grid and other changes; the same 442-line diff appears at the Phase 0 commit). It was left alone: refreshing it means reviewing ~8,000 lines. This work changes no entity on its three fixtures except the four figure-corner names A-D in Phase 2.

## 8. Phase 3 in detail: insets in the DXF

Written after Phases 0-2, from measurement and from reading the PDF inset code (`renderBeacons`, about lines 3500-4030 of `pdfkitGeoPDF.js`, `insetManager.js`, `beaconClusterInset.js`) and the DXF's block machinery (`dxfBlockPlacer.js`, and the bottom-zone placement in `dxfGenerator.js`, about lines 2640-2800).

### 8.1 When would the DXF actually need insets? (measured)

The surveyed plan (357 stand letters) through the DXF at different scales. "Cramped" means the shared fit could not seat the letter at full or near-full size without it touching a boundary line; in the PDF these go to insets.

| DXF scale | cramped letters | letters still over a line |
|---|---|---|
| 1:500 (what the DXF chooses for this plan) | 0 | 0 |
| 1:800 | 0 | 0 |
| 1:1000 | 11 | 10 |
| 1:1500 | 4 | 4 |
| 1:2000 | 14 | 12 |

The other four sample plans contain no stand letters at all, so they say nothing either way.

So the DXF needs insets only when a plan is drawn at 1:1000 or coarser **and** has narrow stands. That happens when a surveyor declares a coarse scale, or the sheet cannot hold a finer one. At that point the DXF breaks the "no letter over a line" rule today, and nothing tells the surveyor.

### 8.2 A cheap step that comes first, whatever is decided: say so ("Phase 3-lite", about half a day)

Count the cramped letters in `generateDXF` and put one plain sentence in the warnings the route already sends (`X-Plan-Warnings`, shown in the result notice). For example: "12 beacon letters are too close together to fit at 1:2000 and are drawn at the smallest size, touching a boundary line. Use a finer scale, or the PDF, which magnifies them in insets." Add the count to the DXF gate at 1:1000. No layout change, no PDF change, and the surveyor is no longer surprised.

### 8.3 What a full DXF inset needs

Four separable pieces, with the PDF code each corresponds to and how reusable it is.

| # | Piece | PDF source | Reuse |
|---|---|---|---|
| a | Which letters go to insets, grouped into clusters and then blocks | `clusterCramped` (pure); the grouping into blocks (`GROUP_REACH_PT` 150, `GROUP_MAX` 4, cap 30) is inline in `renderBeacons` | cluster step reusable as is; block grouping is about 25 lines to copy |
| b | The window each cluster magnifies, its scale and number | `clusterWindow` (pure); numbering in `InsetManager` | reusable as is (in paper points) |
| c | The "Inset N" tag on the plan, beside the beacon in the open ground, turned to the road, never in a foreign stand | `placeTag` (about 300 lines: frontage direction, alignment to neighbouring clusters, nearest road name's size and angle, stand avoidance) | tied to PDF state (`doc.widthOfString`, `avoidSegments`, road-name notes); needs porting or extracting |
| d | The block itself on the sheet: border, "Inset N: Not To Scale", the magnified boundary lines clipped to the cell, beacon circles, letters placed by the shared fit, stand numbers (`placeStandNumber`, pure), north arrow | `renderBeaconClusterInset` and the composite cells in `insetManager` (PDFKit drawing calls) | geometry helpers reusable; the drawing is PDFKit-only, so a DXF emitter is new |

Things that are different in a DXF and must be handled, not copied:

- **No clipping.** The PDF clips the magnified drawing to the cell with `doc.clip()`. DXF has none, so every boundary segment must be clipped to the cell rectangle by hand (Liang-Barsky on each segment; a polygon clip would draw a false edge along the cell border).
- **Placement and room.** The PDF finds spots for inset boxes in the map area itself. The DXF page is planned in layers: the sheet and scale are resolved first, then the schedule, then the small bottom-zone blocks are relocated into leftover whitespace by `findBlockPosition`. Inset blocks (60 mm square per cell, 2 across, so up to 120 x 120 mm) would join that relocation pass. They are bigger than any current small block, so the block-room budget would need to know about them, or a plan could escalate to a larger sheet late. The existing escalation path handles the schedule; it would need to count insets too.
- **Letters moved off the plan.** In the PDF a cramped letter is not drawn on the main plan: the tag marks the cluster and the letter appears in the cell. The DXF would do the same, which changes the label records the gate reads.
- **Numbering and sheets.** Insets are numbered per drawing. With one DXF per sheet (`generateSheetedDXF`) numbering restarts in each file, as it does per page in the PDF.
- **Layer.** Everything goes on its own layer (`INSETS`, plus the tag on `BEACON_LABELS`) so a CAD user can switch it off.

### 8.4 Two ways to build it

**Option A: a DXF planner that reuses the pure helpers and duplicates the inline logic (recommended if insets are wanted).** A new `dxfInsetPlanner.js` holds blocks (a) and (b) and a simplified tag placement (c); a `dxfInsetEmitter.js` draws (d). `renderBeacons` is not touched, so the PDF cannot regress. A parity test renders the surveyed plan through both at the same declared scale (1:600 and 1:1000) and requires the same clusters, the same blocks and the same numbers. About 4-5 days.

**Option B: extract a shared planner from `renderBeacons` first, then use it from both.** Better long term (one rule, no copy), but `renderBeacons` is about 1,400 lines of interleaved decision and drawing, and the extraction must be a no-behaviour-change refactor guarded by the PDF label gate (4.5 minutes per run). About 7-9 days, with the PDF as the thing at risk.

Either way the PDF label gate and the DXF label gate both run before every commit.

### 8.5 Order of work for Option A

1. **8.2 (Phase 3-lite):** the warning and the 1:1000 gate. Ship alone.
2. **Planner:** clusters, blocks, numbers, windows (pure, unit-tested against the PDF's `clusterCramped` and `clusterWindow` on the same input).
3. **Tags:** "Inset N" placement outside every stand, clear of lines and labels, along the nearest road, with the 6 pt floor and the road-name size rule; gate rules copied from the PDF gate (not in a foreign stand, at least 5 pt, beside its beacon).
4. **Emitter:** the cell drawing with hand clipping, letters through `fitDxfSuffixLetter`, stand numbers through `placeStandNumber`; checked by parsing the DXF back (entities inside the cell rectangle, nothing outside it).
5. **Placement:** blocks join the bottom-zone relocation; the room budget and sheet escalation learn about them; a plan with no room warns "plan too dense for insets" instead of overlapping the figure.
6. **Parity test and gate budgets at 1:1000, 1:1500, 1:2000** (hard rules at zero, as in the PDF).

### 8.6 Risks specific to Phase 3

- **Sheet growth:** blocks up to 120 x 120 mm can push a plan to the next sheet size. Mitigation: measure on the 1:1000 and 1:2000 runs of the surveyed plan before wiring placement.
- **Tag placement is the subtlest part.** It has the most surveyor feedback behind it in the PDF (not in a foreign stand, along the road name, no leader, at the road name's size). A simplified copy will look slightly different from the PDF's; the parity test checks which cluster gets which number, not pixel positions.
- **The dashed ring.** The PDF still draws a dashed ring round each inset cluster (restored in the user's own commits after the "no ring" instruction). The DXF can follow either rule; see the decision below.
- **Viewer differences** for the magnified text (width factor 0.55): same margin as Phase 1.

### 8.7 Decision needed

1. **Do 8.2 now?** Recommended in all cases: half a day, no downside.
2. **Full DXF insets?** My recommendation is not yet. The DXF only needs them at 1:1000 or coarser on a dense plan, and 8.2 makes that visible. Build them (Option A) if surveyors are actually exporting DXFs at those scales.
3. **If yes: A or B?** A, unless you want the PDF's inset code unified in the same effort.
4. **Ring or no ring in the DXF insets**, and **a separate layer** for the blocks (recommended).
