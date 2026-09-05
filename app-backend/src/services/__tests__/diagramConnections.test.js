import { describe, test, expect } from '@jest/globals'
import { generateDiagramDXF } from '../diagramDxf.js'
import { generateDiagramPDF } from '../diagramPdf.js'

/**
 * Connecting data ties a new beacon to a parent beacon of the survey being
 * subdivided -- the tie the Surveyor-General requires. On the sheet it is a ray
 * from the beacon, an arrowhead pointing the way to the parent, the distance
 * lettered along it and a letter beyond the tip continuing the figure's
 * sequence. Modelled on the sample diagram S.G. 247/2021, whose figure A B C D
 * carries connections at B and C lettered E and F.
 */
const subject = {
  type: 'Feature',
  properties: { id: 'A', stand: '310', designation: 'STAND 310 BRACKENHURST', area_m2: 8097 },
  geometry: { type: 'Polygon', coordinates: [[
    [0, 0], [0, 60], [80, 60], [80, 0], [0, 0],
  ]] },
}
/** The ring above, as canonical [Y, X] vertices A..D, plus a parent well outside. */
const bcn = (name, y, x) => ({
  type: 'Feature', properties: { name },
  geometry: { type: 'Point', coordinates: [y, x] },
})
const beacons = {
  type: 'FeatureCollection',
  features: [
    bcn('62Bx', 0, 0), bcn('1B', 0, 60), bcn('1A', 80, 60), bcn('62Ax', 80, 0),
    bcn('PARENT', 400, 300),
  ],
}
const base = {
  parcels: { type: 'FeatureCollection', features: [subject] },
  beacons,
  metadata: { subjectParcelId: 'A', designation: 'STAND 310 BRACKENHURST', centralMeridian: 29 },
  projection: 'EPSG:22289', scale: 'auto', sheetSize: 'A4', orientation: 'portrait',
}
const withConn = (extra = {}) => ({
  ...base,
  metadata: {
    ...base.metadata,
    connections: [{ fromBeacon: '1B', toBeacon: 'PARENT', distanceM: 88.76 }],
    ...extra,
  },
})
const logger = { info() {}, warn() {}, error() {} }

/** Entities of one kind on one layer, as [x,y] pairs, from an R12 DXF. */
function entities(dxf, kind, layer) {
  const lines = dxf.split('\n').map((l) => l.trim())
  const out = []
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] !== '0' || lines[i + 1] !== kind) continue
    let j = i + 2; const d = {}
    while (j < lines.length - 1 && lines[j] !== '0') { (d[lines[j]] ||= []).push(lines[j + 1]); j += 2 }
    if ((d['8'] || [])[0] !== layer) continue
    out.push(d)
  }
  return out
}

describe('connecting data — DXF', () => {
  test('draws a filled arrowhead, which nothing else on the sheet uses', async () => {
    const before = (await generateDiagramDXF(base, logger)).dxfBuffer.toString('utf8')
    const after = (await generateDiagramDXF(withConn(), logger)).dxfBuffer.toString('utf8')
    expect(entities(before, 'SOLID', 'ADJOINING')).toHaveLength(0)
    expect(entities(after, 'SOLID', 'ADJOINING')).toHaveLength(1)
  })

  test('letters the distance in SI form, with the comma decimal', async () => {
    const dxf = (await generateDiagramDXF(withConn(), logger)).dxfBuffer.toString('utf8')
    const texts = entities(dxf, 'TEXT', 'ADJOINING').map((d) => (d['1'] || [''])[0])
    expect(texts).toContain('88,76m')
    expect(texts).not.toContain('88.76m')
  })

  test('letters the far end after the figure, not over it', async () => {
    const dxf = (await generateDiagramDXF(withConn(), logger)).dxfBuffer.toString('utf8')
    const texts = entities(dxf, 'TEXT', 'ADJOINING').map((d) => (d['1'] || [''])[0])
    expect(texts).toContain('E')          // A B C D are the figure's own
  })

  test('the arrowhead is a real triangle, not a degenerate sliver', async () => {
    const dxf = (await generateDiagramDXF(withConn(), logger)).dxfBuffer.toString('utf8')
    const [s] = entities(dxf, 'SOLID', 'ADJOINING')
    const p = [0, 1, 2, 3].map((k) => [+s[10 + k][0], +s[20 + k][0]])
    const area = Math.abs((p[1][0] - p[0][0]) * (p[2][1] - p[0][1])
      - (p[2][0] - p[0][0]) * (p[1][1] - p[0][1])) / 2
    expect(area).toBeGreaterThan(0)
    // a SOLID has four corners; a triangle repeats the last
    expect(p[3]).toEqual(p[2])
  })

  test('drops the abutment stub at a beacon that carries a connection', async () => {
    // Two marks on one beacon make two different claims a reader cannot tell
    // apart. Side AB abuts at B, which is also where the connection leaves.
    const ann = [{ side: 'AB', role: 'contiguous', label: 'REM.', end: 'to' }]
    const lines = async (metadata) => entities(
      (await generateDiagramDXF({ ...base, metadata }, logger)).dxfBuffer.toString('utf8'),
      'LINE', 'ADJOINING').length

    const stubOnly = await lines({ ...base.metadata, sideAnnotations: ann })
    const connOnly = await lines(withConn().metadata)
    const both = await lines(withConn({ sideAnnotations: ann }).metadata)

    expect(stubOnly).toBeGreaterThan(0)            // one stub, cut into dashes
    expect(connOnly).toBeGreaterThan(0)            // a dashed shaft, likewise
    // The whole rule in two lines: adding the stub's annotation alongside the
    // connection adds NOTHING, because the connection replaced it -- and that is
    // strictly fewer marks than drawing both would take.
    expect(both).toBe(connOnly)
    expect(both).toBeLessThan(stubOnly + connOnly)

    // and the neighbour is still named -- it stops being marked twice, not
    // stops being identified
    const t = (await generateDiagramDXF(
      { ...base, metadata: withConn({ sideAnnotations: ann }).metadata }, logger,
    )).dxfBuffer.toString('utf8')
    expect(entities(t, 'TEXT', 'ADJOINING').map((d) => (d['1'] || [''])[0])).toContain('REM.')
  })

  test('dashes the connection shaft, as the stub it replaces was dashed', async () => {
    // A connection takes the place of the abutment stub at a beacon carrying
    // both, so it wears that mark's appearance rather than introducing a third.
    const dxf = (await generateDiagramDXF(withConn(), logger)).dxfBuffer.toString('utf8')
    const segs = entities(dxf, 'LINE', 'ADJOINING')
    expect(segs.length).toBeGreaterThanOrEqual(3)   // PLANDASH gives the shaft three
    // every piece is a fragment, not a full-length shaft
    const lens = segs.map((d) => Math.hypot(+d['11'][0] - +d['10'][0], +d['21'][0] - +d['20'][0]))
    const total = lens.reduce((a, b) => a + b, 0)
    expect(Math.max(...lens)).toBeLessThan(total)
  })

  test('draws nothing when the parent beacon is not in the coordinate list', async () => {
    const dxf = (await generateDiagramDXF({
      ...base,
      metadata: { ...base.metadata, connections: [{ fromBeacon: '1B', toBeacon: 'GHOST', distanceM: 5 }] },
    }, logger)).dxfBuffer.toString('utf8')
    expect(entities(dxf, 'SOLID', 'ADJOINING')).toHaveLength(0)
  })
})

describe('connecting data — which side the distance sits on', () => {
  /** The remainder placed on one flank or the other of the same connection. */
  const withRemainder = (ring) => ({
    ...base,
    parcels: { type: 'FeatureCollection', features: [subject, {
      type: 'Feature',
      properties: { id: 'R', stand: 'REM', designation: 'REM', area_m2: 9000 },
      geometry: { type: 'Polygon', coordinates: [ring] },
    }] },
    metadata: { ...base.metadata, connections: [
      { fromBeacon: '1B', toBeacon: 'PARENT', distanceM: 88.76 }] },
  })
  // The subject is [0,0]-[0,60]-[80,60]-[80,0]; the connection leaves 1B at
  // [0,60] toward [400,300]. These two remainders lie on opposite flanks of it.
  const near = [[-60, 0], [-60, 120], [0, 120], [0, 0], [-60, 0]]
  const far = [[80, 0], [80, -80], [200, -80], [200, 0], [80, 0]]

  const distanceAt = async (opts) => {
    const dxf = (await generateDiagramDXF(opts, logger)).dxfBuffer.toString('utf8')
    const d = entities(dxf, 'TEXT', 'ADJOINING')
      .find((e) => /^\d+,\d+m$/.test((e['1'] || [''])[0]))
    return d ? [+d['10'][0], +d['20'][0]] : null
  }

  test('follows the remaining extent from one side of the line to the other', async () => {
    // The distance is measured across the remainder, so that is the side of the
    // line it belongs on -- not a fixed side of the shaft.
    const a = await distanceAt(withRemainder(near))
    const b = await distanceAt(withRemainder(far))
    expect(a).not.toBeNull()
    expect(b).not.toBeNull()
    // Moving the remainder across the line moves the label across it too.
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(0.5)
  })

  test('starts the text clear of the corner it springs from', async () => {
    // A connection leaves a beacon where two boundaries meet under a beacon
    // circle. Centred on the shaft, the text ran back over all three.
    const dxf = (await generateDiagramDXF(withConn(), logger)).dxfBuffer.toString('utf8')
    const dist = entities(dxf, 'TEXT', 'ADJOINING')
      .find((d) => /^\d+,\d+m$/.test((d['1'] || [''])[0]))
    expect(dist).toBeDefined()

    // The beacon the ray leaves is the vertex nearest the shaft's tail; the
    // dashes give the shaft, and the tail is the dash furthest from the tip.
    const [tri] = entities(dxf, 'SOLID', 'ADJOINING')
    const tip = [+tri['10'][0], +tri['20'][0]]
    const starts = entities(dxf, 'LINE', 'ADJOINING').map((d) => [+d['10'][0], +d['20'][0]])
    const tail = starts.reduce((a, b) =>
      Math.hypot(b[0] - tip[0], b[1] - tip[1]) > Math.hypot(a[0] - tip[0], a[1] - tip[1]) ? b : a)

    // The text's insertion point is its baseline start; whichever way it had to
    // be flipped to read upright, no part of it may sit on the beacon.
    const h = +dist['40'][0]
    const w = 0.6 * h * ((dist['1'] || [''])[0].length)
    const rot = ((+((dist['50'] || [0])[0])) * Math.PI) / 180
    const ins = [+dist['10'][0], +dist['20'][0]]
    const far = [ins[0] + Math.cos(rot) * w, ins[1] + Math.sin(rot) * w]
    const nearest = Math.min(
      Math.hypot(ins[0] - tail[0], ins[1] - tail[1]),
      Math.hypot(far[0] - tail[0], far[1] - tail[1]))
    // Two clearances, both measured in text-heights so the check is scale-free.
    // ALONG the ray, the text starts beyond the beacon rather than on it.
    expect(nearest).toBeGreaterThan(h)

    // ACROSS the ray matters more: a boundary leaving the same corner runs
    // close to the connecting line for its first few millimetres, so holding
    // the label off the line clears it far more cheaply than pushing the label
    // further out would. This is the standoff that used to be a bare 1.5 pt.
    const tip2 = [tip[0] - tail[0], tip[1] - tail[1]]
    const tl = Math.hypot(tip2[0], tip2[1])
    const offRay = Math.abs(tip2[0] * (ins[1] - tail[1]) - tip2[1] * (ins[0] - tail[0])) / tl
    expect(offRay).toBeGreaterThan(h * 0.4)
  })

  test('still letters the distance when the sheet has no remainder', async () => {
    const dxf = (await generateDiagramDXF(withConn(), logger)).dxfBuffer.toString('utf8')
    expect(entities(dxf, 'TEXT', 'ADJOINING').map((d) => (d['1'] || [''])[0]))
      .toContain('88,76m')
  })
})

describe('connecting data — PDF', () => {
  test('renders, and grows the sheet by the mark it added', async () => {
    const before = await generateDiagramPDF(base, logger)
    const after = await generateDiagramPDF(withConn(), logger)
    expect(Buffer.isBuffer(after.pdfBuffer)).toBe(true)
    expect(after.pdfBuffer.length).toBeGreaterThan(before.pdfBuffer.length)
  })

  test('survives a parent beacon coincident with its own connection point', async () => {
    // No direction to point: the mark is dropped rather than aimed arbitrarily.
    const r = await generateDiagramPDF({
      ...base,
      beacons: { ...beacons, features: [...beacons.features, bcn('SAME', 0, 60)] },
      metadata: { ...base.metadata, connections: [{ fromBeacon: '1B', toBeacon: 'SAME', distanceM: 0 }] },
    }, logger)
    expect(Buffer.isBuffer(r.pdfBuffer)).toBe(true)
  })
})
