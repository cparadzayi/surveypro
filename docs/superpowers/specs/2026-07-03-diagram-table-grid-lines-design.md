# Diagram Table Grid Lines — Design

**Status:** Approved (design phase)
**Date:** 2026-07-03
**Author:** cparadzayi (with Claude)

## Problem

Three refinements to match the real SG diagram samples (`Desktop/tecno 7/IMG-20260630-WA0026.jpg`, `…WA0027.jpg`):

1. **"Metres" header is over the wrong column.** It currently sits over the SIDES
   *letters* (AB/BC…). In the samples it sits over the *distance figures*.
2. **The coordinate/directions table has no grid lines.** The samples rule it with
   an outer box, vertical column dividers, and a horizontal line under the header.
3. **The reg-53 endorsement block at the bottom has no grid.** The samples show a
   3-column ruled grid of endorsement cells.

## Scope

- Diagram plan type only — `drawTable` and `drawReferenceGrid` in
  `app-backend/src/services/diagramPdf.js`. No General/Working/DXF change.
- Content (field values, columns, coordinates) is unchanged — this adds ruling and
  moves one header label.

## Non-goals (YAGNI)

- No per-data-row horizontal lines in the coordinate table (the samples don't).
- No new fields; no change to `buildSidesTable` / `buildReferenceGrid` models.
- No change to the figure, statement, scale bar, margins, or beacon column data.

## Architecture

Both changes are drawing-only, inside the two existing draw functions. Grid lines
are stroked with `doc.moveTo/lineTo`. Colours/line positions are **not assertable
from the PDF binary**, so the acceptance is the existing valid-PDF integration test
plus a **manual visual check** against the samples (consistent with the diagram's
prior layout work). Exact line coordinates are a visual-tuning item.

### 1. "Metres" over the distances — `drawTable`

Move the `Metres` sub-header from the side-label offset (`R.x + cSide`) to the
distance offset (`R.x + cMetres`), so it sits above the `20.79 / 37.14…` figures.

### 2. Coordinate/directions table grid — `drawTable`

Add ruling (thin black, ~0.5 pt), computed from the existing column x-offsets
(`cSide/cMetres/cDir/cLetter/cY/cX/cConst`) and the row y-positions:

- **Outer box** spanning the full table width (`R.x` … `R.x + R.width`) from just
  above the header row to just below the last data row. The last row's y is derived
  from `Math.max(coordinateRows.length, sideRows.length)` (same loop `drawTable`
  already runs), so the box height follows the row count.
- **Vertical dividers** between the logical column groups, placed in the gaps
  between offsets: SIDES │ DIRECTIONS │ Lo-letter │ CO-ORDINATES │ Const. │
  DIAGRAM S.G. No. (≈ 6 verticals including the two outer edges; the divider before
  the S.G.-No. column aligns with `layout.sgNoBox.x`).
- **One horizontal line** under the two-row header (below the `Metres / ° ' " / Y X`
  sub-row, above the `Const.` row) — the header/data separator.
- The existing blank `DIAGRAM S.G. No.` box remains the top-right cell.
- No horizontal lines between individual data rows.

### 3. Reg-53 endorsement grid — `drawReferenceGrid`

Restructure the bottom block into the samples' 3-column ruled grid inside
`layout.refGrid` (outer box already drawn). Same field values (`grid.*`), re-laid
into ruled cells:

- **Two vertical dividers** → 3 columns (left ≈ 30%, middle ≈ 40%, right ≈ 30%).
- **Left column:** `This diagram is annexed to No. <annexedToNo> dated <annexedToDate>`
  (top cell) / rule / `Surveyor-General` (bottom cell).
- **Middle column**, top-to-bottom with horizontal rules between:
  `The immediate parent diagram is No. <parentDiagramNo> annexed to <parentDiagramAnnexedTo>`
  / `Deed of Transfer No. <deedOfTransferNo>` / a row split by a **vertical divider**
  into `File : <fileNo>` │ `G.P. : <registrationGp>` / `Compilation : <compilation>`.
- **Right column:** `The original title diagram is No. <originalTitleDiagramNo> annexed to`
  (top) / rule / `S.R. : <srNo>`.
- Text drawn at a small inset inside each cell; font 7 (or 6 pt if a cell is tight).

`layout.refGrid` is 100 pt tall — the middle column's ~4 rows at ~18 pt fit; if not,
nudge row heights down in the visual-tuning step.

## Error handling / edge cases

- Empty field values render as blank cells (labels still shown) — unchanged.
- Very few coordinate rows → the table box still closes under the last row (box
  bottom follows the row count).
- Grid strokes are wrapped in `save()/restore()` so line style never leaks.

## Testing

- `diagramPdf.test.js`: existing tests still pass (valid `%PDF-`, no throw) with the
  new ruling.
- Manual visual acceptance: regenerate a diagram and confirm — "Metres" over the
  distances; the coordinate table has an outer box, column dividers, and a header
  rule; the reg-53 block is a 3-column ruled grid matching the samples; nothing
  collides or crosses the neat-line border.

## Rollout

Single spec + plan. Order: `drawTable` (Metres move + grid) → `drawReferenceGrid`
(3-column grid) → manual visual. Diagram-only, one file.
