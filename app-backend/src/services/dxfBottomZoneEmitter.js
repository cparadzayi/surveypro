/**
 * dxfBottomZoneEmitter — topology placement for the four legacy bottom-zone
 * blocks (Statement, OFD, SG, Beacon Descriptions) plus orchestration with
 * the existing Schedule of Areas emitter. Replaces the fixed-partition
 * bottom-zone layout shipped before sub-project 3-v4.
 *
 * Spec: docs/superpowers/specs/2026-06-05-dxf-bottom-zone-topology-design.md
 *
 * Pure-function module. All DXF emission goes through caller-injected
 * `addText` / `addLine` / `addRect` callbacks. The orchestrator places
 * blocks in PDF order (matching pdfkitGeoPDF.js:calculateBlockPositions
 * at lines 8553-8581): OFD → schedule → beacon → statement → SG.
 */

import { findBlockPosition } from './dxfBlockPlacer.js'
import {
  OUTSIDE_FIGURE_DATA,
  SURVEYOR_GENERAL_BOX,
} from '../../../app-shared/block-definitions.js'

/** PDF point → paper-millimetre conversion. 1 pt = 1/72 inch = 25.4/72 mm. */
const PT_TO_MM_GEN = 25.4 / 72

/**
 * DXF character-width-to-text-height ratio. Matches the STYLE widthFactor
 * settled in sub-project 3-v3 for 1:1 PDF parity at print scale.
 */
const CHAR_WIDTH_RATIO = 0.55

/** Polygon clearance for the placer (paper-mm). Matches dxfScheduleEmitter. */
export const POLYGON_BUFFER_MM = 2.0

/** Block-to-block separation (paper-mm). Matches dxfScheduleEmitter. */
export const BLOCK_SPACING_MM = 3.0

/** Topology + grid step resolution (paper-mm). Matches dxfScheduleEmitter. */
export const SCAN_STEP_MM = 5.0

/**
 * Compute size of the Survey Date Statement block.
 *
 * The statement is a stack of up to three lines:
 *   - `Surveyed in <date> by me`               (height: fonts.hBody, gap: rH * 1.5)
 *   - <surveyor name>                          (height: fonts.hSub,  gap: rH)
 *   - `(Land Surveyor, Zim)`                   (height: fonts.hBody, gap: rH * 1.5)
 *
 * Lines emit only when their metadata key is present. The surveyor name
 * and "(Land Surveyor, Zim)" emit together: presence of `metadata.surveyor`
 * implies both rows.
 *
 * Returns {0,0} when no lines would emit → orchestrator skips emission.
 *
 * @param {{date?:string, surveyor?:string}} metadata
 * @param {{hBody:number, hSub:number, rH:number}} fonts — all in ground-metres
 * @returns {{width:number, height:number}}
 */
export function sizeStatement(metadata, fonts) {
  const { hBody, hSub, rH } = fonts
  const lines = []
  if (metadata.date) {
    lines.push({
      text:   `Surveyed in ${metadata.date} by me`,
      height: hBody,
      gap:    rH * 1.5,
    })
  }
  if (metadata.surveyor) {
    lines.push({ text: metadata.surveyor,       height: hSub,  gap: rH })
    lines.push({ text: '(Land Surveyor, Zim)',  height: hBody, gap: rH * 1.5 })
  }
  if (lines.length === 0) return { width: 0, height: 0 }

  // Sum line heights + gaps between lines (no gap after the last line).
  const height = lines.reduce((s, l, i) => s + l.height + (i < lines.length - 1 ? l.gap : 0), 0)
  // Width = longest line by character count × hBody × CHAR_WIDTH_RATIO.
  const maxChars = Math.max(...lines.map(l => l.text.length))
  const width    = maxChars * hBody * CHAR_WIDTH_RATIO
  return { width, height }
}

/**
 * Compute size of the Outside Figure Data table.
 *
 * Width = sum of OUTSIDE_FIGURE_DATA column widths (PDF points) converted
 * to paper-mm via PT_TO_MM_GEN, then passed through the `mm` callback so
 * the returned value is in ground-metres.
 *
 * Height = title row + "System: Lo X" subtitle (rowH * 0.9) + gap (rowH * 0.7)
 *        + column header row (rowH) + N data rows (rowH each) + mm(2) padding.
 *
 * Returns {0,0} when there are no edges → orchestrator skips emission.
 *
 * @param {{edges?:Array}|null|undefined} outsideFigureData
 * @param {{ofTitleH:number, ofRowH:number}} fonts — in ground-metres
 * @param {(x:number)=>number} mm — paper-mm → ground-metre converter
 * @returns {{width:number, height:number}}
 */
export function sizeOFDTable(outsideFigureData, fonts, mm) {
  const edgesCount = outsideFigureData?.edges?.length || 0
  if (edgesCount === 0) return { width: 0, height: 0 }

  const widthMM = OUTSIDE_FIGURE_DATA.columns.reduce((s, col) => s + col.width, 0) * PT_TO_MM_GEN
  const width   = mm(widthMM)
  const height  = fonts.ofTitleH                  // "OUTSIDE FIGURE DATA" title row
                + fonts.ofRowH * 0.9              // "System: Lo XX" subtitle
                + fonts.ofRowH * 0.7              // gap before headers
                + fonts.ofRowH                    // column header row
                + fonts.ofRowH * edgesCount       // data rows
                + mm(2)                           // bottom padding for own divider lines
  return { width, height }
}

/**
 * Compute size of the Surveyor-General Approval Box.
 *
 * SURVEYOR_GENERAL_BOX is a constant 200 × 80 PDF points. Returns the
 * ground-metre equivalents via the injected `mm` converter.
 *
 * @param {(x:number)=>number} mm
 * @returns {{width:number, height:number}}
 */
export function sizeSGBox(mm) {
  return {
    width:  mm(SURVEYOR_GENERAL_BOX.width  * PT_TO_MM_GEN),
    height: mm(SURVEYOR_GENERAL_BOX.height * PT_TO_MM_GEN),
  }
}

/**
 * Compute size of the Beacon Descriptions block.
 *
 * Height = 1 title row + 1 row per beacon group, each at fonts.rH * 1.2.
 * (Mirrors the row spacing used by the existing `addBeaconDescription`
 * closure in dxfGenerator.js around line 873.)
 *
 * Width is the intrinsic preferred width = 180 mm; the orchestrator may
 * cap this against the contentArea before topology lookup.
 *
 * Returns {0,0} for empty input → orchestrator skips emission.
 *
 * @param {Array<{points:string,description?:string}>|null|undefined} beaconGroups
 * @param {{rH:number}} fonts
 * @param {(x:number)=>number} mm
 * @returns {{width:number, height:number}}
 */
export function sizeBeaconDescriptions(beaconGroups, fonts, mm) {
  if (!beaconGroups || beaconGroups.length === 0) {
    return { width: 0, height: 0 }
  }
  const lineCount = 1 + beaconGroups.length     // 1 title + 1 per group
  const height    = lineCount * fonts.rH * 1.2
  const width     = mm(180)                     // 180 mm preferred width
  return { width, height }
}
