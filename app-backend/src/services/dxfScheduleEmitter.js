/**
 * Schedule of Areas Topological Emitter — places schedule sub-tables
 * inside the drawing zone via 4c's `findBlockPosition`. Replaces the
 * fixed bottom-left col1 strip emission shipped in sub-project 3.
 *
 * Imports `findBlockPosition` from `./dxfBlockPlacer.js`. Receives the
 * four #3 helpers + `mm` via an injected `helpers` parameter bag to
 * avoid a cycle with `dxfGenerator.js`. DXF emission goes through
 * caller-injected `addText` / `addLine` callbacks.
 *
 * Algorithm in `docs/superpowers/specs/2026-06-04-dxf-schedule-of-areas-3v2-design.md`.
 *
 * Consolidation pass added in Task 3. Overflow + edge case handling in Task 4.
 */

import { findBlockPosition } from './dxfBlockPlacer.js'

/** Clearance (paper-mm) from polygon edges for the placer's buffer parameter. */
export const POLYGON_BUFFER_MM = 2.0

/** Minimum separation (paper-mm) between placed sub-tables and other blocks. */
export const BLOCK_SPACING_MM = 3.0

/** Topology + grid step resolution (paper-mm). */
export const SCAN_STEP_MM = 2.0

// Spec amendment: TITLE_SPACING_MM dropped. SCHEDULE_HEADER_HEIGHT_MM already
// covers the title-to-header gap inside the schedule. Adding TITLE_SPACING
// as a separate reserve on top would make subTableHeight > zoneHeight and
// Pass 1 would always fail (`mm(headerHeight + rowsPerTable*rowHeight + TITLE_SPACING)`
// exceeds the budget that `computeScheduleLayout` allotted for the same rows).

/**
 * Emit Schedule of Areas sub-tables at topology-derived positions inside
 * `drawingZone`. See spec for the full algorithm.
 *
 * @returns {{
 *   placedTables: Array<{x:number,y:number,width:number,height:number,rowCount:number,isContinuation:boolean}>,
 *   placedStandCount: number,
 *   missingStandCount: number,
 *   southmostY: number
 * }}
 */
export function emitScheduleOfAreasTopological({
  surveyedFeatures,
  drawingZone,
  polygon,
  sheetSize,
  fonts,
  helpers,
  addText,
  addLine,
  warn,
  logger,
}) {
  const { hHead, hBody, rH } = fonts
  const {
    extractScheduleRow, computeScheduleLayout, addScheduleTable,
    nextLargerSheet, SCHEDULE_HEADER_HEIGHT_MM, mm,
  } = helpers

  // 1. Extract data rows. Zero-stand shortcut.
  const dataRows = surveyedFeatures.map(extractScheduleRow)
  if (dataRows.length === 0) {
    return {
      placedTables: [], placedStandCount: 0, missingStandCount: 0,
      southmostY: drawingZone.y,
    }
  }

  // 2. Compute layout using the drawing-zone dimensions.
  const layout = computeScheduleLayout({
    rowCount:         dataRows.length,
    zoneWidth:        drawingZone.width  / mm(1),
    zoneHeight:       drawingZone.height / mm(1),
    rowHeight:        rH / mm(1),
    headerHeight:     SCHEDULE_HEADER_HEIGHT_MM,
    currentSheetSize: sheetSize,
  })

  // 3. Initial-budget overflow.
  if (!layout.fits) {
    addText(
      'TITLE_BLOCK',
      drawingZone.x + mm(3),
      drawingZone.y + drawingZone.height - mm(5),
      'SCHEDULE OF AREAS', hHead, 0, 'BOLD',
    )
    warn('scheduleOverflow', {
      atSheetSize:       sheetSize,
      requiredSheetSize: layout.recommendedSheetSize,
      standCount:        dataRows.length,
      phase:             'initial-budget',
    })
    return {
      placedTables: [], placedStandCount: 0, missingStandCount: dataRows.length,
      southmostY: drawingZone.y,
    }
  }

  // 4. Sub-table dimensions in ground-metres. Height = headerHeight + rowsPerTable
  //    * rowHeight, matching computeScheduleLayout's budget exactly so Pass 1
  //    candidate positions are not pre-emptively rejected by the placer.
  const columnWidthsG = layout.columnWidths.map(mm)
  const subTableWidthG = columnWidthsG.reduce((s, w) => s + w, 0)
  const subTableHeightG = mm(
    SCHEDULE_HEADER_HEIGHT_MM + layout.rowsPerTable * (rH / mm(1)),
  )

  // 5. PASS 1 — topology placement at original size.
  let placedPositions = []
  for (let i = 0; i < layout.numTables; i++) {
    const position = findBlockPosition({
      block:         { width: subTableWidthG, height: subTableHeightG },
      mapBounds:     drawingZone,
      polygon,
      placedBlocks:  placedPositions,
      buffer:        mm(POLYGON_BUFFER_MM),
      blockSpacing:  mm(BLOCK_SPACING_MM),
      scanStep:      mm(SCAN_STEP_MM),
      tableMinWidth: subTableWidthG,
      logger,
    })
    if (position === null) break
    placedPositions.push({
      x: position.x, y: position.y,
      width: subTableWidthG, height: subTableHeightG,
      rowCount: layout.rowsPerTable,
    })
  }

  // 6. (Consolidation pass — added in Task 3.)

  // 7. FINAL emission loop.
  const placedTables = []
  let placedStandCount = 0
  let southmostY = Infinity

  for (let i = 0; i < placedPositions.length; i++) {
    const p = placedPositions[i]
    const rows = dataRows.slice(placedStandCount, placedStandCount + p.rowCount)
    if (rows.length === 0) break
    const titleText = i === 0 ? 'SCHEDULE OF AREAS' : "SCHEDULE OF AREAS (cont'd)"
    addScheduleTable({
      layer: 'TITLE_BLOCK',
      // findBlockPosition returns block bottom-y (LOW y); addScheduleTable's
      // `y` is the title-row TOP (HIGH y). Block occupies [p.y, p.y + p.height].
      x: p.x, y: p.y + p.height,
      dataRows: rows,
      columnWidths: columnWidthsG,
      titleText,
      hHead, hBody, rH,
      addText, addLine,
    })
    placedTables.push({
      x: p.x, y: p.y, width: p.width, height: p.height,
      rowCount: rows.length,
      isContinuation: i > 0,
    })
    placedStandCount += rows.length
    if (p.y < southmostY) southmostY = p.y
  }

  // 8. (Residual-overflow warn — added in Task 3.)

  if (placedTables.length === 0) southmostY = drawingZone.y

  return {
    placedTables,
    placedStandCount,
    missingStandCount: dataRows.length - placedStandCount,
    southmostY,
  }
}
