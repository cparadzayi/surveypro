import { describe, test, expect, beforeAll } from '@jest/globals'
import { generateDiagramPDF } from '../diagramPdf.js'
import { generateDiagramDXFr12 as generateDiagramDXF } from './dxfTestHelpers.js'
import { CAP_HEIGHT } from '../diagram/opsToDxf.js'

/**
 * The diagram DXF must be a replica of the diagram PDF: the same texts, in the same places and
 * sizes, the same lines, the same fills, on the sheet in the same order. It is built from the PDF's
 * own recorded drawing (see diagramDxf.js), and this holds it to that: what the PDF drew is compared
 * with what is in the file, so a change to either renderer that makes them differ fails here.
 *
 * The fixture is a real diagram: Stand 1345 of Sebanga Poort (scenic 1), with roads on three sides.
 */
const V = [[2176708.74, -103493.46], [2176762.14, -103494.14], [2176771.37, -103467.09], [2176766.70, -103457.57], [2176725.75, -103443.60]]
const options = {
  parcels: {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { id: 'S', stand: '1345', designation: 'STAND 1345 OF SEBANGA POORT', area_m2: 2225 },
      geometry: { type: 'Polygon', coordinates: [[...V, V[0]]] },
    }],
  },
  beacons: { type: 'FeatureCollection', features: [] },
  metadata: {
    subjectParcelId: 'S', designation: 'STAND 1345 OF SEBANGA POORT', district: 'SELUKWE', centralMeridian: 29,
    diagramSgNo: '468/2026', fileNo: 'B/2917', srNo: '188/2026', compilation: 'QJ9454',
    sideAnnotations: [
      { side: 'DE', role: 'road', label: 'Garden Road' },
      { side: 'BC', role: 'road', label: 'Road', widthM: 15 },
      { side: 'CD', role: 'road', label: 'Road', widthM: 15 },
    ],
  },
  projection: 'EPSG:22289', scale: '1:750', sheetSize: 'A4', orientation: 'portrait',
}
const logger = { info() {}, warn() {}, error() {} }

/** The DXF's entities, with each POLYLINE's vertices gathered. */
function parseDxf(text) {
  const rows = text.split(/\r?\n/)
  const ents = []
  let sec = null, cur = null
  for (let i = 0; i + 1 < rows.length; i += 2) {
    const c = rows[i].trim(), v = rows[i + 1]
    if (c === '0') {
      if (v === 'SECTION') { sec = '?'; cur = null } else if (v === 'ENDSEC') { sec = null; cur = null }
      else if (sec === 'ENTITIES') { cur = { type: v, g: [] }; ents.push(cur) }
    } else if (c === '2' && sec === '?') sec = v
    else if (cur) cur.g.push([c, v])
  }
  const get = (e, c, d) => { const x = e.g.find((q) => q[0] === c); return x ? x[1] : d }
  const out = []
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i]
    if (e.type === 'POLYLINE') {
      const verts = []
      let j = i + 1
      while (j < ents.length && ents[j].type === 'VERTEX') { verts.push([+get(ents[j], '10'), +get(ents[j], '20')]); j++ }
      out.push({ type: 'POLYLINE', layer: get(e, '8'), width: +get(e, '40', 0), closed: (parseInt(get(e, '70', '0'), 10) & 1) === 1, verts, linetype: get(e, '6') })
      i = j
    } else if (e.type === 'TEXT') {
      const al = get(e, '72', '0')
      out.push({
        type: 'TEXT', layer: get(e, '8'), s: get(e, '1'), h: +get(e, '40'), rot: +get(e, '50', 0), factor: +get(e, '41'),
        al, x: +(al === '0' ? get(e, '10') : get(e, '11')), y: +(al === '0' ? get(e, '20') : get(e, '21')),
      })
    } else out.push({ type: e.type, layer: get(e, '8') })
  }
  return out
}

let pdf, dxf, dxfEnts, toG
beforeAll(async () => {
  pdf = await generateDiagramPDF({ ...options, recordOps: true }, logger)
  dxf = await generateDiagramDXF(options, logger)
  dxfEnts = parseDxf(dxf.dxfBuffer.toString('utf8'))
  const g = pdf.ground
  toG = (x, y) => [g.center.x + (x - g.figCenterPx) * g.perPt, g.center.y - (y - g.figCenterPy) * g.perPt]
}, 60000)

describe('the DXF replicates the diagram PDF', () => {
  test('both are the same diagram: same scale and sheet', () => {
    expect(dxf.scale).toBe(pdf.scale)
    expect(dxf.sheetSize).toBe(pdf.sheetSize)
  })

  test('every text the PDF prints is in the DXF, in the same place, size and direction', () => {
    const pdfTexts = pdf.ops.filter((o) => o.type === 'text' && o.text.trim())
    const dxfTexts = dxfEnts.filter((e) => e.type === 'TEXT')
    const taken = new Set()
    const problems = []
    for (const t of pdfTexts) {
      const r = t.rotation * Math.PI / 180
      const along = t.box.align === 'center' ? t.width / 2 : t.box.align === 'right' ? t.width : 0
      const [ax, ay] = toG(t.x + Math.cos(r) * along, t.y + Math.sin(r) * along)
      const want = t.text.replace(/°/g, '%%d')
      let best = -1, bd = Infinity
      dxfTexts.forEach((d, i) => {
        if (taken.has(i) || d.s !== want) return
        const dd = Math.hypot(d.x - ax, d.y - ay)
        if (dd < bd) { bd = dd; best = i }
      })
      if (best < 0) { problems.push(`missing: ${JSON.stringify(t.text)}`); continue }
      taken.add(best)
      const d = dxfTexts[best]
      if (bd > 0.001) problems.push(`${JSON.stringify(t.text)} is ${bd.toFixed(3)} m from where the PDF has it`)
      const wantH = t.size * CAP_HEIGHT * pdf.ground.perPt
      if (Math.abs(d.h - wantH) > 1e-3) problems.push(`${JSON.stringify(t.text)} height ${d.h} != ${wantH.toFixed(4)}`)
      const dRot = ((d.rot - (-t.rotation)) % 360 + 540) % 360 - 180
      if (Math.abs(dRot) > 0.01) problems.push(`${JSON.stringify(t.text)} turned ${dRot.toFixed(2)} deg off`)
    }
    expect(problems).toEqual([])
    // and the DXF carries nothing the PDF does not print
    expect(dxfTexts.length - taken.size).toBe(0)
  })

  test('a text runs as long in the DXF as in the PDF (the letters are widened to match Helvetica)', () => {
    const pdfTexts = pdf.ops.filter((o) => o.type === 'text' && o.text.trim())
    const dxfTexts = dxfEnts.filter((e) => e.type === 'TEXT')
    // written in the order the PDF drew them, so text i of one is text i of the other
    expect(dxfTexts).toHaveLength(pdfTexts.length)
    pdfTexts.forEach((t, i) => {
      const d = dxfTexts[i]
      expect(d.s).toBe(t.text.replace(/°/g, '%%d'))
      expect(t.text.length * d.h * d.factor).toBeCloseTo(t.width * pdf.ground.perPt, 2)
    })
  })

  test('every line the PDF strokes is drawn, with its line weight, on the same layer', () => {
    const strokes = pdf.ops.filter((o) => o.type === 'stroke')
    // (the paper's edge is the DXF's own addition: see the margins test)
    const polys = dxfEnts.filter((e) => e.type === 'POLYLINE' && e.layer !== 'SHEET_EDGE')
    expect(polys).toHaveLength(strokes.length)
    strokes.forEach((s, i) => {
      const p = polys[i] // same order: the DXF is written in the order the PDF drew
      expect(p.layer).toBe(s.layer)
      expect(p.verts).toHaveLength(s.pts.length)
      s.pts.forEach(([x, y], k) => {
        const [gx, gy] = toG(x, y)
        expect(p.verts[k][0]).toBeCloseTo(gx, 3)
        expect(p.verts[k][1]).toBeCloseTo(gy, 3)
      })
      expect(p.width).toBeCloseTo(s.width * pdf.ground.perPt, 3)
      expect(p.closed).toBe(!!s.closed)
    })
  })

  test('a dashed line in the PDF is dashed in the DXF', () => {
    const dashedPdf = pdf.ops.filter((o) => o.type === 'stroke' && o.dash).length
    const dashedDxf = dxfEnts.filter((e) => e.type === 'POLYLINE' && e.linetype).length
    expect(dashedDxf).toBe(dashedPdf)
  })

  test('the figure band, the road shading and the beacon knock-outs are filled, as in the PDF', () => {
    const solidLayers = (layer) => dxfEnts.filter((e) => e.type === 'SOLID' && e.layer === layer).length
    expect(solidLayers('FIGURE_BAND')).toBeGreaterThan(0)
    expect(solidLayers('DIAGRAM_ROAD')).toBeGreaterThan(0)
    // each beacon is a filled white disc (a fan of triangles) under its outline
    const beacons = pdf.ops.filter((o) => o.type === 'circle' && o.layer === 'BEACONS').length
    expect(beacons).toBe(5)
    expect(solidLayers('BEACONS')).toBeGreaterThanOrEqual(beacons * 3)
    expect(dxfEnts.filter((e) => e.type === 'CIRCLE' && e.layer === 'BEACONS')).toHaveLength(beacons)
  })

  test('the paper edge is drawn, and the neat line sits 35 / 15 / 15 / 15 mm inside it (left / top / right / bottom)', () => {
    const edge = dxfEnts.find((e) => e.type === 'POLYLINE' && e.layer === 'SHEET_EDGE')
    const border = dxfEnts.find((e) => e.type === 'POLYLINE' && e.layer === 'BORDER' && e.verts.length === 4)
    const mmOf = (m) => m / pdf.ground.perPt / (72 / 25.4)
    const ex = edge.verts.map((v) => v[0]), ey = edge.verts.map((v) => v[1])
    const bx = border.verts.map((v) => v[0]), by = border.verts.map((v) => v[1])
    expect(mmOf(Math.max(...ex) - Math.min(...ex))).toBeCloseTo(210, 1) // A4
    expect(mmOf(Math.max(...ey) - Math.min(...ey))).toBeCloseTo(297, 1)
    expect(mmOf(Math.min(...bx) - Math.min(...ex))).toBeCloseTo(35, 1)
    expect(mmOf(Math.max(...ex) - Math.max(...bx))).toBeCloseTo(15, 1)
    expect(mmOf(Math.max(...ey) - Math.max(...by))).toBeCloseTo(15, 1)
    expect(mmOf(Math.min(...by) - Math.min(...ey))).toBeCloseTo(15, 1)
  })

  test('the layers are the diagram\'s parts: each carries what the PDF drew there', () => {
    const pdfLayers = new Set(pdf.ops.map((o) => o.layer))
    const dxfLayers = new Set(dxfEnts.map((e) => e.layer))
    for (const l of ['BORDER', 'FIGURE', 'FIGURE_BAND', 'BEACONS', 'FIGURE_LABELS', 'DIAGRAM_ROAD', 'TABLE', 'BEACON_DESC',
      'NORTH_ARROW', 'APPROVED', 'SCALE_BAR', 'STATEMENT', 'GRID']) {
      expect(pdfLayers.has(l)).toBe(true)
      expect(dxfLayers.has(l)).toBe(true)
    }
    expect(pdfLayers.has('0')).toBe(false)   // nothing is drawn without naming what it is
  })
})
