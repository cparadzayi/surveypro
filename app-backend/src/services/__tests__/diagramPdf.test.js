import { describe, test, expect } from '@jest/globals'
import { generateDiagramPDF } from '../diagramPdf.js'

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

describe('generateDiagramPDF', () => {
  test('returns a valid PDF buffer', async () => {
    const r = await generateDiagramPDF(options, logger)
    expect(Buffer.isBuffer(r.pdfBuffer)).toBe(true)
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
    expect(r.sheetSize).toBe('A4')
    expect(typeof r.scale).toBe('string')
  })

  test('throws a clear error when the subject parcel is missing', async () => {
    await expect(generateDiagramPDF({ ...options, metadata: { subjectParcelId: 'Z' } }, logger))
      .rejects.toThrow(/subject parcel/i)
  })

  test('renders with beacons + Lo system without error and stays a valid PDF', async () => {
    const withBeacons = {
      ...options,
      beacons: { type: 'FeatureCollection', features: [
        { type: 'Feature', properties: { name: '302A', description: '12mm iron peg' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      ] },
    }
    const r = await generateDiagramPDF(withBeacons, logger)
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
    expect(r.pdfBuffer.length).toBeGreaterThan(1000)
  })
})
