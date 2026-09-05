import PDFDocument from 'pdfkit'
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
import { contiguousMarks, CONTIG_STUB_MM } from './diagram/contiguousMarks.js'
import { resolveConnections } from './diagram/connections.js'
import {
  connectionMark, CONNECTION_STUB_MM, CONNECTION_ARROW_MM, CONNECTION_ARROW_HALF_MM,
} from './diagram/connectionMark.js'
import { roadBandRibbon } from './diagram/roadBandRibbon.js'
import { buildBeaconDescription } from './diagram/beaconDescription.js'
import { formatSI } from './diagram/numberFormat.js'
import {
  resolveLoSystem, snapScaleBarSegment,
} from '../../../app-shared/block-definitions.js'

// SI 727 figure styling.
const PT_PER_MM = 72 / 25.4
const FIGURE_GREEN = '#2f9e4f'                 // uniform green inner-border tint (from the sample)
const INNER_BAND_PT = 1.3 * PT_PER_MM          // ≈ 3.69 pt (~1.3 mm), page-relative band width
// Adjoining features (SI 727): roads burnt-sienna, servitudes blue, contiguous dashed.
const BURNT_SIENNA = '#B7410E'
const SERVITUDE_BLUE = '#1F6FB2'
const ROAD_STRIP_PT = 1.3 * PT_PER_MM          // nominal, like the inner band
const STRIP_FILL_OPACITY = 0.6                 // colour must not obscure detail
const CONTIG_STUB_PT = CONTIG_STUB_MM * PT_PER_MM
// Perpendicular clearance a contiguous-parcel label keeps from the abutting boundary.
const CONTIG_LABEL_MARGIN = 5

function docToBuffer(doc) {
  const chunks = []
  return new Promise((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })
}

/** Draw one parcel ring (already transformed to pt). */
function drawRing(doc, ptRing, { color, width }) {
  if (ptRing.length < 3) return
  doc.save().lineWidth(width).strokeColor(color)
  doc.moveTo(ptRing[0].px, ptRing[0].py)
  for (let i = 1; i < ptRing.length; i++) doc.lineTo(ptRing[i].px, ptRing[i].py)
  doc.closePath().stroke()
  doc.restore()
}

function centroidPt(ptRing) {
  const n = ptRing.length || 1
  return {
    px: ptRing.reduce((a, p) => a + p.px, 0) / n,
    py: ptRing.reduce((a, p) => a + p.py, 0) / n,
  }
}

// The ruled table's actual bottom Y for a given data-row count. Mirrors drawTable's
// internal layout (Constants row at tableY+30, +11 per data row, +9 for the closing
// box rule), so other content can be anchored below a short table.
function tableBottomY(tableY, rowCount) {
  return tableY + 39 + rowCount * 11
}

function drawTable(doc, layout, table, loLabel) {
  const { constRow, coordinateRows, sideRows } = table
  const R = layout.table
  // Fixed column x-offsets from R.x. The beacon "Const." names live in the
  // rightmost DIAGRAM S.G. No. column (matches the SG diagram samples), so there
  // is no separate Const. column.
  const cSide = 0, cDir = 76, cLetter = 158, cY = 198, cX = 260
  const cSg = layout.sgNoBox.x + 2 // absolute x of the rightmost (SG No.) column
  const rows = Math.max(coordinateRows.length, sideRows.length)
  // Y / X sub-column widths, used to centre the coordinate figures in their cells.
  const yColW = cX - cY
  const xColW = (layout.sgNoBox.x - 4) - (R.x + cX)
  // Y / X figures and the Constants row are centred within their sub-columns.
  const ctrY = { width: yColW, align: 'center' }
  const ctrX = { width: xColW, align: 'center' }
  // Whole CO-ORDINATES group width (spans the Y and X sub-columns).
  const coordGroupW = (layout.sgNoBox.x - 4) - (R.x + cY)
  const ctrCoord = { width: coordGroupW, align: 'center' }
  // DIRECTIONS column spans the dividers at R.x+70 .. R.x+150. Each data row shows the
  // side (AB/BC…, centred, no header) at the left, then the direction value right-
  // justified; the "° ' \"" units are right-justified too.
  const cDirX = R.x + 70
  const ctrDir = { width: 80, align: 'center' }
  // A divider (dirSplitX) separates the side labels (left) from the direction values.
  const dirSplitX = cDirX + 24
  const dirSide = { width: 22, align: 'center' }    // side label at the left of DIRECTIONS (no header)
  // Degree/minute/second sub-columns: each unit symbol (° ' ") sits directly over its
  // value column. Boxes span R.x+97 .. R.x+147 (3pt clear of both DIRECTIONS dividers).
  const oDeg = { width: 22, align: 'center' }, xDeg = R.x + 97
  const oMin = { width: 14, align: 'center' }, xMin = R.x + 119
  const oSec = { width: 14, align: 'center' }, xSec = R.x + 133
  // Vertex-letter column spans the dividers at R.x+150 .. R.x+193; centre its letters.
  const cLetX = R.x + 150
  const ctrLet = { width: 43, align: 'center' }
  // SIDES side-label sub-column: centre AB/BC/CD/DA in a fixed narrow band (kept
  // independent of cMetres so the divider can sit clear of the "SIDES" label).
  const ctrSide = { width: 30, align: 'center' }
  // METRES (distances) sub-column spans the dividers at R.x+32 .. R.x+70; it is a
  // top-row header (peer of SIDES/DIRECTIONS), centred, with centred values.
  const cMetresX = R.x + 32
  const ctrMetres = { width: 38, align: 'center' }

  doc.save().font('Helvetica-Bold').fontSize(7.5).fillColor('#000')
  doc.text('SIDES', R.x + cSide, R.y, ctrSide)
  doc.text('METRES', cMetresX, R.y, ctrMetres)
  doc.text('DIRECTIONS', cDirX, R.y, ctrDir)
  doc.text('CO-ORDINATES', R.x + cY, R.y, ctrCoord) // centred over Lo NN
  doc.text('DIAGRAM S.G. No.', cSg, R.y)
  doc.font('Helvetica').fontSize(7)
  // 'Lo NN' heads the CO-ORDINATES group, between CO-ORDINATES and the Y/X row.
  doc.text(loLabel, R.x + cY, R.y + 10, ctrCoord)
  // ASCII degree/minute/second marks — the prime (′ U+2032) and double-prime
  // (″ U+2033) glyphs are absent from PDFKit's built-in Helvetica and render as
  // garbage; °, ' and " are all in the font.
  doc.text('°', xDeg, R.y + 19, oDeg)
  doc.text('\'', xMin, R.y + 19, oMin)
  doc.text('"', xSec, R.y + 19, oSec)
  // Coordinate sub-headers: Y  Metres  X.
  doc.text('Y', R.x + cY, R.y + 19, ctrY)
  doc.text('Metres', R.x + cY, R.y + 19, ctrCoord)
  doc.text('X', R.x + cX, R.y + 19, ctrX)

  // Constants row + coordinate/side rows. The "Const." label and beacon names
  // are in the rightmost (SG No.) column.
  let ry = R.y + 30
  doc.text(constRow.y, R.x + cY, ry, ctrY)
  doc.text(constRow.x, R.x + cX, ry, ctrX)
  doc.text('Constants', cSg, ry)
  for (let i = 0; i < rows; i++) {
    ry += 11
    if (sideRows[i]) {
      doc.text(sideRows[i].side, R.x + cSide, ry, ctrSide)
      doc.text(sideRows[i].metres, cMetresX, ry, ctrMetres)
      doc.text(sideRows[i].side, cDirX, ry, dirSide)               // side before the direction (no header)
      const [dd, mm, ss] = String(sideRows[i].direction).split(' ')
      doc.text(dd ?? '', xDeg, ry, oDeg)
      doc.text(mm ?? '', xMin, ry, oMin)
      doc.text(ss ?? '', xSec, ry, oSec)
    }
    if (coordinateRows[i]) {
      doc.text(coordinateRows[i].letter, cLetX, ry, ctrLet)
      doc.text(coordinateRows[i].y, R.x + cY, ry, ctrY)
      doc.text(coordinateRows[i].x, R.x + cX, ry, ctrX)
      doc.text(coordinateRows[i].beaconName ?? '', cSg, ry)
    }
  }

  // Grid: no outer box — the column dividers run up to the top neat-line border
  // and the header/data rule spans the full width to the left/right neat-lines.
  const B = layout.border
  const boxB = tableBottomY(R.y, rows)
  const hSep = R.y + 28 // header/data separator (below the three header rows)
  // Group dividers, full height (the SIDES|METRES split is data-rows-only, below).
  const verticals = [R.x + 70, R.x + 150, R.x + 193, layout.sgNoBox.x - 4]
  doc.lineWidth(0.5).strokeColor('#000')
  for (const vx of verticals) doc.moveTo(vx, B.y).lineTo(vx, boxB).stroke()
  // Y|X divider — only through the value rows: the "Metres" coords sub-header
  // spans both Y and X, so the divider must not cross the header.
  doc.moveTo(R.x + cX, hSep).lineTo(R.x + cX, boxB).stroke()
  // SIDES|METRES divider — data rows only (below hSep), not through the heading.
  doc.moveTo(R.x + 32, hSep).lineTo(R.x + 32, boxB).stroke()
  // Side-label | direction-value divider inside DIRECTIONS — through the data rows only
  // (below hSep) so it does not cut the centred "DIRECTIONS" header.
  doc.moveTo(dirSplitX, hSep).lineTo(dirSplitX, boxB).stroke()
  doc.moveTo(B.x, hSep).lineTo(B.x + B.width, hSep).stroke()
  doc.restore()
  // The actual bottom of the ruled table (< the fixed table band for short tables),
  // so callers can anchor the blocks below it snugly.
  return boxB
}

function drawBeaconDescription(doc, layout, groups) {
  const R = layout.beaconDesc
  doc.save().font('Helvetica-Bold').fontSize(8).text('Description of Beacons', R.x, R.y)
  doc.font('Helvetica').fontSize(8)
  if (groups.length === 0) {
    doc.text('All          :', R.x, R.y + 11)
  } else if (groups.length === 1) {
    // All subject beacons share one description.
    doc.text(`All          : ${groups[0].description}`, R.x, R.y + 11)
  } else {
    let y = R.y + 11
    for (const g of groups) {
      doc.text(`${g.names}  :  ${g.description}`, R.x, y, { width: R.width })
      y += 11
    }
  }
  doc.restore()
}

/**
 * Draw the connecting data: for each connection, a ray from the beacon toward
 * its parent beacon, an arrowhead at the tip, the distance lettered along the
 * shaft and the far end lettered beyond it.
 *
 * Drawn SOLID, unlike the dashed abutment stub, because it is not the same kind
 * of statement: a stub says a neighbour abuts this side, a connection says this
 * beacon lies so far from that parent beacon, that way.
 */
function drawConnections(doc, ctx) {
  const { marks, tf, labelObstacles, boxToSegs } = ctx
  if (!marks?.length) return
  const ptPerMm = PT_PER_MM
  const len = CONNECTION_STUB_MM * ptPerMm
  const head = CONNECTION_ARROW_MM * ptPerMm
  const half = CONNECTION_ARROW_HALF_MM * ptPerMm

  for (const m of marks) {
    const from = tf(m.fromYX)
    const to = tf(m.toYX)
    const g = connectionMark([from.px, from.py], [to.px, to.py], len, head, half)
    if (!g) continue

    // The shaft stops at the head's base, so it cannot show through the fill.
    const baseMid = [(g.arrow[1][0] + g.arrow[2][0]) / 2, (g.arrow[1][1] + g.arrow[2][1]) / 2]
    doc.save().lineWidth(0.6).strokeColor('#000000').fillColor('#000000')
    doc.moveTo(g.tail[0], g.tail[1]).lineTo(baseMid[0], baseMid[1]).stroke()
    doc.moveTo(g.arrow[0][0], g.arrow[0][1])
      .lineTo(g.arrow[1][0], g.arrow[1][1])
      .lineTo(g.arrow[2][0], g.arrow[2][1])
      .closePath().fill()
    doc.restore()

    // Distance along the shaft, upright -- the same convention the side labels
    // use, so a connection on a diagonal reads like everything else.
    let angleDeg = Math.atan2(g.dir[1], g.dir[0]) * 180 / Math.PI
    if (angleDeg > 90 || angleDeg < -90) angleDeg += 180
    const text = `${formatSI(m.distanceM, 2)}m`
    doc.save().font('Helvetica').fontSize(7).fillColor('#000000')
    const tw = doc.widthOfString(text)
    const lx = g.labelAnchor[0], ly = g.labelAnchor[1]
    doc.rotate(angleDeg, { origin: [lx, ly] })
    doc.text(text, lx - tw / 2, ly - 7 - 1.5, { lineBreak: false })
    doc.restore()

    // The far end's letter, just beyond the tip.
    doc.save().font('Helvetica').fontSize(8).fillColor('#000000')
    const lw = doc.widthOfString(m.letter)
    const tipOut = 5
    const tx = g.tip[0] + g.dir[0] * tipOut, ty = g.tip[1] + g.dir[1] * tipOut
    doc.text(m.letter, tx - lw / 2, ty - 4, { lineBreak: false })
    doc.restore()

    // Vertex letters keep off the ray and off the letter at its end.
    labelObstacles.push([{ px: g.tail[0], py: g.tail[1] }, { px: g.tip[0], py: g.tip[1] }])
    labelObstacles.push(...boxToSegs({ x: tx - lw / 2, y: ty - 4, w: lw, h: 8 }))
  }
}

/**
 * Draw adjoining features from metadata.sideAnnotations: burnt-sienna road strips,
 * blue servitude strips (of a defined ground width), and dashed contiguous stubs,
 * each labelled outside the edge. Strips sit OUTSIDE the subject edge (via edgeStrip).
 */
function drawAdjoiningFeatures(doc, ctx, logger) {
  const {
    annotations, geometry, subjPt, subjCentroid, subjSegs, neighbourSegs,
    denom, labelObstacles, boxToSegs, connected,
  } = ctx
  if (!Array.isArray(annotations) || annotations.length === 0) return
  const n = geometry.vertices.length
  const ptPerGroundM = PT_PER_MM * 1000 / denom
  const cen = [subjCentroid.px, subjCentroid.py]
  // Road/servitude names sit beyond the vertex-letter band so they clear the letters
  // (which stay snug to their beacons). ~beaconR + gap + letter height ≈ the band.
  const vertexBandPt = beaconRadiusPt(denom) + 14
  // Side lookups for road-end handling: a road extends past a corner unless the flanking
  // side is ANOTHER road (an L-junction, where the bands just meet); it bends to a
  // contiguous offshoot if one is drawn there, else extends straight along the road axis.
  const contiguousSides = new Set(
    annotations.filter((x) => x && x.role === 'contiguous' && x.side).map((x) => x.side))
  const roadSides = new Set(
    annotations.filter((x) => x && x.role === 'road' && x.side).map((x) => x.side))

  for (const ann of annotations) {
    if (!ann || !ann.side || !ann.role) continue
    // Resolve the side letters (e.g. 'AB') to a subject edge index.
    let i = -1
    for (let k = 0; k < n; k++) {
      const s = geometry.vertices[k].letter + geometry.vertices[(k + 1) % n].letter
      if (s === ann.side) { i = k; break }
    }
    if (i < 0) { logger?.warn?.(`[Diagram] adjoining: side ${ann.side} not found`); continue }

    const p1 = subjPt[i]
    const p2 = subjPt[(i + 1) % n]
    const a = [p1.px, p1.py]
    const b = [p2.px, p2.py]
    const mid = { px: (p1.px + p2.px) / 2, py: (p1.py + p2.py) / 2 }

    if (ann.role === 'road' || ann.role === 'servitude') {
      let q = null
      if (ann.role === 'servitude') {
        if (!(ann.widthM > 0)) {
          logger?.warn?.(`[Diagram] servitude ${ann.side} has no widthM; drawing label only`)
        } else {
          q = edgeStrip(a, b, ann.widthM * ptPerGroundM, cen)
        }
      } else {
        // Road: a thin ribbon along the frontage. At each corner that is an OPEN road end
        // (flanking side is not another road) the band extends past the corner — bending to
        // run flush along a contiguous offshoot if one is drawn there (align, no divergence),
        // otherwise extending straight along the road axis so the road reads as continuing
        // beyond the parcel. At a road↔road corner (L-junction) it just meets its neighbour.
        const flankA = geometry.vertices[(i - 1 + n) % n].letter + geometry.vertices[i].letter
        const flankB = geometry.vertices[(i + 1) % n].letter + geometry.vertices[(i + 2) % n].letter
        const axLen = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
        const ax = [(b[0] - a[0]) / axLen, (b[1] - a[1]) / axLen] // unit A→B (road axis)
        const inner = []
        if (!roadSides.has(flankA)) {
          if (contiguousSides.has(flankA)) {
            const prev = subjPt[(i - 1 + n) % n]
            inner.push(edgeStrip([prev.px, prev.py], a, CONTIG_STUB_PT, cen)[2]) // bend to offshoot tip
          } else {
            inner.push([a[0] - ax[0] * CONTIG_STUB_PT, a[1] - ax[1] * CONTIG_STUB_PT]) // straight past A
          }
        }
        inner.push(a, b)
        if (!roadSides.has(flankB)) {
          if (contiguousSides.has(flankB)) {
            const next = subjPt[(i + 2) % n]
            inner.push(edgeStrip(b, [next.px, next.py], CONTIG_STUB_PT, cen)[3]) // bend to offshoot tip
          } else {
            inner.push([b[0] + ax[0] * CONTIG_STUB_PT, b[1] + ax[1] * CONTIG_STUB_PT]) // straight past B
          }
        }
        q = roadBandRibbon(inner, ROAD_STRIP_PT, cen)
      }
      if (q && q.length >= 3) {
        doc.save()
          .fillColor(ann.role === 'road' ? BURNT_SIENNA : SERVITUDE_BLUE)
          .fillOpacity(STRIP_FILL_OPACITY)
        doc.moveTo(q[0][0], q[0][1])
        for (let k = 1; k < q.length; k++) doc.lineTo(q[k][0], q[k][1])
        doc.closePath().fill()
        doc.restore()
        // Register the colour band as a label obstacle so vertex/neighbour letters get
        // placed CLEAR of it — the road/servitude fill must never sit behind lettering.
        for (let k = 0; k < q.length; k++) {
          const s = q[k], t = q[(k + 1) % q.length]
          labelObstacles.push([{ px: s[0], py: s[1] }, { px: t[0], py: t[1] }])
        }
      }
    } else if (ann.role === 'contiguous') {
      // Dashed outward stub at each abutting terminal (both when the neighbour spans the
      // side; one when it abuts near a single terminal). Which ends + the label anchor
      // come from the shared contiguousMarks helper.
      // A terminal carrying a connecting-data ray gets no stub: two marks on
      // one beacon make two different claims a reader cannot tell apart.
      const marks = contiguousMarks(a, b, ann.end, {
        from: connected?.has(geometry.vertices[i].letter),
        to: connected?.has(geometry.vertices[(i + 1) % n].letter),
      })
      const st = edgeStrip(a, b, CONTIG_STUB_PT, cen) // st[3]=a+out, st[2]=b+out
      doc.save().dash(3, { space: 2 }).lineWidth(0.6).strokeColor('#000000')
      if (marks.stubFrom) doc.moveTo(a[0], a[1]).lineTo(st[3][0], st[3][1]).stroke()
      if (marks.stubTo) doc.moveTo(b[0], b[1]).lineTo(st[2][0], st[2][1]).stroke()
      doc.undash().restore()
      // Keep letters off the offshoot stubs too.
      if (marks.stubFrom) labelObstacles.push([{ px: a[0], py: a[1] }, { px: st[3][0], py: st[3][1] }])
      if (marks.stubTo) labelObstacles.push([{ px: b[0], py: b[1] }, { px: st[2][0], py: st[2][1] }])
    }

    // Label the feature. Roads read ALONG the edge (rotated), just outside the strip;
    // servitude/contiguous keep the horizontal outward label (avoiding drawn lines).
    if (ann.label) {
      doc.save().font('Helvetica').fontSize(7).fillColor('#000000')
      const labelText = ann.role === 'road' && ann.widthM > 0
        ? `${ann.label} ${formatSI(ann.widthM, 2)}m`
        : ann.label
      const labelW = doc.widthOfString(labelText)
      if (ann.role === 'road' || ann.role === 'servitude') {
        const ex = p2.px - p1.px, ey = p2.py - p1.py
        const len = Math.hypot(ex, ey) || 1
        let perpX = -ey / len, perpY = ex / len
        // Point the perpendicular OUTWARD (away from the figure centroid).
        if (perpX * (subjCentroid.px - mid.px) + perpY * (subjCentroid.py - mid.py) > 0) { perpX = -perpX; perpY = -perpY }
        let angleDeg = Math.atan2(ey, ex) * 180 / Math.PI
        if (angleDeg > 90 || angleDeg < -90) angleDeg += 180 // keep the text upright
        // Push the name out past the strip AND the vertex-letter band, so it clears
        // the figure vertex labels (which stay close to their beacons).
        const stripPt = ann.role === 'servitude' && ann.widthM > 0 ? ann.widthM * ptPerGroundM : ROAD_STRIP_PT
        const off = stripPt + vertexBandPt
        const lx = mid.px + perpX * off, ly = mid.py + perpY * off
        doc.rotate(angleDeg, { origin: [lx, ly] })
        doc.text(labelText, lx - labelW / 2, ly - 3.5, { lineBreak: false })
      } else {
        // Centre the neighbour label on the abutting extent (whole side, or the tagged
        // half) rather than always the side midpoint.
        const m = contiguousMarks(a, b, ann.end)
        const anchor = { px: m.labelAnchor[0], py: m.labelAnchor[1] }
        const labelH = 7
        // Stand the label a CONSISTENT perpendicular margin off the boundary, whatever the
        // digit count. placeVertexLabel centres the box at (beaconR + gap + half) along the
        // outward normal; the box reaches back toward the line by `extent` (its half-size
        // projected onto that normal), so its near edge sits at gap + half - extent. Solve
        // that for a fixed CONTIG_LABEL_MARGIN — otherwise a narrow label like "88" nestles
        // onto a diagonal edge while a wider "404" gets pushed clear.
        let ox = anchor.px - subjCentroid.px, oy = anchor.py - subjCentroid.py
        const ol = Math.hypot(ox, oy) || 1; ox /= ol; oy /= ol
        const extent = (labelW / 2) * Math.abs(ox) + (labelH / 2) * Math.abs(oy)
        const half = Math.max(labelW, labelH) / 2
        const gap = Math.max(2, CONTIG_LABEL_MARGIN + extent - half)
        const pos = placeVertexLabel(anchor, subjCentroid, {
          beaconR: 0, gap, labelW, labelH,
          segments: subjSegs.concat(neighbourSegs, labelObstacles),
        })
        doc.text(labelText, pos.x, pos.y)
        labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: labelH }))
      }
      doc.restore()
    }
  }
}

function drawNorthArrow(doc, layout) {
  const R = layout.northArrow
  const cx = R.x + R.width / 2
  doc.save().lineWidth(1).strokeColor('#000')
  doc.moveTo(cx, R.y + R.height).lineTo(cx, R.y).stroke()      // shaft
  doc.moveTo(cx - 4, R.y + 8).lineTo(cx, R.y).lineTo(cx + 4, R.y + 8).stroke() // head
  // "T" and "N" flank the shaft near its base, so the vertical line passes between them.
  doc.font('Helvetica').fontSize(7)
  doc.text('T', cx - 9, R.y + R.height - 14)
  doc.text('N', cx + 4, R.y + R.height - 14)
  doc.restore()
}

function drawApprovedBox(doc, layout) {
  const R = layout.approved
  // No box outline; contents centred within the approval region.
  const ctr = { width: R.width, align: 'center' }
  doc.save().font('Helvetica').fontSize(7).fillColor('#000')
  // Wider gaps leave room to sign above "for Surveyor-General" and to enter the date.
  doc.text('Approved', R.x, R.y + 5, ctr)
  doc.text('for Surveyor-General', R.x, R.y + 31, ctr)
  doc.text('Date ....................', R.x, R.y + 55, ctr)
  doc.restore()
}

function drawScaleBar(doc, layout, denom) {
  const R = layout.scaleBar
  const ptPerM = (72 / 25.4) * 1000 / denom
  const barGroundM = (R.width / (72 / 25.4)) * denom / 1000
  // Bar = 1 subdivided segment LEFT of 0 + 2 equal segments RIGHT of 0 (SG style).
  const seg = snapScaleBarSegment(barGroundM / 3)
  const w = seg * ptPerM
  const barY = R.y + 10
  // Centre the 3-segment bar (width 3w) on the region centre — the same x as the figure
  // sequence "A.B.C…A" above it — so the two read as vertically symmetric. Snapping makes
  // 3w ≠ R.width, so the bar is re-centred rather than left-anchored at R.x.
  const bx = R.x + R.width / 2 - 1.5 * w
  const x0 = bx + w // ground zero, after the left (subdivided) segment
  const barH = 4
  doc.save().lineWidth(0.75).strokeColor('#000').font('Helvetica').fontSize(6.5)
  // SG-style checkerboard. Fill alternate cells with fill()-ONLY so each graduation is
  // exactly its cell width and all read uniform. The old fillAndStroke('#000','#000')
  // bled the 1pt stroke ~0.5pt past every black cell (and the white cells' own borders
  // inset their interior), which made the black graduations appear wider than the white
  // ones and left the bar's top/bottom edges ragged.
  // Left segment: 5 equal subdivisions left of 0, alternating black (B W B W B).
  const subN = 5
  const subW = w / subN
  for (let i = 0; i < subN; i += 2) doc.rect(bx + i * subW, barY, subW, barH).fill('#000')
  // Right of 0: two equal segments continuing the alternation past 0 (W B).
  doc.rect(x0 + w, barY, w, barH).fill('#000')
  // One outer frame across all three segments, stroked once on top of the fills, so the
  // whole checkerboard sits inside a single clean rectangle with straight top/bottom edges.
  doc.strokeColor('#000').rect(bx, barY, 3 * w, barH).stroke()
  // Tick labels: seg | 0 | seg | 2*seg, centred under each tick.
  const lbl = (val, cx) => doc.fillColor('#000').text(String(Math.round(val)), cx - 8, R.y, { width: 16, align: 'center' })
  lbl(seg, bx)
  lbl(0, x0)
  lbl(seg, x0 + w)
  lbl(2 * seg, x0 + 2 * w)
  doc.text('metres', x0 + 2 * w + 6, barY)
  // Caption centred on the region centre (= the figure sequence "A.B.C…A" centre above),
  // so it stays symmetric under the bar regardless of the number's width.
  doc.text(`Scale 1 : ${denom}`, R.x, R.y + 20, { width: R.width, align: 'center' })
  doc.restore()
}

function drawStatement(doc, layout, geometry, metadata) {
  const R = layout.statement
  const seq = buildFigureRepresents(geometry)
  const area = formatDiagramArea(geometry.area)
  // Name the SELECTED parcel (subject). A bare stand number is expanded to
  // "STAND <n> <locality>" using the project designation's locality suffix.
  const designation = resolveStatementDesignation(geometry.designation, geometry.stand, metadata.designation)
  const parent = metadata.parentProperty ? ` OF ${metadata.parentProperty}` : ''
  // Survey date arrives as metadata.date from the frontend; accept either key.
  const surveyDate = metadata.surveyDate ?? metadata.date
  doc.save().font('Helvetica').fontSize(9).fillColor('#000')
  doc.text('The figure', R.x, R.y)
  doc.text('represents', R.x, R.y + 11)
  // Sequence and area figure are centred over the full statement width, which shares
  // the content axis with the scale bar above — so both sit directly under it (area
  // under "A.B.C…A"); "of land called" is right-aligned on the area line.
  doc.text(`${seq}`, R.x, R.y, { width: R.width, align: 'center' })
  doc.text(area, R.x, R.y + 12, { width: R.width, align: 'center' })
  doc.text('of land called', R.x, R.y + 12, { width: R.width, align: 'right' })
  // Designation dominates at 11pt, but must stay on ONE row: shrink to fit R.width
  // (down to a 7.5pt floor) so a long name never wraps into the "situate" line below.
  const desigText = `${designation}${parent}`
  doc.font('Helvetica-Bold')
  let desigSize = 11
  doc.fontSize(desigSize)
  while (desigSize > 7.5 && doc.widthOfString(desigText) > R.width) {
    desigSize -= 0.5
    doc.fontSize(desigSize)
  }
  doc.text(desigText, R.x, R.y + 30, { width: R.width, lineBreak: false })
  // Same 9pt as the "The figure … of land called" block above.
  doc.font('Helvetica').fontSize(9).text(
    `situate in the district of ${metadata.district ?? ''}.`, R.x, R.y + 44)
  // Extra row above "Surveyed … by me" (below "situate in the district of …") for
  // visual separation.
  doc.text(`Surveyed in ${surveyDate ? new Date(surveyDate).toLocaleString('en', { month: 'long', year: 'numeric' }) : ''} by me`, R.x, R.y + 61)
  // "Land Surveyor" drops to its own line (right-aligned as before), leaving the
  // row between it and "Surveyed … by me" for the surveyor's signature.
  doc.text('Land Surveyor', R.x, R.y + 81, { width: R.width, align: 'right' })
  doc.restore()
}

// Spread a single line's words across `width` (full justification). PDFKit's
// align:'justify' never stretches a paragraph's last line, so a one-liner needs
// manual word spacing.
function drawJustifiedLine(doc, text, x, y, width) {
  const words = String(text).split(/\s+/).filter(Boolean)
  if (words.length === 0) return
  if (words.length === 1) { doc.text(words[0], x, y, { lineBreak: false }); return }
  const wordsW = words.reduce((s, w) => s + doc.widthOfString(w), 0)
  const gap = Math.max(0, (width - wordsW) / (words.length - 1))
  let cx = x
  for (const w of words) {
    doc.text(w, cx, y, { lineBreak: false })
    cx += doc.widthOfString(w) + gap
  }
}

// Even 4-row baseline grid for a reference cell of height [top..bottom]. Shared by
// all three columns so their text lines up row-for-row.
function refRowY(top, bottom) {
  const row = (bottom - top) / 4                     // even line band over the cell height
  return (i) => top + row * i + (row - 7) / 2        // centre a ~7pt line in its band
}

// Render a top-band reference cell (parent diagram / original title diagram) on the
// shared 4-row grid:
//   1. <line1>                        full-justified across the cell
//   2. "No. <no>" .......... "annexed to"  ("annexed to" right-justified, padded)
//   3. <annexedTo> (deed type)        left-justified, only when available
//   4. "No. <deedNo>"                 starting at the cell's horizontal centre
function drawDiagramRefCell(doc, { xLeft, xRight, top, bottom, pad, line1, no, annexedTo, deedNo }) {
  const cx = xLeft + pad
  const cw = (xRight - xLeft) - 2 * pad
  const y = refRowY(top, bottom)
  const rightPad = 4
  drawJustifiedLine(doc, line1, cx, y(0), cw)
  doc.text(`No. ${no}`, cx, y(1), { lineBreak: false })
  doc.text('annexed to', cx, y(1), { width: cw - rightPad, align: 'right' })
  // Deed type on row 3 only when present ("if available"); the deed-No. row anchors at
  // the cell centre and shows the number when present ("No. " alone otherwise).
  if (annexedTo) doc.text(annexedTo, cx, y(2), { lineBreak: false })
  doc.text(`No. ${deedNo}`, xLeft + (xRight - xLeft) / 2, y(3), { lineBreak: false })
}

function drawReferenceGrid(doc, layout, grid) {
  const R = layout.refGrid
  const W = R.width, H = R.height
  const B = layout.border
  const bottom = B.y + B.height
  // Left column takes ~33%; the remaining ~67% runs to the right neat-line (xR) and
  // holds a parent | original-title band on top, then the full-width File|G.P.|S.R.
  // and Compilation rows.
  const x0 = R.x, x1 = R.x + W / 3, xR = B.x + B.width
  const x2 = x1 + (xR - x1) / 2                              // parent | original-title (top band)
  const t1 = x1 + (xR - x1) / 3, t2 = x1 + 2 * (xR - x1) / 3 // File | G.P. | S.R. thirds
  // Compilation is a short row anchored on the bottom neat-line. The File|G.P.|S.R.
  // row keeps its height; the parent/original-title band above grows to absorb the
  // space freed by the shorter compilation row.
  const COMP_H = 14
  const r3 = bottom - COMP_H                  // compilation row top
  const r2 = r3 - H * 0.25                     // File|G.P.|S.R. row top / top band bottom
  const compCenterY = r3 + (COMP_H - 7) / 2    // vertical centre of a 7pt line in the row

  doc.save().lineWidth(0.5).strokeColor('#000')
  // Top border (full width) + the left-column divider (full height).
  doc.moveTo(B.x, R.y).lineTo(B.x + B.width, R.y).stroke()
  doc.moveTo(x1, R.y).lineTo(x1, bottom).stroke()
  // Parent | original-title split — top band only (down to r2).
  doc.moveTo(x2, R.y).lineTo(x2, r2).stroke()
  // Full-width rules above File|G.P.|S.R. (r2) and above Compilation (r3), and the
  // two dividers splitting the File|G.P.|S.R. row into three equal cells.
  doc.moveTo(x1, r2).lineTo(xR, r2).stroke()
  doc.moveTo(x1, r3).lineTo(xR, r3).stroke()
  doc.moveTo(t1, r2).lineTo(t1, r3).stroke()
  doc.moveTo(t2, r2).lineTo(t2, r3).stroke()

  doc.font('Helvetica').fontSize(7).fillColor('#000')
  const pad = 3
  const wL = (x1 - x0) - 2 * pad
  // Left column — the current diagram's annexation, on the same row grid as the
  // parent/original-title cells (row 0 aligns across all three columns). "No." and
  // "dated" share row 1, with "dated" starting at the column's horizontal centre; both
  // values are filled by the SG office after lodgment, so they stay blank (labels only).
  const lY = refRowY(R.y, r2)
  const colMid = x0 + (x1 - x0) / 2
  doc.text('This diagram is annexed to', x0 + pad, lY(0), { width: wL })
  doc.text('No.', x0 + pad, lY(1), { lineBreak: false })
  doc.text('dated', colMid, lY(1), { lineBreak: false })
  // Right-aligned within the left column, vertically level with the centred
  // "Compilation :" in the short bottom row.
  doc.text('Surveyor-General', x0 + pad, compCenterY, { width: wL, align: 'right' })
  // Top band: parent-diagram cell (left) and original-title cell (right), both on the
  // same 4-row layout. Each cell has its own deed type + No. (deed type shown only when
  // available) — they're often different documents, so they're captured independently.
  drawDiagramRefCell(doc, {
    xLeft: x1, xRight: x2, top: R.y, bottom: r2, pad,
    line1: 'The immediate parent diagram is', no: grid.parentDiagramNo,
    annexedTo: grid.parentDiagramAnnexedTo, deedNo: grid.deedOfTransferNo,
  })
  drawDiagramRefCell(doc, {
    xLeft: x2, xRight: xR, top: R.y, bottom: r2, pad,
    line1: 'The original title diagram is', no: grid.originalTitleDiagramNo,
    annexedTo: grid.originalTitleAnnexedTo, deedNo: grid.originalTitleDeedNo,
  })
  // File | G.P. | S.R. row: each entry left-justified in its own column cell,
  // vertically centred in the row.
  const fileCenterY = r2 + ((r3 - r2) - 7) / 2
  doc.text(`File : ${grid.fileNo}`, x1 + pad, fileCenterY, { lineBreak: false })
  doc.text(`G.P. : ${grid.gpNo}`, t1 + pad, fileCenterY, { lineBreak: false })
  doc.text(`S.R. : ${grid.srNo}`, t2 + pad, fileCenterY, { lineBreak: false })
  // Compilation left-justified, vertically centred in its short bottom row.
  doc.text(`Compilation : ${grid.compilation}`, x1 + pad, compCenterY, { lineBreak: false })
  doc.restore()
}

export async function generateDiagramPDF(options, logger) {
  const { parcels, metadata = {}, scale: requestedScale } = options
  const sheetSize = options.sheetSize === 'A3' ? 'A3' : 'A4'
  const features = parcels?.features ?? []
  const subjectId = String(metadata.subjectParcelId ?? '')
  const subject = features.find((f) => String(f.properties?.id) === subjectId)
  if (!subject) {
    throw new Error(`Diagram: subject parcel not found (subjectParcelId=${subjectId})`)
  }
  const neighbours = features.filter((f) => f !== subject)

  const dims = pageDimsPt(sheetSize)
  const margins = marginsPt()
  const layout = computeDiagramLayout({ pageWidthPt: dims.width, pageHeightPt: dims.height, margins })

  const geometry = deriveSubjectGeometry(subject)
  // 10 m offset buffer of the subject; the figure is sized to it so only a thin
  // ring of surrounding context is shown (falls back to the subject extent).
  let buffer = []
  try {
    buffer = bufferRing(subject?.geometry?.coordinates?.[0] ?? [])
  } catch (e) {
    logger?.warn?.(`[Diagram] buffer failed: ${e?.message}`)
  }
  const extent = buffer.length ? ringExtent(buffer) : parcelExtent(subject)

  // --- Reflow the mid-page blocks around the *actual* table height. ---
  // The fixed table band is sized for the largest parcels; a typical short table
  // leaves it mostly empty. Anchor the Description-of-Beacons and Approval blocks
  // just below the real table bottom, then let the figure grow upward into the
  // reclaimed space, with the figure + scale bar centred as a group between the
  // blocks and the "The figure ..." statement.
  const sidesTable = buildSidesTable(geometry, options.beacons)
  const beaconGroups = buildBeaconDescription(geometry, options.beacons)
  const tableRows = Math.max(sidesTable.coordinateRows.length, sidesTable.sideRows.length)
  const tableBottom = tableBottomY(layout.table.y, tableRows)
  const BEACON_DESC_GAP = 8
  layout.beaconDesc = { ...layout.beaconDesc, y: tableBottom + BEACON_DESC_GAP }
  layout.approved = { ...layout.approved, y: tableBottom + BEACON_DESC_GAP }
  // Visual bottom of the two blocks: the Approval text runs to ~63 pt (three rows),
  // the beacon list to a heading + one row per description group; take the lower.
  const approvalContentH = 63
  const beaconContentH = 11 + Math.max(1, beaconGroups.length) * 11
  const blocksBottom = tableBottom + BEACON_DESC_GAP + Math.max(approvalContentH, beaconContentH)
  // Region for the figure + scale bar group: below the blocks, above the statement.
  // Centre the group with equal top/bottom margins; reserve the scale bar's band and
  // a small gap beneath the figure.
  const REGION_MARGIN = 10
  const FIG_SCALE_GAP = 6
  const scaleBarH = layout.scaleBar.height
  const regionH = layout.statement.y - blocksBottom
  const figureH = Math.max(140, regionH - 2 * REGION_MARGIN - FIG_SCALE_GAP - scaleBarH)
  layout.figure = { ...layout.figure, y: blocksBottom + REGION_MARGIN, height: figureH }
  layout.scaleBar = { ...layout.scaleBar, y: layout.figure.y + figureH + FIG_SCALE_GAP }
  // North arrow tracks the figure's new top.
  layout.northArrow = { ...layout.northArrow, y: layout.figure.y + 8 }

  const { denom, label } = pickDiagramScale(extent, layout.figure, requestedScale)
  const tf = makeTransform(extent, layout.figure, denom)

  const doc = new PDFDocument({ size: [dims.width, dims.height], margin: 0 })
  const bufferPromise = docToBuffer(doc)

  // Neat-line border (35mm left, 15mm other margins); content sits inside it.
  doc.save().lineWidth(1).strokeColor('#000')
  doc.rect(layout.border.x, layout.border.y, layout.border.width, layout.border.height).stroke()
  doc.restore()

  // Abutting neighbours: clip to the 10 m buffer, faint outline + label at the
  // clipped strip. The whole-site OUTSIDE FIGURE parcel is excluded; parcels that
  // don't reach the buffer clip to nothing and are omitted.
  doc.font('Helvetica').fontSize(7).fillColor('#555555')
  const neighbourSegs = [] // drawn neighbour line segments (pt) — labels avoid these
  const neighbourLabels = [] // { anchor, text } drawn after the subject, placed outward
  if (buffer.length) {
    for (const nb of neighbours) {
      if (isOutsideFigureFeature(nb)) continue
      const nbRing = nb?.geometry?.coordinates?.[0] ?? []
      const strips = clipRingToPolygon(nbRing, buffer)
      if (!strips.length) continue
      // Draw only the real neighbour boundary edges within the buffer — not the
      // artificial clip line along the buffer boundary.
      doc.save().dash(4, { space: 2.5 }).lineWidth(1).strokeColor('#000000')
      for (const strip of strips) {
        for (const [a, b] of neighbourBoundaryEdges(strip, nbRing)) {
          const pa = tf(a), pb = tf(b)
          doc.moveTo(pa.px, pa.py).lineTo(pb.px, pb.py)
          neighbourSegs.push([pa, pb])
        }
      }
      doc.stroke().undash().restore()
      const stand = nb.properties?.stand ?? nb.properties?.designation ?? ''
      if (stand) {
        // Defer drawing: placed outward, line-avoiding, once all segments are known.
        neighbourLabels.push({ anchor: centroidPt(strips[0].map((p) => tf(p))), text: String(stand) })
      }
    }
  }

  // Subject: bold outline, beacon circles at each vertex, lettered vertices.
  const subjPt = geometry.vertices.map((v) => tf([v.y, v.x]))
  // Green inner figure-border band: fill the ring between the boundary and an
  // inward offset (even-odd rule) so only a ~1.3 mm band inside the edge is tinted.
  const inner = offsetPolygonPt(subjPt.map((p) => [p.px, p.py]), -INNER_BAND_PT)
  if (inner.length) {
    doc.save().fillColor(FIGURE_GREEN)
    doc.moveTo(subjPt[0].px, subjPt[0].py)
    for (let i = 1; i < subjPt.length; i++) doc.lineTo(subjPt[i].px, subjPt[i].py)
    doc.closePath()
    for (const ring of inner) {
      doc.moveTo(ring[0][0], ring[0][1])
      for (let i = 1; i < ring.length; i++) doc.lineTo(ring[i][0], ring[i][1])
      doc.closePath()
    }
    doc.fill('even-odd')
    doc.restore()
  }
  // Continuous, well-defined black boundary on top of the band.
  drawRing(doc, subjPt, { color: '#000000', width: 1.2 })
  // Vertex letters placed OUTSIDE the figure, clear of the beacon circle, and not
  // overriding the subject or adjoining-property lines. (No edge-distance labels.)
  doc.fillColor('#000000').fontSize(8)
  const subjCentroid = centroidPt(subjPt)
  const subjSegs = subjPt.map((p, i) => [p, subjPt[(i + 1) % subjPt.length]])
  // Already-placed label boxes become obstacles too, so labels don't collide with
  // each other. A box is represented by its 4 edges + 2 diagonals (the diagonals
  // catch a smaller candidate that would sit fully inside a larger placed box).
  const labelObstacles = []
  const boxToSegs = (b) => {
    const c1 = { px: b.x, py: b.y }, c2 = { px: b.x + b.w, py: b.y }
    const c3 = { px: b.x + b.w, py: b.y + b.h }, c4 = { px: b.x, py: b.y + b.h }
    return [[c1, c2], [c2, c3], [c3, c4], [c4, c1], [c1, c3], [c2, c4]]
  }

  // Adjoining features (roads/servitudes/contiguous) from metadata.sideAnnotations —
  // drawn outside the figure, before labels so their designations become obstacles.
  // Connecting data is resolved BEFORE the adjoining features are drawn: a
  // beacon that carries a connection must not also get an abutment stub, and
  // the stub is drawn in there.
  const { marks: connMarks, suppressed: connected } = resolveConnections({
    geometry, beacons: options.beacons, connections: metadata.connections,
  })

  drawAdjoiningFeatures(doc, {
    annotations: metadata.sideAnnotations,
    geometry, subjPt, subjCentroid, subjSegs, neighbourSegs, denom, labelObstacles, boxToSegs,
    connected,
  }, logger)

  drawConnections(doc, { marks: connMarks, tf, labelObstacles, boxToSegs })

  // Beacon circles drawn ON TOP of the boundary AND the adjoining features: the white
  // fill knocks out the lines inside, so edges (incl. road/servitude strips) appear
  // clipped at the circle edge (the developed-plan technique). Page-relative → visible.
  const beaconR = beaconRadiusPt(denom)
  for (const p of subjPt) {
    doc.save()
      .circle(p.px, p.py, beaconR)
      .lineWidth(0.8)
      .fillColor('#FFFFFF')
      .strokeColor('#000000')
      .fillAndStroke()
    doc.restore()
  }

  geometry.vertices.forEach((v, i) => {
    const p = subjPt[i]
    const labelW = doc.widthOfString(v.letter)
    const pos = placeVertexLabel(p, subjCentroid, {
      beaconR, labelW, labelH: 8, gap: 2, segments: subjSegs.concat(neighbourSegs, labelObstacles),
    })
    doc.text(v.letter, pos.x, pos.y)
    labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: 8 }))
  })

  // Neighbour stand labels: same outward (away from the subject centroid),
  // line-avoiding placement, clear of the drawn lines AND the vertex labels.
  doc.font('Helvetica').fontSize(7).fillColor('#555555')
  for (const nl of neighbourLabels) {
    const labelW = doc.widthOfString(nl.text)
    const pos = placeVertexLabel(nl.anchor, subjCentroid, {
      beaconR: 0, gap: 1, labelW, labelH: 7, segments: subjSegs.concat(neighbourSegs, labelObstacles),
    })
    doc.text(nl.text, pos.x, pos.y)
    labelObstacles.push(...boxToSegs({ x: pos.x, y: pos.y, w: labelW, h: 7 }))
  }

  // resolveLoSystem already returns the full "Lo NN" label.
  const loLabel = resolveLoSystem(null, metadata, options.projection)
  // Table + blocks + figure positions were reflowed above (see "Reflow the mid-page
  // blocks"); here we just render into them.
  drawTable(doc, layout, sidesTable, loLabel)
  drawBeaconDescription(doc, layout, beaconGroups)
  drawNorthArrow(doc, layout)
  drawApprovedBox(doc, layout)
  drawScaleBar(doc, layout, denom)
  drawStatement(doc, layout, geometry, metadata)
  drawReferenceGrid(doc, layout, buildReferenceGrid(metadata))

  doc.end()
  const pdfBuffer = await bufferPromise
  return { pdfBuffer, scale: label, sheetSize }
}
