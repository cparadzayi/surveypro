import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import Fastify from 'fastify'

// The renderer's warnings must reach the client in X-Plan-Warnings, in plain sentences.
// Everything heavy is mocked: this suite is about what the route says, not how it draws.
const mockGenerateGeoPDF = jest.fn()
const mockGenerateSheetedGeoPDF = jest.fn()

jest.unstable_mockModule('../../services/pdfkitGeoPDF.js', () => ({
  generateGeoPDF: mockGenerateGeoPDF,
  generateSheetedGeoPDF: mockGenerateSheetedGeoPDF
}))
jest.unstable_mockModule('../../services/diagramPdf.js', () => ({
  generateDiagramPDF: jest.fn(async () => ({ pdfBuffer: Buffer.from('D'), scale: '1:500', sheetSize: 'A4' }))
}))
jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({
  authenticateWithSchema: async () => {},
  requireSchema: async () => {}
}))
jest.unstable_mockModule('../../utils/area-computation.js', () => ({
  computeAreaConsistency: jest.fn(() => ({
    edges: [], area: { abs_m2: 0, hectares_rounded: 0, display: '0 m²' }, centroid: { y: 0, x: 0 },
    residuals: { closureError: 0, closureErrorFormatted: '0 m' }, closure: { ratio: 0, ratioFormatted: '0', perimeter: 0 }
  }))
}))
jest.unstable_mockModule('../../utils/capeLoSRID.js', () => ({ getCapeLoSRID: () => 22291 }))
jest.unstable_mockModule('../../models/landParcel.js', () => ({
  default: { findOutsideFigure: async () => null, findByStand: async () => null, update: async () => {} }
}))

const { default: geopdfVectorRoutes } = await import('../geopdf-vector.js')

function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async () => {})
  app.addHook('preHandler', async (request) => { request.body = request.body ?? {} })
  app.register(geopdfVectorRoutes)
  return app
}

const payload = {
  parcels: { type: 'FeatureCollection', features: [] },
  beacons: { type: 'FeatureCollection', features: [] },
  projection: 'EPSG:22291',
  renderEngine: 'pdfkit',
  planType: 'general-undeveloped'
}

const render = (warnings) => ({
  pdfBuffer: Buffer.from('PDF'), suggestedScale: null, scale: '1:600', sheetSize: 'SI727_1000x800',
  orientation: 'landscape', tileGrid: null, warnings
})

describe('X-Plan-Warnings', () => {
  beforeEach(() => { mockGenerateGeoPDF.mockReset(); mockGenerateSheetedGeoPDF.mockReset() })

  test('a single-sheet plan carries the renderer\'s warnings as plain sentences', async () => {
    mockGenerateGeoPDF.mockResolvedValue(render({
      scheduleEscalationExhausted: { atSheetSize: 'SI727_1000x800', attempts: 0, hint: 'Plan too dense for largest available paper size; some blocks may overlap the figure.' },
      tickMarksOverlapBlocks: { count: 3, hits: [], hint: 'Coordinate tick marks drawn over a plan block.' }
    }))
    const res = await buildApp().inject({ method: 'POST', url: '/vector', payload })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.headers['x-plan-warnings'])).toEqual([
      'Plan too dense for largest available paper size; some blocks may overlap the figure.',
      'Coordinate tick marks drawn over a plan block. (3 places)'
    ])
  })

  test('a request that does not name a render engine uses PDFKit, not the legacy ogr2ogr path', async () => {
    // The ogr2ogr path breaks on GDAL 3.13 (QGIS 4) and the app never asks for it.
    mockGenerateGeoPDF.mockResolvedValue(render({}))
    const { renderEngine, ...withoutEngine } = payload
    const res = await buildApp().inject({ method: 'POST', url: '/vector', payload: withoutEngine })
    expect(res.statusCode).toBe(200)
    expect(mockGenerateGeoPDF).toHaveBeenCalledTimes(1)
  })

  test('sends no header when there is nothing to warn about', async () => {
    mockGenerateGeoPDF.mockResolvedValue(render({}))
    const res = await buildApp().inject({ method: 'POST', url: '/vector', payload })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-plan-warnings']).toBeUndefined()
  })

  test('a multi-sheet plan names the sheet each warning came from', async () => {
    mockGenerateGeoPDF.mockResolvedValue(render({}))
    mockGenerateSheetedGeoPDF.mockResolvedValue({
      pdf: Buffer.from('SHEETED'), pageCount: 3,
      layouts: [{ sheetNumber: 1, scale: '1:600', sheetSize: 'SI727_1000x800' }, { sheetNumber: 2, scale: '1:600', sheetSize: 'SI727_1000x800' }],
      warnings: ['Sheet 2: Plan too dense for largest available paper size; some blocks may overlap the figure.']
    })
    const res = await buildApp().inject({
      method: 'POST', url: '/vector',
      payload: {
        ...payload,
        sheets: [
          { sheetNumber: 1, totalSheets: 2, ring: [], stands: ['1'], vertices: [], edges: [] },
          { sheetNumber: 2, totalSheets: 2, ring: [], stands: ['2'], vertices: [], edges: [] }
        ]
      }
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.headers['x-plan-warnings'])).toEqual([
      'Sheet 2: Plan too dense for largest available paper size; some blocks may overlap the figure.'
    ])
  })

  test('a multi-sheet render with no warnings sends no header', async () => {
    mockGenerateGeoPDF.mockResolvedValue(render({}))
    mockGenerateSheetedGeoPDF.mockResolvedValue({ pdf: Buffer.from('S'), pageCount: 3, layouts: [], warnings: [] })
    const res = await buildApp().inject({
      method: 'POST', url: '/vector',
      payload: {
        ...payload,
        sheets: [
          { sheetNumber: 1, totalSheets: 2, ring: [], stands: ['1'], vertices: [], edges: [] },
          { sheetNumber: 2, totalSheets: 2, ring: [], stands: ['2'], vertices: [], edges: [] }
        ]
      }
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-plan-warnings']).toBeUndefined()
  })
})
