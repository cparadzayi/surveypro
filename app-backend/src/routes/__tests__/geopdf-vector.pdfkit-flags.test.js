import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import Fastify from 'fastify'

// ── Mock all heavy dependencies so the test only validates flag forwarding ──
const mockGenerateGeoPDF = jest.fn(async () => ({
  pdfBuffer: Buffer.from('PDF'),
  suggestedScale: null,
  scale: '1:2000',
  sheetSize: 'SI727_500x400',
  orientation: 'landscape',
  tileGrid: null,
  warnings: {}
}))
const mockGenerateTiledGeoPDF = jest.fn(async () => ({
  pdfBuffer: Buffer.from('TILED-PDF'),
  totalSheets: 2,
  scaleLabel: '1:500',
  tileGridInfo: {}
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
  generateTiledGeoPDF: mockGenerateTiledGeoPDF
}))
jest.unstable_mockModule('../../services/diagramPdf.js', () => ({
  generateDiagramPDF: mockGenerateDiagramPDF
}))
jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({
  authenticateWithSchema: async () => {}
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
    mockGenerateTiledGeoPDF.mockClear()
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

  test('non-tiled path is used when tileGrid is null', async () => {
    const app = buildApp()
    await app.inject({ method: 'POST', url: '/vector', payload: basePayload })
    expect(mockGenerateGeoPDF).toHaveBeenCalledTimes(1)
    expect(mockGenerateTiledGeoPDF).not.toHaveBeenCalled()
  })
})
