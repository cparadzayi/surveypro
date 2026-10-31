/**
 * The General Plan DXF, as the General Plan PDF's own drawing.
 *
 * Same idea as the diagram (diagramDxf.js): the PDF renderer runs through the operation recorder and
 * the DXF is those operations in Cape Lo ground coordinates, so the two cannot disagree about what is
 * on the sheet, where or in what size.
 */
import { generateGeoPDF } from './pdfkitGeoPDF.js'
import { opsToDxf } from './diagram/opsToDxf.js'

export const GENERAL_PLAN_LAYERS = [
  { name: 'SHEET_EDGE', color: 8 },
  { name: 'MARGIN_GUIDES', color: 8 },
  { name: 'OUTSIDE_FIGURE', color: 1 },
  { name: 'PARCELS', color: 7 },
  { name: 'BEACONS', color: 3 },
  { name: 'GRID', color: 8 },
  { name: 'INSETS', color: 7 },
  { name: 'TITLE_BLOCK', color: 7 },
  { name: 'NORTH_ARROW', color: 7 },
  { name: 'SCALE_BAR', color: 7 },
]

/** The page-to-ground mapping the recorder's ground figures give: page points -> Cape Lo easting/northing. */
export function groundOf({ a, b, extent, page }) {
  const eastA = -extent.minY
  const eastB = -extent.maxY
  return {
    perPt: (eastA - eastB) / (a.x - b.x),
    figCenterPx: a.x,
    figCenterPy: a.y,
    center: { x: eastA, y: -extent.minX },
    page,
  }
}

/** The DXF of a render made with recordOps: true. */
export function dxfFromRecordedPlan(render, dxfVersion = 'r2000') {
  return opsToDxf(render.ops, groundOf(render.ground), { version: dxfVersion === 'r12' ? 'r12' : 'r2000', layers: GENERAL_PLAN_LAYERS })
}

export async function generateGeneralPlanDXF(options, logger, { dxfVersion = 'r2000' } = {}) {
  const r = await generateGeoPDF({ ...options, recordOps: true }, logger)
  const { dxfBuffer, stats } = dxfFromRecordedPlan(r, dxfVersion)
  return { dxfBuffer, stats, pdfBuffer: r.pdfBuffer, scale: r.scale, sheetSize: r.sheetSize, orientation: r.orientation }
}
