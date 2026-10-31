/**
 * Compute the S.G. Diagram page layout from page size + margins. All regions are
 * absolute page points. The figure band flexes to fill the space left by the
 * fixed bands (table, header row, scale bar, statement, reference grid).
 */
const MM_TO_PT = 72 / 25.4

export const DIAGRAM_MARGINS_MM = { left: 35, top: 15, right: 15, bottom: 15 }

// Portrait page dimensions in points.
const PAGE_DIMS_PT = {
  A4: { width: 595.28, height: 841.89 },
  A3: { width: 841.89, height: 1190.55 },
}

// Fixed band heights (pt); the figure fills whatever remains.
const BAND = { table: 153, header: 66, scaleBar: 34, statement: 92, refGrid: 100 }

// Inset (pt) between the neat-line border and the content bands, so text/labels
// never touch the border/margins.
export const CONTENT_PAD = 6

// North arrow (pt) and the gutter it occupies at the figure's left. The gutter
// is the arrow's width plus a clear gap; exported so a test can assert the arrow
// never re-enters the figure rather than hard-coding 52.
export const ARROW_WIDTH = 40
export const ARROW_HEIGHT = 106
export const ARROW_GUTTER = ARROW_WIDTH + 12

// Page furniture from the surveyor's diagram template (lot 1 CORR.dwg): a notice
// above the neat line, and a vertical note in the binding margin at its left.
// Shared by the PDF and DXF renderers so the two cannot word it differently.
// Content font sizes (pt) shared by the PDF and DXF diagrams. Raised one point from
// 7 / 8 / 9 so the content reads comfortably; every block's row pitch and column
// width was sized with room for it, so the layout is unchanged.
// The Surveyor-General asked for a larger font in the co-ordinate table and the
// description of beacons (8/9 pt was read as too small): the table is now 10 pt (headings 9 pt bold, the widest that still clears the METRES column), the same
// size as the statement block.
export const DIAGRAM_FONTS = { table: 10, tableHead: 9, beacon: 10, approved: 8, statement: 10, grid: 8 }

// Vertical rhythm of the ruled table, points below its top. The three header rows and
// the Constants row moved down 1-3 pt with the larger type so the lines do not touch;
// both renderers read these, so the PDF and the DXF cannot drift.
export const TABLE_GEOM = { lo: 11, sub: 21, sep: 31, first: 33, pitch: 11, closing: 9 }
/** The ruled table's bottom Y for a given data-row count. */
export function tableBottomY(tableY, rowCount) {
  return tableY + TABLE_GEOM.first + TABLE_GEOM.closing + rowCount * TABLE_GEOM.pitch
}

export const DEDUCTIONS_NOTE = 'DEDUCTIONS FROM THIS DIAGRAM ARE MADE ON THE BACK HEREOF'
export const BINDING_MARGIN_NOTE = 'BINDING MARGIN NOT TO BE WRITTEN IN'
export const FURNITURE_FONT_PT = 6.5
// Baseline gap (pt) between the deductions notice and the neat line's top edge.
export const DEDUCTIONS_GAP_PT = 4
// Distance (pt) from the neat line's left edge to the binding note's baseline.
export const BINDING_NOTE_OFFSET_PT = 6

// The north arrow of the surveyor's template (lot 1 CORR.dwg), in millimetres from
// its apex, y measured DOWN the page: a long true-north line, a second line that
// leans from the same apex (the grid-north offset) ending in a short barb, and the
// "T" and "N" letters flanking the foot of the true-north line, which passes
// between them. Shared by the PDF and DXF renderers.
const MM_TO_PT_ARROW = 72 / 25.4
export const NORTH_ARROW_TEMPLATE = {
  trueNorth: [[0, 0], [0, 37.44]],
  gridNorth: [[0, 0], [-2.16, 18.72]],
  barb: [[-2.16, 18.72], [1.44, 23.76]],
  // Left edge of each letter; the line at x = 0 runs between them.
  labels: [{ text: 'T', at: [-3.4, 33.5] }, { text: 'N', at: [1.2, 33.5] }],
  labelHeightMm: 2.5,
}

/**
 * The arrow's line segments and label in absolute page points, apex at the top
 * centre of `rect`.
 */
export function northArrowGeometryPt(rect) {
  const ax = rect.x + rect.width / 2, ay = rect.y
  const pt = ([dx, dy]) => [ax + dx * MM_TO_PT_ARROW, ay + dy * MM_TO_PT_ARROW]
  const T = NORTH_ARROW_TEMPLATE
  return {
    segments: [T.trueNorth, T.gridNorth, T.barb].map(([a, b]) => [pt(a), pt(b)]),
    labels: T.labels.map((l) => ({ text: l.text, at: pt(l.at) })),
    labelHeightPt: T.labelHeightMm * MM_TO_PT_ARROW,
  }
}

/**
 * The template north arrow sized for a plan sheet: the construction of
 * NORTH_ARROW_TEMPLATE stretched so its true-north line is `lineMm` long, with
 * the "T" and "N" letters `letterMm` high. Millimetres from the apex, y DOWN the
 * page; the true-north line runs along x = 0 and the letters flank it.
 */
export function northArrowForPlanMm(lineMm, letterMm) {
  const T = NORTH_ARROW_TEMPLATE
  const g = lineMm / T.trueNorth[1][1]
  const p = ([dx, dy]) => [dx * g, dy * g]
  return {
    segments: [T.trueNorth, T.gridNorth, T.barb].map(([a, b]) => [p(a), p(b)]),
    // Letters sit by the foot of the line, either side of it; `at` is the left edge
    // of each letter on its baseline. Their gap to the line scales with the letter.
    labels: [
      { text: 'T', at: [-(letterMm * 0.95), T.labels[0].at[1] * g] },
      { text: 'N', at: [letterMm * 0.4, T.labels[1].at[1] * g] },
    ],
    letterMm,
  }
}

export function pageDimsPt(sheetSize) {
  return PAGE_DIMS_PT[sheetSize] || PAGE_DIMS_PT.A4
}

export function marginsPt(mm = DIAGRAM_MARGINS_MM) {
  return {
    left: mm.left * MM_TO_PT,
    top: mm.top * MM_TO_PT,
    right: mm.right * MM_TO_PT,
    bottom: mm.bottom * MM_TO_PT,
  }
}

export function computeDiagramLayout({ pageWidthPt, pageHeightPt, margins }) {
  // Neat-line border = the content box (page minus margins).
  const border = {
    x: margins.left,
    y: margins.top,
    width: pageWidthPt - margins.left - margins.right,
    height: pageHeightPt - margins.top - margins.bottom,
  }

  // Bands are laid out inside a padded inset of the border, so text/labels never
  // touch the border/margins.
  const cx = border.x + CONTENT_PAD
  const cy = border.y + CONTENT_PAD
  const cw = border.width - 2 * CONTENT_PAD
  const ch = border.height - 2 * CONTENT_PAD
  const contentRight = cx + cw

  const fixed = BAND.table + BAND.header + BAND.scaleBar + BAND.statement + BAND.refGrid
  const figureH = ch - fixed

  let y = cy
  const table = { x: cx, y, width: cw, height: BAND.table }
  const sgNoBox = { x: contentRight - 100, y, width: 100, height: 40 }
  y += BAND.table

  const beaconDesc = { x: cx, y, width: cw * 0.45, height: BAND.header }
  // Approval block aligns to the top table's last column (the DIAGRAM S.G. No.
  // column, = sgNoBox.x) and runs to the right content edge; borderless, centred.
  const approved = { x: sgNoBox.x, y, width: contentRight - sgNoBox.x, height: 45 }
  y += BAND.header

  // The figure is inset by a gutter at its left to make room for the north
  // arrow. The figure used to span the full content width and the arrow was
  // placed at figure.x + 15, i.e. ON TOP of the drawing — the comment claimed it
  // was "in the left margin" but there is no left margin inside the neat line
  // to sit in, only CONTENT_PAD (6pt) of inset. So the arrow had to be carved
  // out of the figure itself. A dedicated gutter costs the figure 52pt of width
  // and buys the arrow a column of its own; at 1:2500 the drawing still fits
  // (330pt wide in a 389pt box), so no step of the scale ladder is lost.
  const figure = { x: cx + ARROW_GUTTER, y, width: cw - ARROW_GUTTER, height: figureH }
  // Centred on the figure's height, not top-aligned to it. The arrow is a
  // reference FOR the drawing, so sitting beside the middle of it reads as
  // belonging to the figure; at the top it read as a heading for the page.
  const northArrow = {
    x: cx,
    y: figure.y + (figureH - ARROW_HEIGHT) / 2,
    width: ARROW_WIDTH,
    height: ARROW_HEIGHT,
  }
  y += figureH

  const scaleBar = { x: cx + (cw - 160) / 2, y, width: 160, height: BAND.scaleBar }
  y += BAND.scaleBar

  const statement = { x: cx, y, width: cw, height: BAND.statement }
  y += BAND.statement

  const refGrid = { x: cx, y, width: cw, height: BAND.refGrid }

  return { border, table, sgNoBox, beaconDesc, northArrow, approved, figure, scaleBar, statement, refGrid }
}
