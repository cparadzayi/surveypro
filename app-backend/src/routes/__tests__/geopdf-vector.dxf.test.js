import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import Fastify from 'fastify'

// Mock BOTH generators so the route test never touches real geometry/DB logic —
// it only proves the planType branch calls the right one and returns its buffer.
const mockGenerateDiagramDXF = jest.fn(async () => ({ dxfBuffer: Buffer.from('DIAGRAM-DXF'), scale: '1:500', sheetSize: 'A4' }))
const mockGenerateDXF = jest.fn(() => ({ buffer: Buffer.from('GENERAL-PLAN-DXF'), warnings: { count: 0, summary: {} } }))

jest.unstable_mockModule('../../services/diagramDxf.js', () => ({ generateDiagramDXF: mockGenerateDiagramDXF }))
jest.unstable_mockModule('../../services/dxfGenerator.js', () => ({ generateDXF: mockGenerateDXF }))
jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({ authenticateWithSchema: async (request, reply) => {} }))

const { default: geopdfVectorRoutes } = await import('../geopdf-vector.js')

function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async () => {})
  app.addHook('preHandler', async (request) => { request.body = request.body ?? {} })
  // authenticateWithSchema is imported inside the route file from a real module;
  // the route test only needs the /dxf handler reachable, so register it directly
  // bypassing the schema-auth preHandler chain via a minimal decorator stand-in.
  app.register(geopdfVectorRoutes)
  return app
}

const basePayload = { parcels: { type: 'FeatureCollection', features: [] }, beacons: { type: 'FeatureCollection', features: [] } }

describe('/api/geopdf/dxf planType branch', () => {
  beforeEach(() => {
    mockGenerateDiagramDXF.mockClear()
    mockGenerateDXF.mockClear()
  })

  test("planType: 'diagram' calls generateDiagramDXF and returns its buffer", async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/dxf', payload: { ...basePayload, planType: 'diagram' } })
    expect(mockGenerateDiagramDXF).toHaveBeenCalledTimes(1)
    expect(mockGenerateDXF).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.toString()).toBe('DIAGRAM-DXF')
  })

  test('any other planType still calls generateDXF unchanged', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/dxf', payload: { ...basePayload, planType: 'general-undeveloped' } })
    expect(mockGenerateDXF).toHaveBeenCalledTimes(1)
    expect(mockGenerateDiagramDXF).not.toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
    expect(res.rawPayload.toString()).toBe('GENERAL-PLAN-DXF')
  })
})
