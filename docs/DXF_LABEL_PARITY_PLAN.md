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
