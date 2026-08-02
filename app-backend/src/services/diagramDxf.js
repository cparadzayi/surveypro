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

function drawAdjoiningFeaturesDxf(w, ctx, logger) {
  const { annotations, geometry, subjPt, subjCentroid, subjSegs, neighbourSegs, denom, labelObstacles, boxToSegs, toG, toGLen } = ctx
  if (!Array.isArray(annotations) || annotations.length === 0) return
  const n = geometry.vertices.length
  const PT_PER_MM = 72 / 25.4
  const ptPerGroundM = PT_PER_MM * 1000 / denom
  const cen = [subjCentroid.px, subjCentroid.py]
  const vertexBandPt = beaconRadiusPt(denom) + 14
  const contiguousSides = new Set(annotations.filter((x) => x && x.role === 'contiguous' && x.side).map((x) => x.side))
  const roadSides = new Set(annotations.filter((x) => x && x.role === 'road' && x.side).map((x) => x.side))

  for (const ann of annotations) {
    if (!ann || !ann.side || !ann.role) continue
    let i = -1
    for (let k = 0; k < n; k++) {
      if (geometry.vertices[k].letter + geometry.vertices[(k + 1) % n].letter === ann.side) { i = k; break }
    }
    if (i < 0) { logger?.warn?.(`[DiagramDXF] adjoining: side ${ann.side} not found`); continue }

    const p1 = subjPt[i]
    const p2 = subjPt[(i + 1) % n]
    const a = [p1.px, p1.py]
    const b = [p2.px, p2.py]
    const mid = { px: (p1.px + p2.px) / 2, py: (p1.py + p2.py) / 2 }

    if (ann.role === 'road' || ann.role === 'servitude') {
      let q = null
      if (ann.role === 'servitude') {
        if (ann.widthM > 0) q = edgeStrip(a, b, ann.widthM * ptPerGroundM, cen)
        else logger?.warn?.(`[DiagramDXF] servitude ${ann.side} has no widthM; drawing label only`)
      } else {
        const flankA = geometry.vertices[(i - 1 + n) % n].letter + geometry.vertices[i].letter
        const flankB = geometry.vertices[(i + 1) % n].letter + geometry.vertices[(i + 2) % n].letter
        const axLen = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
        const ax = [(b[0] - a[0]) / axLen, (b[1] - a[1]) / axLen]
        const inner = []
        if (!roadSides.has(flankA)) {
          if (contiguousSides.has(flankA)) {
            const prev = subjPt[(i - 1 + n) % n]
            inner.push(edgeStrip([prev.px, prev.py], a, CONTIG_STUB_PT, cen)[2])
          } else {
            inner.push([a[0] - ax[0] * CONTIG_STUB_PT, a[1] - ax[1] * CONTIG_STUB_PT])
          }
        }
        inner.push(a, b)
        if (!roadSides.has(flankB)) {
          if (contiguousSides.has(flankB)) {
            const next = subjPt[(i + 2) % n]
            inner.push(edgeStrip(b, [next.px, next.py], CONTIG_STUB_PT, cen)[3])
          } else {
            inner.push([b[0] + ax[0] * CONTIG_STUB_PT, b[1] + ax[1] * CONTIG_STUB_PT])
          }
        }
        q = roadBandRibbon(inner, ROAD_STRIP_PT, cen)
      }
      if (q && q.length >= 3) {
        const layer = ann.role === 'road' ? 'DIAGRAM_ROAD' : 'ADJOINING_SERVITUDE'
        const gPts = q.map(([x, y]) => toG({ px: x, py: y }))
        w.addPolylineOutline(layer, gPts, true)
        for (let k = 0; k < q.length; k++) {
          const s = q[k], t = q[(k + 1) % q.length]
          labelObstacles.push([{ px: s[0], py: s[1] }, { px: t[0], py: t[1] }])
        }
      }
    } else if (ann.role === 'contiguous') {
      const marks = contiguousMarks(a, b, ann.end)
      const st = edgeStrip(a, b, CONTIG_STUB_PT, cen)
      if (marks.stubFrom) {
        const g1 = toG({ px: a[0], py: a[1] }), g2 = toG({ px: st[3][0], py: st[3][1] })
        w.addLine('ADJOINING', g1.x, g1.y, g2.x, g2.y)
        labelObstacles.push([{ px: a[0], py: a[1] }, { px: st[3][0], py: st[3][1] }])
      }
      if (marks.stubTo) {
        const g1 = toG({ px: b[0], py: b[1] }), g2 = toG({ px: st[2][0], py: st[2][1] })
        w.addLine('ADJOINING', g1.x, g1.y, g2.x, g2.y)
        labelObstacles.push([{ px: b[0], py: b[1] }, { px: st[2][0], py: st[2][1] }])
      }
    }

    if (ann.label) {
      const labelText = ann.role === 'road' && ann.widthM > 0 ? `${ann.label} ${formatSI(ann.widthM, 2)}m` : ann.label
      const labelH = 7
      const labelW = textWidth(labelText, labelH)
      if (ann.role === 'road' || ann.role === 'servitude') {
        const ex = p2.px - p1.px, ey = p2.py - p1.py
        const len = Math.hypot(ex, ey) || 1
        let perpX = -ey / len, perpY = ex / len
        if (perpX * (subjCentroid.px - mid.px) + perpY * (subjCentroid.py - mid.py) > 0) { perpX = -perpX; perpY = -perpY }
        let angleDeg = Math.atan2(ey, ex) * 180 / Math.PI
        if (angleDeg > 90 || angleDeg < -90) angleDeg += 180
        const stripPt = ann.role === 'servitude' && ann.widthM > 0 ? ann.widthM * ptPerGroundM : ROAD_STRIP_PT
        const off = stripPt + vertexBandPt
        const lx = mid.px + perpX * off, ly = mid.py + perpY * off
        // Centred + rotated: pre-shift the LEFT-justified insertion point back along the
        // reading direction by half the text width (the technique adjoiningFeaturesDxf.js
        // already uses for this exact case — DXF's justification codes don't combine
        // reliably with rotation across viewers).
        const aRad = angleDeg * Math.PI / 180
        const ix = lx - Math.cos(aRad) * (labelW / 2)
        const iy = ly - Math.sin(aRad) * (labelW / 2)
        const g = toG({ px: ix, py: iy })
        w.addText(ann.role === 'servitude' ? 'ADJOINING_SERVITUDE' : 'DIAGRAM_ROAD', g.x, g.y, labelText, toGLen(labelH), -angleDeg)
      } else {
        const m = contiguousMarks(a, b, ann.end)
        const anchor = { px: m.labelAnchor[0], py: m.labelAnchor[1] }
        let ox = anchor.px - subjCentroid.px, oy = anchor.py - subjCentroid.py
        const ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol
        const extent = (labelW / 2) * Math.abs(ox) + (labelH / 2) * Math.abs(oy)
        const half = Math.max(labelW, labelH) / 2
        const gap = Math.max(2, CONTIG_LABEL_MARGIN + extent - half)
        const pos = placeVertexLabel(anchor, subjCentroid, {
          beaconR: 0, gap, labelW, labelH, segments: subjSegs.concat(neighbourSegs, labelObstacles),
        })
        const g = toG({ px: pos.x, py: pos.y + labelH })
        w.addText('ADJOINING', g.x, g.y, labelText, toGLen(labelH))
        labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: labelH }))
      }
    }
  }
}

function drawTableDxf(w, layout, table, loLabel, toG, toGLen) {
  const { constRow, coordinateRows, sideRows } = table
  const R = layout.table
  const cSide = 0, cDir = 76, cLetter = 158, cY = 198, cX = 260
  const cSg = layout.sgNoBox.x + 2
  const rows = Math.max(coordinateRows.length, sideRows.length)
  const cDirX = R.x + 70
  const dirSplitX = cDirX + 24
  const xDeg = R.x + 97, xMin = R.x + 119, xSec = R.x + 133
  const cLetX = R.x + 150
  const cMetresX = R.x + 32
  const yColMidX = R.x + cY + (cX - cY) / 2
  const xColMidX = R.x + cX + ((layout.sgNoBox.x - 4) - (R.x + cX)) / 2
  const coordMidX = R.x + cY + ((layout.sgNoBox.x - 4) - (R.x + cY)) / 2
  const sideMidX = R.x + cSide + 15
  const metresMidX = cMetresX + 19
  const dirMidX = cDirX + 40
  const letMidX = cLetX + 21.5

  const gT = (x, y) => toG({ px: x, py: y })
  const H = 7.5, h = 7

  w.addTextC('TABLE', gT(sideMidX, R.y + H).x, gT(sideMidX, R.y + H).y, 'SIDES', toGLen(H))
  w.addTextC('TABLE', gT(metresMidX, R.y + H).x, gT(metresMidX, R.y + H).y, 'METRES', toGLen(H))
  w.addTextC('TABLE', gT(dirMidX, R.y + H).x, gT(dirMidX, R.y + H).y, 'DIRECTIONS', toGLen(H))
  w.addTextC('TABLE', gT(coordMidX, R.y + H).x, gT(coordMidX, R.y + H).y, 'CO-ORDINATES', toGLen(H))
  { const g = gT(cSg, R.y + H); w.addText('TABLE', g.x, g.y, 'DIAGRAM S.G. No.', toGLen(H)) }

  { const g = gT(coordMidX, R.y + 10 + h); w.addTextC('TABLE', g.x, g.y, loLabel, toGLen(h)) }
  { const g = gT(xDeg + 11, R.y + 19 + h); w.addTextC('TABLE', g.x, g.y, '°', toGLen(h)) }
  { const g = gT(xMin + 7, R.y + 19 + h); w.addTextC('TABLE', g.x, g.y, "'", toGLen(h)) }
  { const g = gT(xSec + 7, R.y + 19 + h); w.addTextC('TABLE', g.x, g.y, '"', toGLen(h)) }
  { const g = gT(yColMidX, R.y + 19 + h); w.addTextC('TABLE', g.x, g.y, 'Y', toGLen(h)) }
  { const g = gT(coordMidX, R.y + 19 + h); w.addTextC('TABLE', g.x, g.y, 'Metres', toGLen(h)) }
  { const g = gT(xColMidX, R.y + 19 + h); w.addTextC('TABLE', g.x, g.y, 'X', toGLen(h)) }

  let ry = R.y + 30
  { const g = gT(yColMidX, ry + h); w.addTextC('TABLE', g.x, g.y, constRow.y, toGLen(h)) }
  { const g = gT(xColMidX, ry + h); w.addTextC('TABLE', g.x, g.y, constRow.x, toGLen(h)) }
  { const g = gT(cSg, ry + h); w.addText('TABLE', g.x, g.y, 'Constants', toGLen(h)) }

  for (let i = 0; i < rows; i++) {
    ry += 11
    if (sideRows[i]) {
      { const g = gT(sideMidX, ry + h); w.addTextC('TABLE', g.x, g.y, sideRows[i].side, toGLen(h)) }
      { const g = gT(metresMidX, ry + h); w.addTextC('TABLE', g.x, g.y, sideRows[i].metres, toGLen(h)) }
      { const g = gT(cDirX + 11, ry + h); w.addTextC('TABLE', g.x, g.y, sideRows[i].side, toGLen(h)) }
      const [dd, mm, ss] = String(sideRows[i].direction).split(' ')
      { const g = gT(xDeg + 11, ry + h); w.addTextC('TABLE', g.x, g.y, dd ?? '', toGLen(h)) }
      { const g = gT(xMin + 7, ry + h); w.addTextC('TABLE', g.x, g.y, mm ?? '', toGLen(h)) }
      { const g = gT(xSec + 7, ry + h); w.addTextC('TABLE', g.x, g.y, ss ?? '', toGLen(h)) }
    }
    if (coordinateRows[i]) {
      { const g = gT(letMidX, ry + h); w.addTextC('TABLE', g.x, g.y, coordinateRows[i].letter, toGLen(h)) }
      { const g = gT(yColMidX, ry + h); w.addTextC('TABLE', g.x, g.y, coordinateRows[i].y, toGLen(h)) }
      { const g = gT(xColMidX, ry + h); w.addTextC('TABLE', g.x, g.y, coordinateRows[i].x, toGLen(h)) }
      { const g = gT(cSg, ry + h); w.addText('TABLE', g.x, g.y, coordinateRows[i].beaconName ?? '', toGLen(h)) }
    }
  }

  const B = layout.border
  const boxB = R.y + 39 + rows * 11
  const hSep = R.y + 28
  const verticals = [R.x + 70, R.x + 150, R.x + 193, layout.sgNoBox.x - 4]
  for (const vx of verticals) { const g1 = gT(vx, B.y), g2 = gT(vx, boxB); w.addLine('TABLE', g1.x, g1.y, g2.x, g2.y) }
  { const g1 = gT(R.x + cX, hSep), g2 = gT(R.x + cX, boxB); w.addLine('TABLE', g1.x, g1.y, g2.x, g2.y) }
  { const g1 = gT(R.x + 32, hSep), g2 = gT(R.x + 32, boxB); w.addLine('TABLE', g1.x, g1.y, g2.x, g2.y) }
  { const g1 = gT(dirSplitX, hSep), g2 = gT(dirSplitX, boxB); w.addLine('TABLE', g1.x, g1.y, g2.x, g2.y) }
  { const g1 = gT(B.x, hSep), g2 = gT(B.x + B.width, hSep); w.addLine('TABLE', g1.x, g1.y, g2.x, g2.y) }
}

function drawBeaconDescriptionDxf(w, layout, groups, toG, toGLen) {
  const R = layout.beaconDesc
  const g0 = toG({ px: R.x, py: R.y + 8 })
  w.addText('BEACON_DESC', g0.x, g0.y, 'Description of Beacons', toGLen(8))
  if (groups.length === 0) {
    const g = toG({ px: R.x, py: R.y + 11 + 8 })
    w.addText('BEACON_DESC', g.x, g.y, 'All          :', toGLen(8))
  } else if (groups.length === 1) {
    const g = toG({ px: R.x, py: R.y + 11 + 8 })
    w.addText('BEACON_DESC', g.x, g.y, `All          : ${groups[0].description}`, toGLen(8))
  } else {
    let y = R.y + 11
    for (const grp of groups) {
      const g = toG({ px: R.x, py: y + 8 })
      w.addText('BEACON_DESC', g.x, g.y, `${grp.names}  :  ${grp.description}`, toGLen(8))
      y += 11
    }
  }
}

function drawNorthArrowDxf(w, layout, toG, toGLen) {
  const R = layout.northArrow
  const cx = R.x + R.width / 2
  const shaftTop = toG({ px: cx, py: R.y }), shaftBottom = toG({ px: cx, py: R.y + R.height })
  w.addLine('NORTH_ARROW', shaftBottom.x, shaftBottom.y, shaftTop.x, shaftTop.y)
  const headL = toG({ px: cx - 4, py: R.y + 8 }), headTip = toG({ px: cx, py: R.y }), headR = toG({ px: cx + 4, py: R.y + 8 })
  w.addLine('NORTH_ARROW', headL.x, headL.y, headTip.x, headTip.y)
  w.addLine('NORTH_ARROW', headTip.x, headTip.y, headR.x, headR.y)
  const gT = toG({ px: cx - 9, py: R.y + R.height - 14 + 7 })
  w.addText('NORTH_ARROW', gT.x, gT.y, 'T', toGLen(7))
  const gN = toG({ px: cx + 4, py: R.y + R.height - 14 + 7 })
  w.addText('NORTH_ARROW', gN.x, gN.y, 'N', toGLen(7))
}

function drawApprovedBoxDxf(w, layout, toG, toGLen) {
  const R = layout.approved
  const cx = R.x + R.width / 2
  const g1 = toG({ px: cx, py: R.y + 5 + 7 }); w.addTextC('APPROVED', g1.x, g1.y, 'Approved', toGLen(7))
  const g2 = toG({ px: cx, py: R.y + 31 + 7 }); w.addTextC('APPROVED', g2.x, g2.y, 'for Surveyor-General', toGLen(7))
  const g3 = toG({ px: cx, py: R.y + 55 + 7 }); w.addTextC('APPROVED', g3.x, g3.y, 'Date ....................', toGLen(7))
}

function drawScaleBarDxf(w, layout, denom, toG, toGLen) {
  const R = layout.scaleBar
  const PT_PER_MM = 72 / 25.4
  const ptPerM = PT_PER_MM * 1000 / denom
  const barGroundM = (R.width / PT_PER_MM) * denom / 1000
  const seg = snapScaleBarSegment(barGroundM / 3)
  const segW = seg * ptPerM
  const barY = R.y + 10
  const bx = R.x + R.width / 2 - 1.5 * segW
  const x0 = bx + segW
  const barH = 4
  const subN = 5, subW = segW / subN

  for (let idx = 0; idx < subN; idx += 2) {
    const c1 = toG({ px: bx + idx * subW, py: barY }), c2 = toG({ px: bx + (idx + 1) * subW, py: barY + barH })
    w.addSolidRect('SCALE_BAR', c1.x, c1.y, c2.x, c2.y)
  }
  { const c1 = toG({ px: x0 + segW, py: barY }), c2 = toG({ px: x0 + 2 * segW, py: barY + barH })
    w.addSolidRect('SCALE_BAR', c1.x, c1.y, c2.x, c2.y) }
  const f0 = toG({ px: bx, py: barY }), f1 = toG({ px: bx + 3 * segW, py: barY })
  const f2 = toG({ px: bx + 3 * segW, py: barY + barH }), f3 = toG({ px: bx, py: barY + barH })
  w.addPolylineOutline('SCALE_BAR', [f0, f1, f2, f3], true)

  const lbl = (val, cxPt) => { const g = toG({ px: cxPt, py: R.y + 6.5 }); w.addTextC('SCALE_BAR', g.x, g.y, String(Math.round(val)), toGLen(6.5)) }
  lbl(seg, bx)
  lbl(0, x0)
  lbl(seg, x0 + segW)
  lbl(2 * seg, x0 + 2 * segW)
  { const g = toG({ px: x0 + 2 * segW + 6, py: barY + 6.5 }); w.addText('SCALE_BAR', g.x, g.y, 'metres', toGLen(6.5)) }
  { const g = toG({ px: R.x + R.width / 2, py: R.y + 20 + 6.5 }); w.addTextC('SCALE_BAR', g.x, g.y, `Scale 1 : ${denom}`, toGLen(6.5)) }
}

function drawStatementDxf(w, layout, geometry, metadata, toG, toGLen) {
  const R = layout.statement
  const seq = buildFigureRepresents(geometry)
  const area = formatDiagramArea(geometry.area)
  const designation = resolveStatementDesignation(geometry.designation, geometry.stand, metadata.designation)
  const parent = metadata.parentProperty ? ` OF ${metadata.parentProperty}` : ''
  const surveyDate = metadata.surveyDate ?? metadata.date

  { const g = toG({ px: R.x, py: R.y + 9 }); w.addText('STATEMENT', g.x, g.y, 'The figure', toGLen(9)) }
  { const g = toG({ px: R.x, py: R.y + 20 }); w.addText('STATEMENT', g.x, g.y, 'represents', toGLen(9)) }
  { const g = toG({ px: R.x + R.width / 2, py: R.y + 9 }); w.addTextC('STATEMENT', g.x, g.y, seq, toGLen(9)) }
  { const g = toG({ px: R.x + R.width / 2, py: R.y + 21 }); w.addTextC('STATEMENT', g.x, g.y, area, toGLen(9)) }
  { const g = toG({ px: R.x + R.width, py: R.y + 21 }); w.addTextR('STATEMENT', g.x, g.y, 'of land called', toGLen(9)) }

  const desigText = `${designation}${parent}`
  let desigSize = 11
  while (desigSize > 7.5 && textWidth(desigText, desigSize) > R.width) desigSize -= 0.5
  { const g = toG({ px: R.x, py: R.y + 30 + desigSize }); w.addText('STATEMENT', g.x, g.y, desigText, toGLen(desigSize)) }

  { const g = toG({ px: R.x, py: R.y + 53 }); w.addText('STATEMENT', g.x, g.y, `situate in the district of ${metadata.district ?? ''}.`, toGLen(9)) }
  const surveyedLine = `Surveyed in ${surveyDate ? new Date(surveyDate).toLocaleString('en', { month: 'long', year: 'numeric' }) : ''} by me`
  { const g = toG({ px: R.x, py: R.y + 70 }); w.addText('STATEMENT', g.x, g.y, surveyedLine, toGLen(9)) }
  { const g = toG({ px: R.x + R.width, py: R.y + 90 }); w.addTextR('STATEMENT', g.x, g.y, 'Land Surveyor', toGLen(9)) }
}

// Spread a single line's words across `width` via manual per-word spacing (no native
// DXF justify-across-width primitive — mirrors diagramPdf.js's drawJustifiedLine).
function justifiedLineDxf(w, layer, text, x, y, width, height, toG, toGLen) {
  const words = String(text).split(/\s+/).filter(Boolean)
  if (words.length === 0) return
  if (words.length === 1) { const g = toG({ px: x, py: y }); w.addText(layer, g.x, g.y, words[0], toGLen(height)); return }
  const wordsW = words.reduce((s, wd) => s + textWidth(wd, height), 0)
  const gap = Math.max(0, (width - wordsW) / (words.length - 1))
  let cx = x
  for (const wd of words) {
    const g = toG({ px: cx, py: y })
    w.addText(layer, g.x, g.y, wd, toGLen(height))
    cx += textWidth(wd, height) + gap
  }
}

function refRowY(top, bottom) {
  const row = (bottom - top) / 4
  return (i) => top + row * i + (row - 7) / 2 + 7 // +7: DXF baseline vs. PDF top-left
}

function drawDiagramRefCellDxf(w, { xLeft, xRight, top, bottom, pad, line1, no, annexedTo, deedNo }, toG, toGLen) {
  const cx = xLeft + pad
  const cw = (xRight - xLeft) - 2 * pad
  const y = refRowY(top, bottom)
  const rightPad = 4
  justifiedLineDxf(w, 'GRID', line1, cx, y(0), cw, 7, toG, toGLen)
  { const g = toG({ px: cx, py: y(1) }); w.addText('GRID', g.x, g.y, `No. ${no}`, toGLen(7)) }
  { const g = toG({ px: xRight - rightPad, py: y(1) }); w.addTextR('GRID', g.x, g.y, 'annexed to', toGLen(7)) }
  if (annexedTo) { const g = toG({ px: cx, py: y(2) }); w.addText('GRID', g.x, g.y, annexedTo, toGLen(7)) }
  { const g = toG({ px: xLeft + (xRight - xLeft) / 2, py: y(3) }); w.addText('GRID', g.x, g.y, `No. ${deedNo}`, toGLen(7)) }
}

function drawReferenceGridDxf(w, layout, grid, toG, toGLen) {
  const R = layout.refGrid
  const W = R.width
  const B = layout.border
  const bottom = B.y + B.height
  const x0 = R.x, x1 = R.x + W / 3, xR = B.x + B.width
  const x2 = x1 + (xR - x1) / 2
  const t1 = x1 + (xR - x1) / 3, t2 = x1 + 2 * (xR - x1) / 3
  const COMP_H = 14
  const r3 = bottom - COMP_H
  const r2 = r3 - R.height * 0.25
  const compCenterY = r3 + (COMP_H - 7) / 2 + 7

  const line = (px1, py1, px2, py2) => { const g1 = toG({ px: px1, py: py1 }), g2 = toG({ px: px2, py: py2 }); w.addLine('GRID', g1.x, g1.y, g2.x, g2.y) }
  line(B.x, R.y, B.x + B.width, R.y)
  line(x1, R.y, x1, bottom)
  line(x2, R.y, x2, r2)
  line(x1, r2, xR, r2)
  line(x1, r3, xR, r3)
  line(t1, r2, t1, r3)
  line(t2, r2, t2, r3)

  const pad = 3
  const wL = (x1 - x0) - 2 * pad
  const lY = refRowY(R.y, r2)
  const colMid = x0 + (x1 - x0) / 2
  { const g = toG({ px: x0 + pad, py: lY(0) }); w.addText('GRID', g.x, g.y, 'This diagram is annexed to', toGLen(7)) }
  { const g = toG({ px: x0 + pad, py: lY(1) }); w.addText('GRID', g.x, g.y, 'No.', toGLen(7)) }
  { const g = toG({ px: colMid, py: lY(1) }); w.addText('GRID', g.x, g.y, 'dated', toGLen(7)) }
  { const g = toG({ px: x0 + wL + pad, py: compCenterY }); w.addTextR('GRID', g.x, g.y, 'Surveyor-General', toGLen(7)) }

  drawDiagramRefCellDxf(w, {
    xLeft: x1, xRight: x2, top: R.y, bottom: r2, pad,
    line1: 'The immediate parent diagram is', no: grid.parentDiagramNo,
    annexedTo: grid.parentDiagramAnnexedTo, deedNo: grid.deedOfTransferNo,
  }, toG, toGLen)
  drawDiagramRefCellDxf(w, {
    xLeft: x2, xRight: xR, top: R.y, bottom: r2, pad,
    line1: 'The original title diagram is', no: grid.originalTitleDiagramNo,
    annexedTo: grid.parentDiagramAnnexedTo, deedNo: grid.deedOfTransferNo,
  }, toG, toGLen)

  const fileCenterY = r2 + ((r3 - r2) - 7) / 2 + 7
  { const g = toG({ px: x1 + pad, py: fileCenterY }); w.addText('GRID', g.x, g.y, `File : ${grid.fileNo}`, toGLen(7)) }
  { const g = toG({ px: t1 + pad, py: fileCenterY }); w.addText('GRID', g.x, g.y, `G.P. : ${grid.registrationGp}`, toGLen(7)) }
  { const g = toG({ px: t2 + pad, py: fileCenterY }); w.addText('GRID', g.x, g.y, `S.R. : ${grid.srNo}`, toGLen(7)) }
  { const g = toG({ px: x1 + pad, py: compCenterY }); w.addText('GRID', g.x, g.y, `Compilation : ${grid.compilation}`, toGLen(7)) }
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

  drawAdjoiningFeaturesDxf(w, {
    annotations: metadata.sideAnnotations,
    geometry, subjPt, subjCentroid, subjSegs, neighbourSegs, denom, labelObstacles, boxToSegs, toG, toGLen,
  }, logger)

  const loLabel = resolveLoSystem(null, metadata, options.projection)
  drawTableDxf(w, layout, sidesTable, loLabel, toG, toGLen)
  drawBeaconDescriptionDxf(w, layout, beaconGroups, toG, toGLen)

  drawNorthArrowDxf(w, layout, toG, toGLen)
  drawApprovedBoxDxf(w, layout, toG, toGLen)
  drawScaleBarDxf(w, layout, denom, toG, toGLen)

  drawStatementDxf(w, layout, geometry, metadata, toG, toGLen)

  drawReferenceGridDxf(w, layout, buildReferenceGrid(metadata), toG, toGLen)

  const allPoints = [b0, b1, b2, b3]
  const extMin = { x: Math.min(...allPoints.map((p) => p.x)), y: Math.min(...allPoints.map((p) => p.y)) }
  const extMax = { x: Math.max(...allPoints.map((p) => p.x)), y: Math.max(...allPoints.map((p) => p.y)) }
  const dxfBuffer = w.finish(extMin, extMax)

  return { dxfBuffer, scale: label, sheetSize }
}
