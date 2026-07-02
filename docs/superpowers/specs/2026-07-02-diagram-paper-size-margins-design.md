# Diagram Paper Size (A4/A3) + Margins — Design

**Status:** Approved (design phase)
**Date:** 2026-07-02
**Author:** cparadzayi (with Claude)

## Problem

Two gaps in the Diagram output:
1. **A4 is not selectable.** The paper-size dropdown (`SurveyPlanMapView.vue:349-352`) only offers `auto / ISO_A2 / ISO_A1 / ISO_A0`, and the backend `SI727_SHEET_SIZES` (`si727Constants.js`) has only A2/A1/A0 (landscape). The Diagram renderer (`diagramPdf.js`) hard-codes A4 portrait and ignores the dropdown entirely.
2. **No proper margins.** The Diagram uses a fixed `REGIONS` map with ~14 mm uniform inset. Cadastral sheets need a **35 mm left / 15 mm top-right-bottom** binding margin with a drawn neat-line border.

## Scope

- **Diagram plan type only.** A4/A3 selectable for Diagram; General plans keep A2/A1/A0; the Diagram renderer honors the chosen A4/A3.
- **Margins (35 L / 15 others) apply to the Diagram only.** General/Working renderers keep their existing SI 727 margins.
- **Working Plan A4/A3 is deferred** to sub-project #3 (its dedicated renderer). Today `working-plan` falls through to the general A2/A1/A0 renderer; it is unchanged here.
- Margin rendered as a **drawn neat-line border + content inset**.

## Non-goals (YAGNI)

- No A4/A3 for General or Working plans; no changes to `SI727_SHEET_SIZES` or the general-plan/DXF renderers.
- No landscape A4/A3 (Diagram is portrait).
- No new margin config UI — 35/15 is fixed for the Diagram.

## Constants

- `MM_TO_PT = 72 / 25.4` (≈ 2.83465).
- Margins: `left = 35 * MM_TO_PT` (≈ 99.21 pt), `top = right = bottom = 15 * MM_TO_PT` (≈ 42.52 pt).
- Page dims (portrait, pt): **A4** = `595.28 × 841.89`; **A3** = `841.89 × 1190.55`.

## Architecture

### 1. Pure layout helper — `app-backend/src/services/diagram/diagramLayout.js`

Replaces the hard-coded `REGIONS` map with a computed layout.

`computeDiagramLayout({ pageWidthPt, pageHeightPt, margins }) => { border, table, sgNoBox, beaconDesc, northArrow, approved, figure, scaleBar, statement, refGrid }`

- `margins = { left, top, right, bottom }` in pt.
- **Content box:** `x = left`, `y = top`, `width = pageWidthPt - left - right`, `height = pageHeightPt - top - bottom`.
- **`border`** = the content box rect (the neat line is drawn on it).
- **Vertical band stack** inside the content box, top → bottom, all full content-width except where noted; fixed heights except `figure`, which flexes to fill the remainder:
  | Band | Height (pt) | Notes |
  |------|-------------|-------|
  | `table` | 150 | full width |
  | header row | 55 | holds `beaconDesc` (left ~45%), `northArrow` (center, w 40), `approved` (right, w 175) |
  | `figure` | **flex** = contentHeight − (sum of fixed bands) | full width |
  | `scaleBar` | 34 | centered, w 160 |
  | `statement` | 64 | full width |
  | `refGrid` | 100 | full width |
- `sgNoBox`: right-aligned within the `table` band top (w 100, `x = contentRight - 100`, matching today's blank S.G.-No. box).
- All rects are `{ x, y, width, height }` in absolute page pt. The existing draw helpers already read region origins (`R.x`, `R.y`) and the SG-No box via its rect, so they consume this output unchanged; the only band-internal column offsets that matter (table columns at `R.x+90/+190/+245/+320`) still fit A4 content width (~454 pt) and A3 (~700 pt).

### 2. Renderer honors size + draws the border — `app-backend/src/services/diagramPdf.js`

- `generateDiagramPDF(options, logger)` reads `options.sheetSize` (`'A4'` default, `'A3'`; anything else → `'A4'`), maps to portrait page dims, builds `margins` from the constants, and calls `computeDiagramLayout`.
- Replace the module-level `REGIONS` const and the `A4` const usage: create the `PDFDocument({ size: [pageWidthPt, pageHeightPt], margin: 0 })`, and pass the computed `layout` to the draw functions (in place of the `REGIONS` references they use today).
- Draw the **neat-line border**: `doc.rect(border.x, border.y, border.width, border.height).lineWidth(1).stroke()` before the bands.
- Return `{ pdfBuffer, scale, sheetSize }` with `sheetSize` = the resolved `'A4'`/`'A3'`.
- The figure transform is unaffected in shape: `pickDiagramScale`/`makeTransform` already take the figure rect, so a smaller (A4+margins) or larger (A3) figure area is handled automatically.

### 3. Route passes the chosen size — `app-backend/src/routes/geopdf-vector.js`

In the `planType === 'diagram'` branch (currently sends `sheetSize: 'A4'` hard-coded), pass the request's sheet size resolved to A4/A3: `sheetSize: (sheetSize === 'A3' ? 'A3' : 'A4')`. Everything else in the branch is unchanged.

### 4. Frontend — plan-type-aware dropdown — `SurveyPlanMapView.vue`

- New pure helper `app-frontend/src/views/modules/cadastral-standard/paperSizeOptions.ts`:
  `paperSizeOptionsFor(planType) => Array<{ value: string; label: string }>`
  - `diagram` → `[{A4, 'A4 (210×297mm)'}, {A3, 'A3 (297×420mm)'}]`
  - everything else → `[{auto,'Auto (Recommended)'}, {ISO_A2,…}, {ISO_A1,…}, {ISO_A0,…}]` (today's list).
- The `<select>` (`:348-352`) renders `v-for` over `paperSizeOptionsFor(config.planType)` instead of the hard-coded `<option>`s.
- `config.sheetSize` type widens to include `'A4' | 'A3'`.
- When the plan type changes to `diagram`, default `config.sheetSize` to `'A4'`; when it changes away from `diagram` and the value is `A4`/`A3`, reset to `'auto'` (so a stale A4 isn't sent to the general renderer). Handled in the existing plan-type change path.

## Error handling / edge cases

- Unknown/missing `sheetSize` in `generateDiagramPDF` → default `'A4'`.
- Non-diagram plan with a stale `A4`/`A3` selection → reset to `auto` on plan-type change (frontend), and the route only forwards A4/A3 to the diagram branch, so the general renderer never receives them.
- Very large parcels: `pickDiagramScale` steps the scale so the figure fits the (now margin-reduced) figure rect, exactly as today.

## Testing

- `diagramLayout.js` — Vitest/Jest unit tests: content box math for A4 and A3; every region inside the content box; `figure` height = contentHeight − fixed bands (flex); band order non-overlapping; `sgNoBox` right-aligned; margins exactly 35 L / 15 others.
- `paperSizeOptions.ts` — unit tests: `diagram` → A4/A3; other types → auto/ISO list.
- `diagramPdf.test.js` — extend: A4 and A3 both return a valid `%PDF-` buffer with the echoed `sheetSize`; buffer non-trivial (guards blank-page regression).
- `.vue` dropdown wiring — `npm run build` + manual (no DOM test infra); manual visual check that the A4/A3 diagram shows the 35/15 border and the bands sit inside it (authoritative acceptance, consistent with 2b).

## Rollout

Single spec + plan. Pure helpers first (TDD), then renderer, then route, then frontend dropdown. Diagram-only; no impact on General/Working output.
