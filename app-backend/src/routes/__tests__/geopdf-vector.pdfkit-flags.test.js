import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import Fastify from 'fastify'

// ── Mock all heavy dependencies so the test only validates route behaviour ──
const mockGenerateGeoPDF = jest.fn(async () => ({
  pdfBuffer: Buffer.from('PDF'),
  suggestedScale: null,
  scale: '1:2000',
  sheetSize: 'SI727_500x400',
  orientation: 'landscape',
  tileGrid: null,
  warnings: {}
}))
const mockGenerateSheetedGeoPDF = jest.fn(async () => ({
  pdf: Buffer.from('SHEETED-PDF'),
  pageCount: 3
}))
const mockGenerateDiagramPDF = jest.fn(async () => ({
  pdfBuffer: Buffer.from('DIAGRAM-PDF'),
  scale: '1:500',
  sheetSize: 'A4'
}))
const mockComputeAreaConsistency = jest.fn(() => ({
  edges: [],
  area: { abs_m2: 0, hectares_rounded: 0, display: '0 m²' },
  centroid: { y: 0, x: 0 },
  residuals: { closureError: 0, closureErrorFormatted: '0 m' },
  closure: { ratio: 0, ratioFormatted: '0', perimeter: 0 }
}))

jest.unstable_mockModule('../../services/pdfkitGeoPDF.js', () => ({
  generateGeoPDF: mockGenerateGeoPDF,
  generateSheetedGeoPDF: mockGenerateSheetedGeoPDF
}))
jest.unstable_mockModule('../../services/diagramPdf.js', () => ({
  generateDiagramPDF: mockGenerateDiagramPDF
}))
// Both auth hooks are no-ops so the preHandler passes through: this suite tests
// PDF flags, not authorization. `requireSchema` has to be present even though it
// is unused here -- the route module imports both names, and ESM linking fails
// hard on a missing named export.
jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({
  authenticateWithSchema: async () => {},
  requireSchema: async () => {}
}))
jest.unstable_mockModule('../../utils/area-computation.js', () => ({
  computeAreaConsistency: mockComputeAreaConsistency
}))
jest.unstable_mockModule('../../utils/capeLoSRID.js', () => ({
  getCapeLoSRID: () => 22291
}))
jest.unstable_mockModule('../../models/landParcel.js', () => ({
  default: {
    findOutsideFigure: async () => null,
    findByStand: async () => null,
    update: async () => {}
  }
}))

const { default: geopdfVectorRoutes } = await import('../geopdf-vector.js')

function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async () => {})
  app.addHook('preHandler', async (request) => { request.body = request.body ?? {} })
  app.register(geopdfVectorRoutes)
  return app
}

const basePayload = {
  parcels: { type: 'FeatureCollection', features: [] },
  beacons: { type: 'FeatureCollection', features: [] },
  projection: 'EPSG:22291',
  renderEngine: 'pdfkit'
}

describe('/api/geopdf/vector trueGeoPDF flag forwarding', () => {
  beforeEach(() => {
    mockGenerateGeoPDF.mockClear()
    mockGenerateSheetedGeoPDF.mockClear()
    mockGenerateDiagramPDF.mockClear()
    mockComputeAreaConsistency.mockClear()
  })

  test('diagram planType routes to generateDiagramPDF (flags irrelevant)', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/vector',
      payload: { ...basePayload, planType: 'diagram', trueGeoPDF: true }
    })
    expect(res.statusCode).toBe(200)
    expect(mockGenerateDiagramPDF).toHaveBeenCalledTimes(1)
    expect(mockGenerateGeoPDF).not.toHaveBeenCalled()
  })

  test('pdfkit path forwards trueGeoPDF + interactive + enableLayers + enableMeasurements to generateGeoPDF', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/vector',
      payload: {
        ...basePayload,
        planType: 'general-undeveloped',
        trueGeoPDF: true,
        interactive: true,
        enableLayers: true,
        enableMeasurements: true
      }
    })
    expect(mockGenerateGeoPDF).toHaveBeenCalledTimes(1)
    const passedOptions = mockGenerateGeoPDF.mock.calls[0][0]
    expect(passedOptions.trueGeoPDF).toBe(true)
    expect(passedOptions.interactive).toBe(true)
    expect(passedOptions.enableLayers).toBe(true)
    expect(passedOptions.enableMeasurements).toBe(true)
  })

  test('pdfkit path defaults to false when flags are omitted', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/vector',
      payload: { ...basePayload }  // no trueGeoPDF/interactive flags
    })
    expect(mockGenerateGeoPDF).toHaveBeenCalledTimes(1)
    const passedOptions = mockGenerateGeoPDF.mock.calls[0][0]
    expect(passedOptions.trueGeoPDF).toBe(false)
    expect(passedOptions.interactive).toBe(false)
    expect(passedOptions.enableLayers).toBe(false)
    expect(passedOptions.enableMeasurements).toBe(false)
  })

  test('single-plan path is used when tileGrid is null', async () => {
    const app = buildApp()
    await app.inject({ method: 'POST', url: '/vector', payload: basePayload })
    expect(mockGenerateGeoPDF).toHaveBeenCalledTimes(1)
    expect(mockGenerateSheetedGeoPDF).not.toHaveBeenCalled()
  })

  // ── Task 6: tileGrid present means multi-sheet-required. The only path to
  // several sheets is the surveyor's own cut payloads; there is no grid to
  // fall back to. ──

  test('tileGrid present with sheets renders the cut-based sheeted PDF', async () => {
    mockGenerateGeoPDF.mockReturnValueOnce(Promise.resolve({ ...mockGenerateGeoPDF(), tileGrid: { totalSheets: 2 } }))
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/vector',
      payload: {
        ...basePayload,
        sheets: [{ sheetNumber: 1, totalSheets: 2, ring: [], stands: ['1'], vertices: [], edges: [] }],
      }
    })
    expect(res.statusCode).toBe(200)
    expect(mockGenerateSheetedGeoPDF).toHaveBeenCalledTimes(1)
    expect(res.rawPayload.toString()).toBe('SHEETED-PDF')
    expect(res.headers['x-sheet-count']).toBe('1')
    expect(res.headers['content-disposition']).toContain('general-plan-multisheet')
    expect(res.headers['x-tile-grid']).toBeUndefined()
  })

  test('tileGrid present with NO cuts refuses, and says the cuts are a survey judgement', async () => {
    mockGenerateGeoPDF.mockReturnValueOnce(Promise.resolve({ ...mockGenerateGeoPDF(), tileGrid: { totalSheets: 2 } }))
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/vector', payload: { ...basePayload } })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.rawPayload.toString())
    expect(body.error).toBe('cuts-required')
    expect(body.message).toMatch(/draw the cut lines/i)
    expect(mockGenerateSheetedGeoPDF).not.toHaveBeenCalled()
  })

  test('cuts present but payloads absent refuses rather than guessing at sheets', async () => {
    mockGenerateGeoPDF.mockReturnValueOnce(Promise.resolve({ ...mockGenerateGeoPDF(), tileGrid: { totalSheets: 2 } }))
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/vector',
      payload: { ...basePayload, cuts: [{ y: 50, x: 0 }, { y: 50, x: 100 }] }
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.rawPayload.toString()).error).toBe('sheets-required')
  })

  // ── A cut that actually divided the figure IS the multi-sheet signal. ──
  //
  // These used to be reachable only by forcing `tileGrid`, but tiling was
  // retired: planSheeting.js now always returns a best-effort single-sheet
  // candidate, so `needsTiling` is permanently false and `tileGrid` is
  // permanently null. A gate that can never open meant a surveyor's cut was
  // stored, carried all the way to this route, and then dropped. What a
  // surveyor drew is the evidence — not whether the figure overflows.

  test('a cut that divided the figure into 2 sheets renders the sheeted PDF with no tileGrid', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/vector',
      payload: {
        ...basePayload,
        planType: 'general-undeveloped',
        sheets: [
          { sheetNumber: 1, totalSheets: 2, ring: [], stands: ['1'], vertices: [], edges: [] },
          { sheetNumber: 2, totalSheets: 2, ring: [], stands: ['2'], vertices: [], edges: [] }
        ]
      }
    })
    expect(res.statusCode).toBe(200)
    expect(mockGenerateSheetedGeoPDF).toHaveBeenCalledTimes(1)
    expect(mockGenerateSheetedGeoPDF.mock.calls[0][0].sheets).toHaveLength(2)
    expect(res.rawPayload.toString()).toBe('SHEETED-PDF')
    expect(res.headers['x-sheet-count']).toBe('2')
    expect(res.headers['content-disposition']).toContain('general-plan-multisheet')
  })

  test('ONE sheet is not a split: it keeps the mature single-plan path', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/vector',
      payload: {
        ...basePayload,
        planType: 'general-undeveloped',
        sheets: [{ sheetNumber: 1, totalSheets: 1, ring: [], stands: ['1'], vertices: [], edges: [] }]
      }
    })
    expect(res.statusCode).toBe(200)
    expect(mockGenerateSheetedGeoPDF).not.toHaveBeenCalled()
    expect(mockGenerateGeoPDF).toHaveBeenCalledTimes(1)
    expect(res.rawPayload.toString()).toBe('PDF')
  })

  test('a no-cut plan is untouched: single-plan path, no sheet count header', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/vector',
      payload: { ...basePayload, planType: 'general-undeveloped' }
    })
    expect(res.statusCode).toBe(200)
    expect(mockGenerateSheetedGeoPDF).not.toHaveBeenCalled()
    expect(res.headers['x-sheet-count']).toBeUndefined()
  })
})
