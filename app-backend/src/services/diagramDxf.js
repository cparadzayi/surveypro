/**
 * Diagram DXF export.
 *
 * The DXF is the diagram PDF's own drawing, not a second drawing of it: the PDF renderer is run
 * with its drawing calls recorded (diagram/pdfOps.js) and the recorded operations are written out
 * as DXF in Cape Lo ground coordinates (diagram/opsToDxf.js). One layout, one set of placement
 * decisions (label fitting, table rows, road ribbons, scale bar), so the two documents are replicas
 * by construction. Earlier this file re-implemented the whole diagram alongside the PDF renderer
 * (~770 lines), and the copies drifted: text baselines, dashed neighbour lines, line weights and the
 * beacon knock-out all differed.
 *
 * Two file versions can be written:
 *   'r2000' (default) -- AutoCAD Release 2000. Carries the EXACT colour of the road and the figure band
 *                        (true colour, as the surveyor's template "lot 1 CORR" does), real HATCH fills
 *                        and weighted polylines. Opens in AutoCAD, which saves it as DWG.
 *   'r12'             -- AutoCAD Release 12. Opens anywhere, but names colours from a 256-colour palette,
 *                        so the road comes out a lighter orange than the template's.
 */
import { generateDiagramPDF } from './diagramPdf.js'
import { opsToDxf } from './diagram/opsToDxf.js'

/**
 * @param {object} options  as generateDiagramPDF, plus `dxfVersion` ('r2000' | 'r12')
 * @returns {Promise<{ dxfBuffer: Buffer, scale: string, sheetSize: string }>}
 */
export async function generateDiagramDXF(options, logger) {
  const { dxfVersion = 'r2000', ...rest } = options ?? {}
  const r = await generateDiagramPDF({ ...rest, recordOps: true }, logger)
  const { dxfBuffer, stats } = opsToDxf(r.ops, r.ground, { version: dxfVersion === 'r12' ? 'r12' : 'r2000' })
  logger?.info?.(`[DiagramDXF] ${dxfVersion}: ${stats.text} texts, ${stats.stroke} strokes, ${stats.fill} fills, ${stats.circle} circles`)
  return { dxfBuffer, scale: r.scale, sheetSize: r.sheetSize }
}
