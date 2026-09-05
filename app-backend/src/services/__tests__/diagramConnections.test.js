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
    const withStub = (await generateDiagramDXF(
      { ...base, metadata: { ...base.metadata, sideAnnotations: ann } }, logger,
    )).dxfBuffer.toString('utf8')
    const both = (await generateDiagramDXF(withConn({ sideAnnotations: ann }), logger))
      .dxfBuffer.toString('utf8')

    const stubs = (t) => entities(t, 'LINE', 'ADJOINING').length
    expect(stubs(withStub)).toBeGreaterThan(0)
    // the connection contributes its own shaft, so the stub's disappearance is
    // measured as "no more lines than the connection itself draws"
    expect(stubs(both)).toBe(1)
    // and the neighbour is still named -- it stops being marked twice, not
    // stops being identified
    expect(entities(both, 'TEXT', 'ADJOINING').map((d) => (d['1'] || [''])[0])).toContain('REM.')
  })

  test('draws nothing when the parent beacon is not in the coordinate list', async () => {
    const dxf = (await generateDiagramDXF({
      ...base,
      metadata: { ...base.metadata, connections: [{ fromBeacon: '1B', toBeacon: 'GHOST', distanceM: 5 }] },
    }, logger)).dxfBuffer.toString('utf8')
    expect(entities(dxf, 'SOLID', 'ADJOINING')).toHaveLength(0)
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
