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
})
