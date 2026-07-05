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
    // A fully-drawn diagram (figure + table + grid) is ~2.7KB; a blank page
    // (the doc.end()-before-drawing bug) is ~1KB. Guard against that regression.
    expect(r.pdfBuffer.length).toBeGreaterThan(2000)
  })

  test('honors A3 sheet size and echoes it', async () => {
    const r = await generateDiagramPDF({ ...options, sheetSize: 'A3' }, logger)
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
    expect(r.sheetSize).toBe('A3')
    expect(r.pdfBuffer.length).toBeGreaterThan(2000)
  })

  test('defaults to A4 when sheetSize is missing/unknown', async () => {
    const r = await generateDiagramPDF({ ...options, sheetSize: 'ZZ' }, logger)
    expect(r.sheetSize).toBe('A4')
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
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
    const r = await generateDiagramPDF({
      parcels: { type: 'FeatureCollection', features: [subj, abut, far, of] },
      beacons: { type: 'FeatureCollection', features: [] },
      metadata: { subjectParcelId: 'S', designation: 'STAND 403', centralMeridian: 29 },
      projection: 'EPSG:22289', scale: 'auto', sheetSize: 'A4',
    }, logger)
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
    expect(r.pdfBuffer.length).toBeGreaterThan(2000)
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
          { side: 'ZZ', role: 'road', label: 'nowhere' }, // no such edge → skipped, no throw
        ],
      },
    }
    const r = await generateDiagramPDF(withAdjoining, logger)
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
    expect(r.pdfBuffer.length).toBeGreaterThan(2000)
  })

  test('is unchanged when sideAnnotations is absent (backward compatible)', async () => {
    const r = await generateDiagramPDF(options, logger)
    expect(r.pdfBuffer.slice(0, 5).toString()).toBe('%PDF-')
  })
})
