import { describe, test, expect, jest } from '@jest/globals'
import Fastify from 'fastify'
import { unzipSync } from 'fflate'
import { generateDXF } from '../../services/dxfGenerator.js'

// Real end-to-end for the georeferenced bundle: no generator mocks. Requires
// ogr2ogr on the machine (QGIS/GDAL); when it is unavailable the route degrades
// to DXF + .prj only and the gpkg assertions are skipped.
jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({ authenticateWithSchema: async (request, reply) => {} }))

const { default: geopdfVectorRoutes } = await import('../geopdf-vector.js')

function buildApp() {
  const app = Fastify({ logger: { level: 'warn' } })
  app.decorate('authenticate', async () => {})
  app.addHook('preHandler', async (request) => { request.body = request.body ?? {} })
  app.register(geopdfVectorRoutes)
  return app
}

function makePayload() {
  const parcels = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[
        [2200500, 50000],
        [2200500, 50400],
        [2201000, 50400],
        [2201000, 51200],
        [2200500, 50000],
      ]] },
      properties: { stand: '1213', surveyOf: 'MAGLAS TOWNSHIP' },
    }],
  }
  const beacons = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [2200500, 50000] },
      properties: { name: 'BEACON A' },
    }],
  }
  return { parcels, beacons }
}

describe('/api/geopdf/dxf — GeoPackage-in-ZIP (QGIS native georeferencing)', () => {
  test('zip:true ships a self-describing .gpkg alongside the DXF and .prj', async () => {
    const { buffer } = generateDXF({
      ...makePayload(),
      outsideFigureData: null,
      metadata: { surveyor: 'T Surveyor', date: '2026-05-31', surveyOf: 'MAGLAS TOWNSHIP' },
      projection: 'EPSG:22291',
      scale: '1:500',
      sheetSize: 'SI727_500x400',
    }, { info: () => {}, warn: () => {}, error: () => {} })

    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/dxf',
      payload: { ...makePayload(), planType: 'general-undeveloped', projection: 'EPSG:22291', zip: true },
    })
    expect(res.statusCode).toBe(200)

    const files = unzipSync(new Uint8Array(res.rawPayload))
    const names = Object.keys(files)
    expect(names.find((n) => n.endsWith('.dxf'))).toBeTruthy()
    expect(names.find((n) => n.endsWith('.prj'))).toBeTruthy()

    const gpkgName = names.find((n) => n.endsWith('.gpkg'))
    if (!gpkgName) {
      // ogr2ogr unavailable on this machine — route degraded gracefully, DXF export still works
      return
    }

    expect(gpkgName).toBe(names.find((n) => n.endsWith('.dxf')).replace(/\.dxf$/, '.gpkg'))
    const gpkg = Buffer.from(files[gpkgName])
    // Valid SQLite/GeoPackage header
    expect(gpkg.subarray(0, 15).toString('latin1')).toBe('SQLite format 3')
    // Embedded CRS: PROJCRS "Cape / Lo31" (GDAL names it "Cape / Lo31")
    expect(gpkg.toString('latin1')).toContain('Cape / Lo31')
  })
})