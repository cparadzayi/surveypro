import { createDxfWriter, textWidth } from './diagram/dxfPrimitives.js'
import { deriveSubjectGeometry } from './diagram/subjectGeometry.js'
import { parcelExtent, pickDiagramScale, makeTransform, beaconRadiusPt } from './diagram/diagramScale.js'
import { buildSidesTable, buildFigureRepresents, formatDiagramArea } from './diagram/sidesTable.js'
import { resolveStatementDesignation } from './diagram/designation.js'
import { buildReferenceGrid } from './diagram/referenceGrid.js'
import { computeDiagramLayout, pageDimsPt, marginsPt } from './diagram/diagramLayout.js'
import { offsetPolygonPt } from './diagram/offsetPolygon.js'
import { bufferRing, clipRingToPolygon, ringExtent, isOutsideFigureFeature, neighbourBoundaryEdges } from './diagram/neighbourBuffer.js'
import { placeVertexLabel } from './diagram/vertexLabel.js'
import { edgeStrip } from './diagram/edgeStrip.js'
import { contiguousMarks } from './diagram/contiguousMarks.js'
import { roadBandRibbon } from './diagram/roadBandRibbon.js'
import { buildBeaconDescription } from './diagram/beaconDescription.js'
import { formatSI } from './diagram/numberFormat.js'
import { resolveLoSystem, snapScaleBarSegment } from '../../../app-shared/block-definitions.js'

/** ground metres per PDF point at SI 727 scale denominator S. */
function ptToGround(pt, S) { return pt * S * 0.000352778 }

// SI 727 figure styling — mirrors diagramPdf.js's constants exactly (kept in
// PDF-point units; converted to ground only at the point of emission).
const INNER_BAND_PT = 1.3 * (72 / 25.4)
const ROAD_STRIP_PT = 1.3 * (72 / 25.4)
const CONTIG_STUB_PT = 6 * (72 / 25.4)
const CONTIG_LABEL_MARGIN = 5

const LAYERS = [
  { name: 'BORDER', color: 7 },
  { name: 'FIGURE', color: 7 },
  { name: 'FIGURE_BAND', color: 3 },
  { name: 'FIGURE_LABELS', color: 7 },
  { name: 'BEACONS', color: 7 },
  { name: 'NEIGHBOURS', color: 8 },
  { name: 'DIAGRAM_ROAD', color: 1 },
  { name: 'ADJOINING', color: 7 },
  { name: 'ADJOINING_SERVITUDE', color: 5 },
  { name: 'TABLE', color: 7 },
  { name: 'BEACON_DESC', color: 7 },
  { name: 'NORTH_ARROW', color: 7 },
  { name: 'APPROVED', color: 7 },
  { name: 'SCALE_BAR', color: 7 },
  { name: 'STATEMENT', color: 7 },
  { name: 'GRID', color: 7 },
]

function centroidPt(ptRing) {
  const n = ptRing.length || 1
  return {
    px: ptRing.reduce((a, p) => a + p.px, 0) / n,
    py: ptRing.reduce((a, p) => a + p.py, 0) / n,
  }
}

// Same ruled-table bottom-Y formula as diagramPdf.js's tableBottomY.
function tableBottomY(tableY, rowCount) {
  return tableY + 39 + rowCount * 11
}

export async function generateDiagramDXF(options, logger) {
  const { parcels, metadata = {}, scale: requestedScale } = options
  const sheetSize = options.sheetSize === 'A3' ? 'A3' : 'A4'
  const features = parcels?.features ?? []
  const subjectId = String(metadata.subjectParcelId ?? '')
  const subject = features.find((f) => String(f.properties?.id) === subjectId)
  if (!subject) {
    throw new Error(`Diagram DXF: subject parcel not found (subjectParcelId=${subjectId})`)
  }
  const neighbours = features.filter((f) => f !== subject)

  const dims = pageDimsPt(sheetSize)
  const margins = marginsPt()
  const layout = computeDiagramLayout({ pageWidthPt: dims.width, pageHeightPt: dims.height, margins })

  const geometry = deriveSubjectGeometry(subject)
  let buffer = []
  try {
    buffer = bufferRing(subject?.geometry?.coordinates?.[0] ?? [])
  } catch (e) {
    logger?.warn?.(`[DiagramDXF] buffer failed: ${e?.message}`)
  }
  const extent = buffer.length ? ringExtent(buffer) : parcelExtent(subject)

  // --- Reflow the mid-page blocks around the actual table height (verbatim port
  // of diagramPdf.js's reflow — pure PDF-point layout math, no drawing calls). ---
  const sidesTable = buildSidesTable(geometry, options.beacons)
  const beaconGroups = buildBeaconDescription(geometry, options.beacons)
  const tableRows = Math.max(sidesTable.coordinateRows.length, sidesTable.sideRows.length)
  const tableBottom = tableBottomY(layout.table.y, tableRows)
  const BEACON_DESC_GAP = 8
  layout.beaconDesc = { ...layout.beaconDesc, y: tableBottom + BEACON_DESC_GAP }
  layout.approved = { ...layout.approved, y: tableBottom + BEACON_DESC_GAP }
  const approvalContentH = 63
  const beaconContentH = 11 + Math.max(1, beaconGroups.length) * 11
  const blocksBottom = tableBottom + BEACON_DESC_GAP + Math.max(approvalContentH, beaconContentH)
  const REGION_MARGIN = 10
  const FIG_SCALE_GAP = 6
  const scaleBarH = layout.scaleBar.height
  const regionH = layout.statement.y - blocksBottom
  const figureH = Math.max(140, regionH - 2 * REGION_MARGIN - FIG_SCALE_GAP - scaleBarH)
  layout.figure = { ...layout.figure, y: blocksBottom + REGION_MARGIN, height: figureH }
  layout.scaleBar = { ...layout.scaleBar, y: layout.figure.y + figureH + FIG_SCALE_GAP }
  layout.northArrow = { ...layout.northArrow, y: layout.figure.y + 8 }

  const { denom, label } = pickDiagramScale(extent, layout.figure, requestedScale)
  const tf = makeTransform(extent, layout.figure, denom)

  // --- Ground conversion: maps EVERY page-point coordinate (figure geometry and
  // every annotation block alike) into real Cape Lo ground coordinates. Verified
  // algebraically to reproduce dxfGenerator.js's own capeLoToDxfSouthUp(y,x) for
  // any subject vertex transformed by `tf` — see the design spec. ---
  const groundPerPt = ptToGround(1, denom)
  const figCenterPx = layout.figure.x + layout.figure.width / 2
  const figCenterPy = layout.figure.y + layout.figure.height / 2
  const centerY = (extent.minY + extent.maxY) / 2
  const centerX = (extent.minX + extent.maxX) / 2
  const groundCenter = { x: -centerY, y: -centerX }
  function toG(pagePt) {
    return {
      x: groundCenter.x + (pagePt.px - figCenterPx) * groundPerPt,
      y: groundCenter.y - (pagePt.py - figCenterPy) * groundPerPt,
    }
  }
  function toGLen(sizePt) { return sizePt * groundPerPt }

  const w = createDxfWriter(LAYERS)

  // Neat-line border.
  const b0 = toG({ px: layout.border.x, py: layout.border.y })
  const b1 = toG({ px: layout.border.x + layout.border.width, py: layout.border.y })
  const b2 = toG({ px: layout.border.x + layout.border.width, py: layout.border.y + layout.border.height })
  const b3 = toG({ px: layout.border.x, py: layout.border.y + layout.border.height })
  w.addPolylineOutline('BORDER', [b0, b1, b2, b3], true)

  // Abutting neighbours: clip to the 10m buffer, faint outline + label.
  const neighbourSegs = []
  const neighbourLabels = []
  if (buffer.length) {
    for (const nb of neighbours) {
      if (isOutsideFigureFeature(nb)) continue
      const nbRing = nb?.geometry?.coordinates?.[0] ?? []
      const strips = clipRingToPolygon(nbRing, buffer)
      if (!strips.length) continue
      for (const strip of strips) {
        for (const [a, b2s] of neighbourBoundaryEdges(strip, nbRing)) {
          const pa = tf(a), pb = tf(b2s)
          w.addLine('NEIGHBOURS', ...Object.values(toG(pa)), ...Object.values(toG(pb)))
          neighbourSegs.push([pa, pb])
        }
      }
      const stand = nb.properties?.stand ?? nb.properties?.designation ?? ''
      if (stand) {
        neighbourLabels.push({ anchor: centroidPt(strips[0].map((pt) => tf(pt))), text: String(stand) })
      }
    }
  }

  // Subject: boundary + inner green figure-band (outline only — DXF has no fill).
  const subjPt = geometry.vertices.map((v) => tf([v.y, v.x]))
  const inner = offsetPolygonPt(subjPt.map((pt) => [pt.px, pt.py]), -INNER_BAND_PT)
  w.addPolylineOutline('FIGURE', subjPt.map((pt) => toG(pt)), true)
  for (const ring of inner) {
    w.addPolylineOutline('FIGURE_BAND', ring.map(([x, y]) => toG({ px: x, py: y })), true)
  }

  const subjCentroid = centroidPt(subjPt)
  const subjSegs = subjPt.map((pt, i) => [pt, subjPt[(i + 1) % subjPt.length]])
  const labelObstacles = []
  const boxToSegs = (bx) => {
    const c1 = { px: bx.x, py: bx.y }, c2 = { px: bx.x + bx.w, py: bx.y }
    const c3 = { px: bx.x + bx.w, py: bx.y + bx.h }, c4 = { px: bx.x, py: bx.y + bx.h }
    return [[c1, c2], [c2, c3], [c3, c4], [c4, c1], [c1, c3], [c2, c4]]
  }

  // Beacon circles (plain open circle — DXF cannot replicate the PDF's white-fill
  // knockout look; accepted difference, see Global Constraints).
  const beaconR = beaconRadiusPt(denom)
  for (const pt of subjPt) {
    const g = toG(pt)
    w.addCircle('BEACONS', g.x, g.y, toGLen(beaconR))
  }

  // Vertex letters — reuses placeVertexLabel UNCHANGED (PDF-point collision math);
  // only the final emitted position is converted to ground.
  geometry.vertices.forEach((v, i) => {
    const pt = subjPt[i]
    const labelW = textWidth(v.letter, 8)
    const pos = placeVertexLabel(pt, subjCentroid, {
      beaconR, labelW, labelH: 8, gap: 2, segments: subjSegs.concat(neighbourSegs, labelObstacles),
    })
    const g = toG({ px: pos.x, py: pos.y + 8 }) // DXF TEXT insertion is baseline, PDF's is top-left
    w.addText('FIGURE_LABELS', g.x, g.y, v.letter, toGLen(8))
    labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: 8 }))
  })

  // Neighbour stand labels.
  for (const nl of neighbourLabels) {
    const labelW = textWidth(nl.text, 7)
    const pos = placeVertexLabel(nl.anchor, subjCentroid, {
      beaconR: 0, gap: 1, labelW, labelH: 7, segments: subjSegs.concat(neighbourSegs, labelObstacles),
    })
    const g = toG({ px: pos.x, py: pos.y + 7 })
    w.addText('NEIGHBOURS', g.x, g.y, nl.text, toGLen(7))
    labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: 7 }))
  }

  // --- Tasks 4-9 insert their drawing blocks here, in generateDiagramPDF's order:
  //   4. adjoining features (road/servitude/contiguous)
  //   5. sides/directions/co-ordinates table
  //   6. description of beacons
  //   7. north arrow, approved box, scale bar
  //   8. statement
  //   9. reference grid
  // ---

  const allPoints = [b0, b1, b2, b3]
  const extMin = { x: Math.min(...allPoints.map((p) => p.x)), y: Math.min(...allPoints.map((p) => p.y)) }
  const extMax = { x: Math.max(...allPoints.map((p) => p.x)), y: Math.max(...allPoints.map((p) => p.y)) }
  const dxfBuffer = w.finish(extMin, extMax)

  return { dxfBuffer, scale: label, sheetSize }
}
