/**
 * Schedule of Areas helpers — extracted from dxfGenerator.js during
 * sub-project 3-v2 to break an import cycle: dxfScheduleEmitter.js
 * needs these helpers AND is called from dxfGenerator.js.
 *
 * Pure functions, no DXF emission. The two functions that emit
 * (`addScheduleTable`) take addText/addLine as injected callbacks.
 *
 * Algorithms unchanged from the #3 ship at d1f6fcd.
 */

import { SCHEDULE_OF_AREAS } from '../../../app-shared/block-definitions.js'

/**
 * Sheet ladder ordered smallest → largest. Index in this array maps to
 * valid Schedule of Areas starting sizes.
 */
const SHEET_LADDER = ['ISO_A2', 'ISO_A1', 'ISO_A0']

/**
 * Total paper-millimetres reserved for the Schedule of Areas header
 * (title + column headers + DEED parent + underline). Shared by
 * computeScheduleLayout's row-budget math AND addScheduleTable's actual
 * header emission. Drift between the two would silently break the layout.
 */
export const SCHEDULE_HEADER_HEIGHT_MM = 12

/**
 * Returns the next-larger sheet size in SHEET_LADDER, or
 * 'multi-sheet-required' when already at the top (or for an unknown
 * starting size — defensive fallback so sub-project #5 always sees a
 * clear signal).
 */
export function nextLargerSheet(currentSheetSize) {
  const idx = SHEET_LADDER.indexOf(currentSheetSize)
  if (idx < 0 || idx === SHEET_LADDER.length - 1) return 'multi-sheet-required'
  return SHEET_LADDER[idx + 1]
}

/**
 * Extracts the six SI 727 Schedule-of-Areas column values from a parcel
 * GeoJSON feature's `properties`. Returns an object whose values are all
 * strings ('' for absent optional fields).
 */
export function extractScheduleRow(parcelFeature) {
  const props = parcelFeature?.properties || {}
  return {
    stand:      String(props.stand ?? ''),
    area:       String(Math.round(props.area_m2 ?? 0)),
    diagram:    String(props.diagram ?? ''),
    deedNumber: String(props.deedNumber ?? ''),
    deedDate:   String(props.deedDate ?? ''),
    surveyor:   String(props.surveyor ?? ''),
  }
}

/**
 * Computes the Schedule-of-Areas layout for a given row count and zone
 * size (in paper-millimetres). See dxfGenerator.js commit d1f6fcd for
 * the full design notes.
 */
export function computeScheduleLayout({
  rowCount,
  zoneWidth,
  zoneHeight,
  rowHeight,
  headerHeight,
  currentSheetSize,
}) {
  const singleCols = SCHEDULE_OF_AREAS?.singleColumn?.columns
  const multiCols  = SCHEDULE_OF_AREAS?.multiColumn?.columns
  const spacing    = SCHEDULE_OF_AREAS?.multiColumn?.columnSpacing
  if (!Array.isArray(singleCols) || !Array.isArray(multiCols) || typeof spacing !== 'number') {
    throw new Error('SCHEDULE_OF_AREAS missing from app-shared/block-definitions.js')
  }

  const singleTableWidth = singleCols.reduce((s, c) => s + c.width, 0)
  const subTableWidth    = multiCols.reduce((s, c) => s + c.width, 0)

  const rowsPerColumn = Math.max(0, Math.floor((zoneHeight - headerHeight) / rowHeight))

  const singleScale = Math.min(1, zoneWidth / singleTableWidth)
  const singleColumnWidths = singleCols.map(c => c.width * singleScale)

  if (rowCount === 0) {
    return { fits: true, numTables: 1, rowsPerTable: 0, columnWidths: singleColumnWidths }
  }

  if (rowsPerColumn === 0) {
    return { fits: false, recommendedSheetSize: nextLargerSheet(currentSheetSize) }
  }

  if (rowCount <= rowsPerColumn) {
    return { fits: true, numTables: 1, rowsPerTable: rowCount, columnWidths: singleColumnWidths }
  }

  const numTablesNeeded  = Math.ceil(rowCount / rowsPerColumn)
  if (zoneWidth < subTableWidth) {
    return { fits: false, recommendedSheetSize: nextLargerSheet(currentSheetSize) }
  }
  const maxTablesByWidth = Math.floor((zoneWidth + spacing) / (subTableWidth + spacing))

  if (numTablesNeeded > maxTablesByWidth) {
    return { fits: false, recommendedSheetSize: nextLargerSheet(currentSheetSize) }
  }

  const perTableBudget = (zoneWidth - (numTablesNeeded - 1) * spacing) / numTablesNeeded
  const subTableWidthOut = Math.min(perTableBudget, subTableWidth)
  const multiScale = subTableWidthOut / subTableWidth
  const multiColumnWidths = multiCols.map(c => c.width * multiScale)

  return {
    fits: true,
    numTables: numTablesNeeded,
    rowsPerTable: rowsPerColumn,
    columnWidths: multiColumnWidths,
  }
}

/**
 * Emits one Schedule-of-Areas sub-table block (title + column headers +
 * DEED parent header + underline + data rows). Returns the y coordinate
 * after the last row.
 *
 * `addText` and `addLine` are injected so the helper stays unit-testable.
 */
export function addScheduleTable({
  layer, x, y,
  dataRows, columnWidths,
  titleText, hHead, hBody, rH,
  addText, addLine,
}) {
  const singleCols = SCHEDULE_OF_AREAS?.singleColumn?.columns
  if (!Array.isArray(singleCols)) {
    throw new Error('SCHEDULE_OF_AREAS missing from app-shared/block-definitions.js')
  }

  const colX = []
  let cx = 0
  for (const w of columnWidths) {
    colX.push(x + cx)
    cx += w
  }
  const rightEdge = x + cx

  let cy = y
  addText(layer, x, cy, titleText, hHead, 0, 'BOLD')
  cy -= hHead * 1.6

  const DXF_CHAR_WIDTH_RATIO = 0.6
  const deedStartX = colX[3]
  const deedEndX   = colX[4] + columnWidths[4]
  const deedCenter = (deedStartX + deedEndX) / 2
  const deedTextWidth = 'DEED'.length * hBody * DXF_CHAR_WIDTH_RATIO
  addText(layer, deedCenter - deedTextWidth / 2, cy, 'DEED', hBody, 0, 'BOLD')
  cy -= hBody * 1.2

  let maxHeaderLines = 1
  for (let i = 0; i < singleCols.length; i++) {
    const tokens = String(singleCols[i].label).split('\n')
    if (tokens.length > maxHeaderLines) maxHeaderLines = tokens.length
    let lineY = cy
    for (const tok of tokens) {
      addText(layer, colX[i], lineY, tok, hBody, 0, 'BOLD')
      lineY -= hBody * 1.2
    }
  }
  cy -= maxHeaderLines * hBody * 1.2

  addLine(layer, x, cy, rightEdge, cy)
  cy -= hBody * 0.6

  const cellKeys = singleCols.map(c => c.key)
  for (const row of dataRows) {
    for (let i = 0; i < cellKeys.length; i++) {
      const val = row[cellKeys[i]]
      if (val) addText(layer, colX[i], cy, val, hBody)
    }
    cy -= rH
  }

  return cy
}
