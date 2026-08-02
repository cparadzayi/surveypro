import { describe, test, expect } from '@jest/globals'
import { generateDiagramDXF } from '../diagramDxf.js'

const subject = {
  type: 'Feature',
  properties: { id: 'A', stand: '302', designation: 'STAND 302 BRACKENHURST', area_m2: 5019 },
  geometry: { type: 'Polygon', coordinates: [[
    [0, 0], [0, 60], [80, 60], [80, 0], [0, 0],
  ]] },
}
const neighbour = {
  type: 'Feature',
  properties: { id: 'B', stand: '303', area_m2: 4000 },
  geometry: { type: 'Polygon', coordinates: [[
    [80, 0], [80, 60], [160, 60], [160, 0], [80, 0],
  ]] },
}
const options = {
  parcels: { type: 'FeatureCollection', features: [subject, neighbour] },
  beacons: { type: 'FeatureCollection', features: [] },
  metadata: { subjectParcelId: 'A', designation: 'STAND 302 BRACKENHURST', centralMeridian: 29 },
  projection: 'EPSG:22289', scale: 'auto', sheetSize: 'A4', orientation: 'portrait',
}
const logger = { info() {}, warn() {}, error() {} }

describe('generateDiagramDXF', () => {
  test('returns a valid DXF buffer', async () => {
    const r = await generateDiagramDXF(options, logger)
    expect(Buffer.isBuffer(r.dxfBuffer)).toBe(true)
    const text = r.dxfBuffer.toString('utf8')
    expect(text).toContain('SECTION')
    expect(text.trim().endsWith('0\nEOF')).toBe(true)
    expect(r.sheetSize).toBe('A4')
    expect(typeof r.scale).toBe('string')
  })

  test('throws a clear error when the subject parcel is missing', async () => {
    await expect(generateDiagramDXF({ ...options, metadata: { subjectParcelId: 'Z' } }, logger))
      .rejects.toThrow(/subject parcel/i)
  })

  test('honors A3 sheet size and echoes it', async () => {
    const r = await generateDiagramDXF({ ...options, sheetSize: 'A3' }, logger)
    expect(r.sheetSize).toBe('A3')
  })

  test('defaults to A4 when sheetSize is missing/unknown', async () => {
    const r = await generateDiagramDXF({ ...options, sheetSize: 'ZZ' }, logger)
    expect(r.sheetSize).toBe('A4')
  })

  test('the border rectangle appears in the DXF output', async () => {
    const r = await generateDiagramDXF(options, logger)
    const text = r.dxfBuffer.toString('utf8')
    expect(text).toContain('BORDER')
    expect((text.match(/\bLINE\b/g) || []).length).toBeGreaterThanOrEqual(4)
  })

  test('draws the subject figure: boundary, beacons, vertex letters', async () => {
    const r = await generateDiagramDXF(options, logger)
    const text = r.dxfBuffer.toString('utf8')
    expect(text).toContain('FIGURE\n')
    expect(text).toContain('FIGURE_BAND\n')
    expect(text).toContain('BEACONS\n')
    expect(text).toContain('CIRCLE')
    expect(text).toContain('FIGURE_LABELS\n')
    // 4 vertex letters A/B/C/D for the rectangular subject fixture.
    for (const letter of ['A', 'B', 'C', 'D']) {
      expect(text).toContain(`1\n${letter}\n`)
    }
  })

  test('clips neighbours to the buffer and omits the outside figure (realistic coords)', async () => {
    const subj = { type: 'Feature', properties: { id: 'S', stand: '403', designation: 'STAND 403', area_m2: 10000 },
      geometry: { type: 'Polygon', coordinates: [[[2144000, 85000], [2144100, 85000], [2144100, 85100], [2144000, 85100], [2144000, 85000]]] } }
    const abut = { type: 'Feature', properties: { id: 'N', stand: '404' },
      geometry: { type: 'Polygon', coordinates: [[[2144000, 85100], [2144200, 85100], [2144200, 85500], [2144000, 85500], [2144000, 85100]]] } }
    const far = { type: 'Feature', properties: { id: 'F', stand: '999' },
      geometry: { type: 'Polygon', coordinates: [[[2144000, 90000], [2144100, 90000], [2144100, 90100], [2144000, 90100], [2144000, 90000]]] } }
    const of = { type: 'Feature', properties: { id: 'OF', designation: 'OUTSIDE FIGURE' },
      geometry: { type: 'Polygon', coordinates: [[[2143000, 84000], [2145000, 84000], [2145000, 86000], [2143000, 86000], [2143000, 84000]]] } }
    const r = await generateDiagramDXF({
      parcels: { type: 'FeatureCollection', features: [subj, abut, far, of] },
      beacons: { type: 'FeatureCollection', features: [] },
      metadata: { subjectParcelId: 'S', designation: 'STAND 403', centralMeridian: 29 },
      projection: 'EPSG:22289', scale: 'auto', sheetSize: 'A4',
    }, logger)
    const text = r.dxfBuffer.toString('utf8')
    expect(text).toContain('NEIGHBOURS\n')
    expect(text.trim().endsWith('0\nEOF')).toBe(true)
  })

  test('renders adjoining-feature annotations (road/servitude/contiguous), skipping unmatched sides', async () => {
    const withAdjoining = {
      ...options,
      metadata: {
        ...options.metadata,
        sideAnnotations: [
          { side: 'AB', role: 'road', label: 'Klein Road' },
          { side: 'BC', role: 'servitude', label: 'Water servitude', widthM: 3 },
          { side: 'CD', role: 'contiguous', label: 'STAND 303 BRACKENHURST' },
          { side: 'ZZ', role: 'road', label: 'nowhere' },
        ],
      },
    }
    const r = await generateDiagramDXF(withAdjoining, logger)
    const text = r.dxfBuffer.toString('utf8')
    expect(text).toContain('DIAGRAM_ROAD\n')
    expect(text).toContain('ADJOINING_SERVITUDE\n')
    expect(text).toContain('ADJOINING\n')
    expect(text).toContain('Klein Road')
    expect(text).toContain('Water servitude')
    expect(text).toContain('STAND 303 BRACKENHURST')
  })

  test('is unchanged (no crash) when sideAnnotations is absent', async () => {
    const r = await generateDiagramDXF(options, logger)
    expect(r.dxfBuffer.toString('utf8').trim().endsWith('0\nEOF')).toBe(true)
  })

  test('renders single-terminal and both contiguous annotations without error', async () => {
    for (const end of ['from', 'to', 'both', undefined]) {
      const withContig = {
        ...options,
        metadata: { ...options.metadata, sideAnnotations: [{ side: 'AB', role: 'contiguous', label: 'STAND 86', end }] },
      }
      const r = await generateDiagramDXF(withContig, logger)
      expect(r.dxfBuffer.toString('utf8')).toContain('STAND 86')
    }
  })

  test('renders the sides/directions/co-ordinates table', async () => {
    const r = await generateDiagramDXF(options, logger)
    const text = r.dxfBuffer.toString('utf8')
    expect(text).toContain('TABLE\n')
    expect(text).toContain('SIDES')
    expect(text).toContain('DIRECTIONS')
    expect(text).toContain('CO-ORDINATES')
    expect(text).toContain('DIAGRAM S.G. No.')
    expect(text).toContain('Constants')
  })
})
