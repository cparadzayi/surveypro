import { describe, test, expect, jest } from '@jest/globals'
import Fastify from 'fastify'
import http from 'http'

/**
 * A DXF export whose client has gone away (Cancel, closed tab) must stop its GeoPackage step: the
 * route hands ogr2ogr an AbortSignal that fires when the connection closes before the reply is sent.
 * The GDAL bridge is mocked here: it waits for the signal, as the real one's child process does.
 */
let seenSignal = null
let sawAbort = false
const mockGpkg = jest.fn((dxf, projection, logger, signal) => {
  seenSignal = signal
  return new Promise((resolve, reject) => {
    const stop = () => { sawAbort = true; const e = new Error('cancelled'); e.name = 'GenerationCancelled'; reject(e) }
    if (signal?.aborted) return stop()
    signal?.addEventListener('abort', stop, { once: true })
    setTimeout(() => resolve(null), 20000).unref()   // never, in this test
  })
})

jest.unstable_mockModule('../../services/dxfGenerator.js', () => ({
  generateDXF: () => ({ buffer: Buffer.from('DXF'), warnings: { count: 0, summary: {} } }),
  generateSheetedDXF: () => [],
}))
jest.unstable_mockModule('../../services/diagramDxf.js', () => ({ generateDiagramDXF: async () => ({}) }))
jest.unstable_mockModule('../../utils/dxfGpkg.js', () => ({
  dxfToGeoreferencedGpkg: mockGpkg,
  getOGR2OGRCommand: async () => null,
  getGDALVersion: async () => null,
}))
jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({
  authenticateWithSchema: async () => {},
  requireSchema: async () => {},
}))

const { default: geopdfVectorRoutes } = await import('../geopdf-vector.js')

describe('/api/geopdf/dxf when the client goes away', () => {
  test('the GeoPackage step receives a signal that aborts when the connection closes', async () => {
    const app = Fastify({ logger: false })
    app.decorate('authenticate', async () => {})
    app.register(geopdfVectorRoutes)
    await app.listen({ port: 0, host: '127.0.0.1' })
    try {
      const body = JSON.stringify({
        parcels: { type: 'FeatureCollection', features: [] },
        beacons: { type: 'FeatureCollection', features: [] },
        zip: true, includeGpkg: true,
      })
      const req = http.request({
        host: '127.0.0.1', port: app.server.address().port, path: '/dxf', method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      })
      req.on('error', () => {})
      req.end(body)

      const t0 = Date.now()
      while (!seenSignal && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 25))
      expect(seenSignal).not.toBeNull()
      expect(seenSignal.aborted).toBe(false)      // the client is still there

      req.destroy()                               // the client goes away
      const t1 = Date.now()
      while (!sawAbort && Date.now() - t1 < 5000) await new Promise((r) => setTimeout(r, 25))
      expect(sawAbort).toBe(true)
      expect(seenSignal.aborted).toBe(true)
    } finally {
      await app.close()
    }
  }, 30000)
})
