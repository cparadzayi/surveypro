# Multi-Sheet Plans by Outside-Figure Split — Design

**Date:** 2026-09-26
**Status:** Design, awaiting review
**Prompted by:** a 240-stand general plan on `SI727_1000x800` whose schedule of
areas cannot be seated beside its figure at any column count.

## Goal

Let one survey be lodged on several sheets, where the surveyor decides the
division by splitting the primary outside figure, and each sheet carries the
parcels inside its own part of that figure together with their schedule.

The division is the surveyor's judgement, not the software's. The software's job
is to make the consequences of that judgement correct and automatic: which
parcels belong to which sheet, what each sheet's outside figure is, what its
schedule lists, and how each sheet describes itself.

## Why not the alternatives

**Not a smaller scale.** Shrinking the figure to buy schedule room costs stand
and beacon label placement, which is what a general plan exists to show. The
surveyor rejected this explicitly.

**Not automatic grid tiling.** `generateTiledGeoPDF` already tiles by a computed
row-major grid (`pdfkitGeoPDF.js:12956`). A grid cuts wherever the arithmetic
lands, including through stands. The division of a township across sheets is a
cartographic decision.

**Not N independently drawn outside figures.** Drawing OFSHEET-1..N by hand
cannot guarantee they tile the primary figure. A sliver of gap between two of
them puts a stand on *neither* sheet, and nothing detects it — a silent omission
is worse than a visible straddle. Splitting the primary figure makes coverage
true by construction: the parts always sum to the whole.

## Context (as-found)

Verified against the tree at `7964faf`. More of this exists than expected.

| Capability | State | Evidence |
| --- | --- | --- |
| Multi-sheet PDF assembly | **Exists** — key plan + one sheet per tile, merged into one buffer | `pdfkitGeoPDF.js:12956 generateTiledGeoPDF` |
| `SHEET N` chrome | **Exists** in both renderers | `dxfGenerator.js:130 formatSheetLabel`; `sheetInfo = { sheetNumber, totalSheets }` |
| Seventh Schedule (b) inter-sheet wording | **Exists, unused** | `block-definitions.js:215 figureDescription.multiSheetTemplate` |
| Outside figure container | **Already a FeatureCollection** — only the consumer is single-minded, taking `features[0]` | `pdfkitGeoPDF.js:1142`, `:1746` |
| Outside figure identity | A digitised parcel recognised **by name** (substring `"outside figure"`) | `parcelValidation.ts:41`, `designationParcels.ts:34` |
| Per-sheet content filtering | **Exists**, by bounding box | `generateTiledGeoPDF`'s spatial filter |
| Polygon/area predicates | **Exists** in PostGIS, already used for overlap detection | `landParcel.js:387 ST_Intersection / ST_Area` |
| Beacon status vocabulary | Two axes: kind (`WS`/`WSU`/`RM`/`TRIG`/`OCP`) and provenance (`F`/`FN`/`P`) | `beaconStatus.ts` |
| Sheet ladder | `500x400 → 800x500 → 1000x800`, then `'multi-sheet-required'` | `dxfScheduleHelpers.js:18`, `:66` |

Two latent defects this work must not inherit:

1. Because the outside-figure name rule is a **substring** match, a surveyor can
   already digitise several outside-figure parcels today. The renderer would
   silently use only `features[0]` and exclude the rest from the schedule.
2. `nextLargerSheet()` returns `'multi-sheet-required'` at the top of the ladder,
   and nothing implements it. This design is what that string has been waiting
   for.

## Decisions

Each was settled with the surveyor during design.

1. **Every sheet is a full survey-plan sheet** — title block, `SHEET n of N`,
   designation, Surveyor-General box, endorsements. Not a plain continuation
   sheet.
2. **Sheets derive from splitting the primary outside figure**, never from a
   grid and never from independently drawn polygons.
3. **A split is one polyline** whose interior lies strictly inside the primary
   figure and whose two endpoints lie on its boundary. Exactly two boundary
   crossings — the necessary and sufficient condition for one cut to divide a
   simple polygon into two parts.
4. **Each endpoint is either snapped** to an existing outside-figure point **or
   projected onto an edge**, creating a new point. All four combinations of
   snap and cross across the two endpoints are permitted; they are the same rule.
5. **Cuts run through road space, not along stand boundaries.** Snapping a cut to
   the boundary chain between stands drags every intervening beacon into the new
   figure and makes each sheet's outside-figure data table unmanageable in a
   developed township. A cut down a road reserve adds only the vertices its bends
   require, and still cannot slice a stand.
6. **New points carry provenance `-`** in the Coordinate List: neither found nor
   placed, because they were defined rather than surveyed. They appear in the
   Calculations pages and the Coordinate List as ordinary points.
7. **A cut that crosses a digitised stand is refused and reported**, naming the
   offending stands. Public places are exempt.
8. **Each sheet carries the schedule of areas for its own stands**, and its
   servitude statement for its own stands.
9. **Each sheet is worded per SI 727 Seventh Schedule (b)**, using the existing
   `multiSheetTemplate`.
10. **Sheets are numbered geographically**, north to south then west to east,
    by outside-figure centroid. Numbers are derived from the current splits
    rather than stored.
11. **Naming.** On a multi-part general plan each part is `Outside Figure Sheet
    N`; on a single-sheet plan the figure is simply `Outside Figure`.
12. **A cut that grazes a stand boundary is refused and the stand named.** The
    tool never silently moves the surveyor's cut onto a stand.
13. **Clicked points round to 2 decimal places** (10 mm), per convention.

## Part 1 — The sheet model

A plan gains an ordered list of sheets. Sheet *n* is defined by one part of the
split primary figure:

```
Sheet {
  sheetNumber,          // 1-based
  outsideFigure,        // the part polygon, closed and lettered
  parcels,              // stands whose geometry lies inside outsideFigure
  newPoints,            // outside-figure points created by the cut
}
```

`sheetInfo` already exists and already drives the `SHEET N` line in both
renderers. It gains two fields the Seventh Schedule template needs:

- `figureLabel` — this sheet's beacon sequence, e.g. `AB.BC.CD.DA.AB`
- `otherSheets` — a rendered list naming the rest, e.g. `sheets 2 and 3`

In **PDF** the plan remains one document and sheets are pages, as
`generateTiledGeoPDF` already produces them. In **DXF** each sheet is its own
file (Part 6). The sheet model is shared; only the packaging differs.

### Ordering

Sheets are numbered **geographically: north to south, then west to east**, by
the centroid of each sheet's outside figure. This matches how
`generateTiledGeoPDF` already numbers its tiles, and how a reader holding three
sheets expects them to run.

In Lo co-ordinates that is X ascending (X increases southward), then Y
ascending (Y increases eastward). So the ordering key is `(centroidX,
centroidY)` ascending.

Two consequences, both accepted:

- **Sheet numbers are derived, not stored.** They are recomputed whenever the
  splits change, so they always describe the current geography. A surveyor who
  re-cuts may see sheets renumber, which is the cost of numbers that are always
  true.
- **Irregular splits are ordered, not banded.** A strict sort on
  `(centroidX, centroidY)` gives row-major order for a grid-like division, but
  it does not group sheets into rows. For an L-shaped or staggered division the
  order is still deterministic and still runs broadly north-to-south; it simply
  is not a tidy grid, because the division is not one.

## Part 2 — The split tool

### The invariant

A cut is valid when, and only when:

- both endpoints lie **on** the boundary of the figure being split, and
- the interior of the polyline lies **strictly inside** it, and
- it therefore crosses the boundary exactly **twice**.

Everything else is a consequence. The four cases the surveyor enumerated —
snap/snap, cross/cross, snap/cross, cross/snap — are the two endpoint kinds in
combination, not four separate rules.

### Endpoint handling is mandatory, interior handling is free

Intermediate vertices are clicked free-hand down the road space and are taken as
given. **Endpoints are not.** A click that lands 300 mm off the boundary must be
projected onto the nearest boundary segment, exactly. Left approximate, the two
resulting figures fail to close against each other: a gap or an overlap at the
one place they must meet.

When an endpoint is projected onto an edge rather than snapped to a vertex, that
edge is **split**. A cut landing on side `CD` leaves `C→X` on one sheet and
`X→D` on the other. Both sheets' outside-figure data tables are therefore
*derived*, not filtered copies of the primary table.

### What the tool produces

```
splitFigure(primary, polyline) -> { partA, partB, newPoints } | { error, straddling }
```

A pure geometric operation, testable without a map. The interactive layer
supplies the polyline and renders the result.

## Part 3 — New outside-figure points

A point created by a cut is a real survey point in every respect except
provenance: it has coordinates, a name, a place in the Calculations pages and a
row in the Coordinate List. What it does not have is a mark in the ground.

`BeaconProvenance` gains `'-'` alongside `F`, `FN` and `P`. The Coordinate List
prints it in the `F/P` column literally as `-`.

This matters beyond bookkeeping: a coordinate stated to the millimetre normally
implies a measurement. These were defined by a click. The dash is what tells a
reader — and the Surveyor-General — which kind of number they are looking at.

## Part 4 — Per-sheet derivation

Everything on a sheet follows from its part of the figure.

| Element | Derivation |
| --- | --- |
| Parcels | Stands geometrically inside the part polygon |
| Schedule of areas | Rows for those stands only |
| Servitude statement | Servitudes involving those stands only |
| Outside figure data | The part's own sides and co-ordinates, including the cut |
| Lettering | Each part letters its own figure independently from `A` |
| Figure description | `multiSheetTemplate`, with this sheet's `figureLabel` and `otherSheets` |

The cut line belongs to **both** adjacent sheets — as one side of each. The same
physical points therefore appear in two outside-figure tables under two different
letters. That is correct, and it is why lettering is per sheet.

Deriving the schedule per sheet dissolves the problem that prompted this work: a
schedule of a third the rows seats beside its figure without difficulty.

## Part 5 — Validation

Before a split is accepted:

1. **Exactly two boundary crossings.** Otherwise the cut does not divide the
   figure in two, and the tool says so.
2. **No digitised stand is crossed.** Any stand whose geometry the polyline
   intersects is collected, and the split is refused with those stand numbers
   named. `ST_Intersection` already does this work for duplicate detection
   (`landParcel.js:387`); this is the same primitive.
3. **Public places are exempt** from (2). Roads are not digitised today, so the
   exemption is dormant — but it must exist before they are, or every split along
   a road will be refused.
4. **Both parts are non-empty.** A cut that isolates no stands is a mistake.

Refusal names the stands. It never silently adjusts the cut.

## Part 6 — PDF and DXF

Both renderers already take `sheetInfo` and already draw the `SHEET N` line. The
work is to render *N* sheets rather than one, and to give each the content Part 4
derives.

- **PDF:** `generateTiledGeoPDF` already assembles a multi-page document from a
  list of sheets. Its per-sheet content filter changes from a bounding box to
  polygon containment. Its tile-grid input is replaced by the sheet list.
- **DXF:** one file per sheet, named by sheet number, consistent with how plan
  outputs are already filed per type.

The two must agree on parcel-to-sheet assignment. They already share
`planSheetLayout`; assignment belongs in `app-shared` for the same reason.

## Part 7 — Testing

The geometry is pure and deserves the weight of the tests.

- `splitFigure` — the four snap/cross combinations; a cut with fewer or more than
  two crossings refused; a cut crossing a stand refused with that stand named; a
  cut crossing a public place allowed; endpoint projection landing exactly on the
  edge; an edge correctly split into two sides.
- Parcel assignment — a stand inside, a stand outside, a stand touching the cut.
- Per-sheet schedule — rows on a sheet are exactly its stands, and the union over
  sheets is the whole survey with nothing repeated and nothing lost. This is the
  test that catches a sliver gap.
- Seventh Schedule wording — `figureLabel` and `otherSheets` render correctly for
  2 and 3 sheets.
- Renderer parity — PDF and DXF assign the same parcels to the same sheets.

## Decomposition — what this is NOT

This design is one sub-project. Deliberately excluded:

- **Key plan content.** `generateTiledGeoPDF` already emits a key plan sheet.
  Whether it should show the split figure outlines is a separate question.
- **Re-splitting and undo.** Editing an existing split is a UI concern, designed
  once the geometry is settled.
- **Automatic split suggestion.** The software does not propose where to cut.
- **Boundary-constrained routing.** Routing a cut along shared parcel edges was
  considered and rejected for developed townships (Decision 5). It may suit
  farm-scale surveys later, and would need a clean edge graph — this data has
  known topology trouble (stale `cape_lo_points`, a vertex matching at 1.164 m).

## Out of scope

- Splitting a figure into more than two parts in one operation. Repeat the cut.
- Non-contiguous sheets.
- Any change to how the primary outside figure itself is digitised.

## Resolved risks

The three risks this design opened with are now settled.

### Naming, and why the parts are not parcels

Each part is named `Outside Figure Sheet N`; a single-sheet plan keeps plain
`Outside Figure`. Both forms satisfy the existing substring predicate
(`includes('outside figure')`), so no recognition rule changes.

Critically, **the parts are derived, not stored**. The primary figure remains the
one digitised parcel; parts are computed from it and the cuts, exactly as sheet
numbers are. This keeps a single source of truth and, incidentally, removes the
latent defect recorded earlier: because only one stored parcel ever matches the
predicate, the `features[0]` consumers stay correct and cannot silently drop a
second outside figure. `Outside Figure Sheet N` is a display name — it heads
the sheet's outside-figure data table and feeds `figureLabel` — not a row in the
parcel table.

### Topology near the cut

A cut that comes to touch a stand boundary is **refused**, naming that stand, and
the surveyor moves their own cut. The ambiguous case — a stand that merely
touches the cut, where containment could resolve either way — is therefore
removed by rejecting it, not by resolving it.

This reverses an earlier draft of this decision, which had the cut SNAP onto the
stand boundary within tolerance. That could not work. Snapping a vertex onto a
stand's boundary makes the cut touch that stand, and because the intersection
test counts endpoint contact, the straddle rule then names it and refuses the
split anyway — so the snap bought nothing and cost the surveyor a silently
moved point. Allowing the touch instead would have meant weakening the straddle
rule, which is the check that stops a sliced stand reaching the
Surveyor-General. The draft also contradicted Part 5's "it never silently
adjusts the cut". Refusing honours Part 5, keeps the straddle rule at full
strength, and leaves the geometry the surveyor drew as the geometry that is
lodged.

The **0.10 m** tolerance remains, in the place it does real work: snapping a
cut's ENDPOINT onto an existing outside-figure point (Decision 4), so a cut
starting at a known beacon reuses it rather than inventing a duplicate a
centimetre away. It is not a stand tolerance. It sits an order of magnitude above the 10 mm
rounding of clicked points, and well below any real separation between a road
reserve and the stands fronting it. It is a judgement rather than a derived
number, and it is the one value here most worth revisiting against real data:
this survey already shows a vertex matching at 1.164 m, which is far outside the
tolerance and would correctly be left alone rather than silently snapped.

### Precision of clicked points

Clicked points round to **2 decimal places** (10 mm), matching the convention
used elsewhere in the co-ordinate output. The rounding happens once, where the
point is created, so the same number reaches the outside-figure table, the
Calculations pages and the Coordinate List. Rounding later, or per consumer,
would let the three disagree in the last digit.
