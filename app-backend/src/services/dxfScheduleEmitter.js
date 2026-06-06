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

import { findBlockPosition, GRID_EDGE_MARGIN } from './dxfBlockPlacer.js'
import { computeWhitespaceZones } from './dxfTopology.js'
import { rectanglesOverlap } from './dxfGeometry.js'
import { planScheduleSplit } from '../../../app-shared/block-definitions.js'

/** Clearance (paper-mm) from polygon edges for the placer's buffer parameter. */
export const POLYGON_BUFFER_MM = 2.0

/** Minimum separation (paper-mm) between placed sub-tables and other blocks. */
export const BLOCK_SPACING_MM = 3.0

/**
 * Topology + grid step resolution (paper-mm). Higher = fewer candidate
 * positions for the placer to validate = faster placement at the cost of
 * potentially missing tight slots.
 *
 * Bumped from 2 mm to 5 mm on 2026-06-05 after the table-sizing fix
 * (f48ecc8) cut sub-tables ~3.4× narrower. With the previous step the
 * placer generated 50k+ candidates per table on dense Maglas-density
 * plans, taking 40+ seconds and tripping the frontend timeout. At 5 mm
 * the candidate count drops ~6× while the visual placement is unchanged
 * — schedule cells are 35-60 pt wide (12-21 mm), so a 5 mm step still
 * resolves every reasonable placement opportunity.
 */
export const SCAN_STEP_MM = 5.0

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
  seedPlacedBlocks = [],   // 3-v4: external obstacles to honour in addition to placedPositions
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

  // 2. Compute layout using the drawing-zone dimensions, MINUS the placer's
  //    grid-fallback edge margin reserved on top/bottom/left/right. Without
  //    this subtraction the layout sizes sub-tables to exactly fill the zone,
  //    but the placer's grid scan can only generate candidates inside the
  //    margin-shrunk window — the sub-table is then taller than any candidate
  //    slot and `generateGridCandidates` returns zero positions.
  //    The margin is in mapBounds units (ground-metres for our case); the
  //    layout helper works in paper-mm, so we divide by mm(1) consistently.
  const effectiveZoneWidth  = (drawingZone.width  - 2 * GRID_EDGE_MARGIN) / mm(1)
  const effectiveZoneHeight = (drawingZone.height - 2 * GRID_EDGE_MARGIN) / mm(1)
  const layout = computeScheduleLayout({
    rowCount:         dataRows.length,
    zoneWidth:        effectiveZoneWidth,
    zoneHeight:       effectiveZoneHeight,
    rowHeight:        rH / mm(1),
    headerHeight:     SCHEDULE_HEADER_HEIGHT_MM,
    currentSheetSize: sheetSize,
  })

  // Helper: emit the "SCHEDULE OF AREAS" title placeholder near the top-left
  // of the drawing zone. Used by every path that fails to place any sub-table,
  // so the user always sees there's a schedule that couldn't fit (the
  // structured `scheduleOverflow` warn alone isn't visible in the DXF).
  const emitTitlePlaceholder = () => {
    addText(
      'TITLE_BLOCK',
      drawingZone.x + mm(3),
      drawingZone.y + drawingZone.height - mm(5),
      'SCHEDULE OF AREAS', hHead, 0, 'BOLD',
    )
  }

  // 3. Initial-budget overflow.
  if (!layout.fits) {
    emitTitlePlaceholder()
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
  // 2026-06-06: prefer dynamic widths from helpers when caller provides them.
  // Falls back to layout.columnWidths (the pre-2026-06-06 fixed widths) when
  // helpers.columnWidthsG is absent so existing test fixtures still work.
  const columnWidthsG_local = helpers.columnWidthsG || layout.columnWidths.map(mm)
  const subTableWidthG = columnWidthsG_local.reduce((s, w) => s + w, 0)
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
      placedBlocks:  [...seedPlacedBlocks, ...placedPositions],
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

  // 6. PASS 2 — consolidation (only if PASS 1 didn't seat all tables).
  if (placedPositions.length < layout.numTables) {
    // 2026-06-06: split-into-smaller replaces pre-2026-06-06 consolidation
    // (fewer-but-taller tables, which rarely succeeded because consolidated
    // taller tables exceeded the zone height). Spec:
    //   docs/superpowers/specs/2026-06-06-schedule-split-and-dynamic-columns-design.md
    placedPositions = []   // discard pass-1 positions; replay from scratch
    const headerHeightG = mm(SCHEDULE_HEADER_HEIGHT_MM)

    // Enumerate whitespace gaps then exclude those overlapping seedPlacedBlocks.
    // computeWhitespaceZones already excludes the polygon interior; seed
    // exclusion is layered on top so we don't try to place a sub-table on
    // the OFD table the orchestrator placed first.
    // computeWhitespaceZones walks polygon edges via polygon[i] → polygon[i+1]
    // for i < polygon.length - 1, missing the closing edge when the polygon
    // isn't explicitly closed. The orchestrator's figurePolygon construction
    // (dxfGenerator.js: ofResult.vertices.slice(0, -1)) strips the closing
    // vertex, and unit-test polygons typically follow the same convention.
    // Without an explicit closing edge, the strip-scanner reports spurious
    // zones (e.g. a polygon fully covering the zone yields a "left strip"
    // zone of the full width). Append a closing duplicate before passing in.
    const closedPolygon = (polygon && polygon.length >= 3 &&
      (polygon[0].x !== polygon[polygon.length - 1].x ||
       polygon[0].y !== polygon[polygon.length - 1].y))
      ? [...polygon, polygon[0]]
      : polygon

    const allZones = computeWhitespaceZones({
      polygon:       closedPolygon,
      mapBounds:     drawingZone,
      buffer:        mm(POLYGON_BUFFER_MM),
      tableMinWidth: subTableWidthG,
      scanStep:      mm(SCAN_STEP_MM),
    })
    const availableGaps = allZones.filter(g =>
      !seedPlacedBlocks.some(b =>
        rectanglesOverlap(g, b, mm(BLOCK_SPACING_MM))))

    const { plan, residualRows } = planScheduleSplit({
      totalRows:    dataRows.length,
      availableGaps,
      tableWidth:   subTableWidthG,
      headerHeight: headerHeightG,
      rowHeight:    rH,
      minRowsPerTable: 3,
    })

    for (const entry of plan) {
      const g = availableGaps[entry.gapIndex]
      const subTableHeightG = headerHeightG + entry.rowCount * rH
      // Anchor each sub-table at the gap's top. In DXF south-up coords,
      // gap.y + gap.height is the high-y (top); subtracting the table
      // height gives the bottom-y (low-y) which is what placedPositions stores.
      const subTableBottomY = g.y + g.height - subTableHeightG
      placedPositions.push({
        x: g.x, y: subTableBottomY,
        width: subTableWidthG, height: subTableHeightG,
        rowCount: entry.rowCount,
      })
    }

    if (placedPositions.length > 0 && residualRows > 0) {
      warn('scheduleOverflow', {
        atSheetSize:          sheetSize,
        recommendedSheetSize: nextLargerSheet(sheetSize),
        placedStandCount:     dataRows.length - residualRows,
        missingStandCount:    residualRows,
        placedTables:         placedPositions.length,
        phase:                'split-residual',
      })
    }

    if (placedPositions.length > 0) {
      logger.info(`[dxfScheduleEmitter] Pass 2 split placed ${placedPositions.length} sub-tables (residualRows: ${residualRows})`)
    }

    // PASS 3 — skip-polygon + skip-seed fallback. When Pass 1 + Pass 2 both
    // produced zero placements (either feasible=0 entering consolidation, or
    // consolidation's taller-height retry also failed), try one more time at
    // the ORIGINAL sub-table size with polygon=null AND ignoring the
    // orchestrator-supplied seedPlacedBlocks. Accepts overlap with both the
    // figure polygon and the other bottom-zone blocks — the schedule is a
    // mandatory SI 727 element so overlapping a parcel boundary or the OFD
    // table is the documented trade-off (matches
    // `pdfkitGeoPDF.js:_findFreshSkipPolygon`).
    //
    // 3-v4 regression fix (2026-06-06): pre-3-v4 Pass 3 already ignored the
    // polygon. When Task 4 added seedPlacedBlocks to Pass 1/2/3 uniformly,
    // Pass 3 lost its ability to rescue dense plans where the orchestrator
    // had placed OFD in the central whitespace before the schedule's turn.
    // On the user's Maglas-density plan the schedule fell back to title
    // placeholder only. Pass 3 now ignores the seed too — Pass 1 and Pass 2
    // continue to honor it.
    if (placedPositions.length === 0) {
      logger.info('[dxfScheduleEmitter] Pass 1 + Pass 2 both placed 0 — trying Pass 3 skip-polygon fallback')
      for (let i = 0; i < layout.numTables; i++) {
        const position = findBlockPosition({
          block:         { width: subTableWidthG, height: subTableHeightG },
          mapBounds:     drawingZone,
          polygon:       null,       // skip polygon avoidance; accept overlap
          placedBlocks:  placedPositions,    // skip seed avoidance; only honor own sub-tables
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
      if (placedPositions.length > 0) {
        logger.info(`[dxfScheduleEmitter] Pass 3 placed ${placedPositions.length} tables (overlapping figure polygon)`)
      }
    }

    // All three passes failed — emit title placeholder + warn and return.
    if (placedPositions.length === 0) {
      emitTitlePlaceholder()
      warn('scheduleOverflow', {
        atSheetSize:          sheetSize,
        recommendedSheetSize: nextLargerSheet(sheetSize),
        placedStandCount:     0,
        missingStandCount:    dataRows.length,
        placedTables:         0,
        phase:                'consolidation-zero-fit',
      })
      return {
        placedTables: [], placedStandCount: 0, missingStandCount: dataRows.length,
        southmostY: drawingZone.y,
      }
    }
  }

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
      columnWidths: columnWidthsG_local,
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

  // 8. Residual-overflow warn.
  const missingStandCount = dataRows.length - placedStandCount
  if (missingStandCount > 0 && placedTables.length > 0) {
    warn('scheduleOverflow', {
      atSheetSize:          sheetSize,
      recommendedSheetSize: nextLargerSheet(sheetSize),
      placedStandCount,
      missingStandCount,
      placedTables:         placedTables.length,
      phase:                'consolidation-residual',
    })
  }

  if (placedTables.length === 0) southmostY = drawingZone.y

  return {
    placedTables,
    placedStandCount,
    missingStandCount,
    southmostY,
  }
}
