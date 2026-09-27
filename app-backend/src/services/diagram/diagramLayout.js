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
const BAND = { table: 150, header: 66, scaleBar: 34, statement: 92, refGrid: 100 }

// Inset (pt) between the neat-line border and the content bands, so text/labels
// never touch the border/margins.
export const CONTENT_PAD = 6

// North arrow (pt) and the gutter it occupies at the figure's left. The gutter
// is the arrow's width plus a clear gap; exported so a test can assert the arrow
// never re-enters the figure rather than hard-coding 52.
export const ARROW_WIDTH = 40
export const ARROW_HEIGHT = 50
export const ARROW_GUTTER = ARROW_WIDTH + 12

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
