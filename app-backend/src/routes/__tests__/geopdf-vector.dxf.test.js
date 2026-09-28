import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import Fastify from 'fastify'
import { unzipSync } from 'fflate'

// Mock BOTH generators so the route test never touches real geometry/DB logic —
// it only proves the planType branch calls the right one and returns its buffer.
const mockGenerateDiagramDXF = jest.fn(async () => ({ dxfBuffer: Buffer.from('DIAGRAM-DXF'), scale: '1:500', sheetSize: 'A4' }))
const mockGenerateDXF = jest.fn(() => ({ buffer: Buffer.from('GENERAL-PLAN-DXF'), warnings: { count: 0, summary: {} } }))
const mockGenerateSheetedDXF = jest.fn((options) =>
  (options.sheets || []).map((s) => ({
    sheetNumber: s.sheetNumber,
    totalSheets: s.totalSheets,
    filename: `general-plan-sheet-${s.sheetNumber}-of-${s.totalSheets}.dxf`,
    buffer: Buffer.from(`SHEET-${s.sheetNumber}-DXF`),
    dxf: `SHEET-${s.sheetNumber}-DXF`,
    warnings: { count: 0, summary: {} },
    scale: '1:2000',
    sheetSize: 'SI727_1000x800',
  }))
)

jest.unstable_mockModule('../../services/diagramDxf.js', () => ({ generateDiagramDXF: mockGenerateDiagramDXF }))
jest.unstable_mockModule('../../services/dxfGenerator.js', () => ({
  generateDXF: mockGenerateDXF,
  generateSheetedDXF: mockGenerateSheetedDXF,
}))
// The route bundles .gpkg alongside a DXF via the real GDAL bridge — mock it so
// this suite never spawns ogr2ogr. Real conversion is exercised by the
// geopdf-vector.dxf-gpkg end-to-end suite (which deliberately does not mock).
jest.unstable_mockModule('../../utils/dxfGpkg.js', () => ({
  dxfToGeoreferencedGpkg: async () => null,
  getOGR2OGRCommand: async () => null,
  getGDALVersion: async () => null,
}))
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

describe('/api/geopdf/dxf georeferenced ZIP bundle', () => {
  beforeEach(() => {
    mockGenerateDiagramDXF.mockClear()
    mockGenerateDXF.mockClear()
  })

  test('zip:true wraps the survey-plan DXF with a .prj sidecar for the projection CRS', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/dxf',
      payload: { ...basePayload, planType: 'general-undeveloped', projection: 'EPSG:22291', zip: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/zip')
    const files = unzipSync(new Uint8Array(res.rawPayload))
    const names = Object.keys(files)
    expect(names).toHaveLength(2)
    const dxfName = names.find((n) => n.endsWith('.dxf'))
    const prjName = names.find((n) => n.endsWith('.prj'))
    expect(dxfName).toMatch(/^survey-plan-.*\.dxf$/)
    expect(prjName).toBe(dxfName.replace(/\.dxf$/, '.prj'))
    expect(Buffer.from(files[dxfName]).toString()).toBe('GENERAL-PLAN-DXF')
    const prj = Buffer.from(files[prjName]).toString()
    expect(prj).toContain('PROJCS')
    expect(prj).toContain('Cape_Lo_31')
    expect(prj).toContain('central_meridian', 31)
    expect(prj).toContain('AXIS["Easting",EAST]')
    expect(prj).toContain('AXIS["Northing",NORTH]')
    expect(prj).not.toContain('AXIS["Easting",WEST]')
  })

  test('zip:true with planType diagram bundles the diagram DXF and its .prj', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/dxf',
      payload: { ...basePayload, planType: 'diagram', projection: 'EPSG:22293', zip: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/zip')
    const files = unzipSync(new Uint8Array(res.rawPayload))
    const names = Object.keys(files)
    const dxfName = names.find((n) => n.endsWith('.dxf'))
    const prjName = names.find((n) => n.endsWith('.prj'))
    expect(dxfName).toMatch(/^diagram-.*\.dxf$/)
    expect(Buffer.from(files[dxfName]).toString()).toBe('DIAGRAM-DXF')
    expect(Buffer.from(files[prjName]).toString()).toContain('Cape_Lo_29')
  })

  test('unrecognised projection falls back to Cape Lo 31 in the .prj sidecar', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/dxf',
      payload: { ...basePayload, planType: 'general-undeveloped', projection: 'EPSG:99999', zip: true },
    })
    const files = unzipSync(new Uint8Array(res.rawPayload))
    const prj = Buffer.from(files[Object.keys(files).find((n) => n.endsWith('.prj'))]).toString()
    expect(prj).toContain('Cape_Lo_31')
    expect(prj).toContain('AXIS["Easting",EAST]')
    expect(prj).toContain('AXIS["Northing",NORTH]')
  })
})

// A cut-based multi-sheet plan is one .dxf per sheet. These are the tests that
// hold the route to that: the hazard is a request that names several sheets and
// is answered with the geometry of one of them.
describe('/api/geopdf/dxf sheeted (sheets[])', () => {
  const sheeted = (n) => ({ sheetNumber: n, totalSheets: 3, figureLabel: `Outside Figure Sheet ${n}`, ring: [], parcels: [], edges: [] })

  beforeEach(() => {
    mockGenerateDXF.mockClear()
    mockGenerateSheetedDXF.mockClear()
  })

  test('one sheet returns that sheet\'s own DXF, named by the payload', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/dxf',
      payload: { ...basePayload, sheets: [sheeted(1)] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/dxf')
    expect(res.rawPayload.toString()).toBe('SHEET-1-DXF')
    expect(res.headers['content-disposition']).toContain('general-plan-sheet-1-of-3.dxf')
    expect(res.headers['x-sheet-count']).toBe('1')
  })

  test('sheets present routes to generateSheetedDXF, never the whole-plan generateDXF', async () => {
    // The leak this forbids: the request carries per-sheet payloads AND the
    // plan-wide `parcels`, and a plan-wide draw would put every stand on every
    // sheet — a lodgeable-looking file of the wrong survey.
    const app = buildApp()
    await app.inject({ method: 'POST', url: '/dxf', payload: { ...basePayload, sheets: [sheeted(1)] } })
    expect(mockGenerateSheetedDXF).toHaveBeenCalledTimes(1)
    expect(mockGenerateDXF).not.toHaveBeenCalled()
  })

  test('no sheets key at all keeps the single-plan path exactly as it was', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/dxf', payload: { ...basePayload } })
    expect(res.statusCode).toBe(200)
    expect(mockGenerateDXF).toHaveBeenCalledTimes(1)
    expect(mockGenerateSheetedDXF).not.toHaveBeenCalled()
    expect(res.rawPayload.toString()).toBe('GENERAL-PLAN-DXF')
  })

  test('zip:true over several sheets returns one .dxf per sheet, plus ONE .prj', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/dxf',
      payload: { ...basePayload, sheets: [sheeted(1), sheeted(2), sheeted(3)], projection: 'EPSG:22291', zip: true },
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('application/zip')
    const files = unzipSync(new Uint8Array(res.rawPayload))
    const dxfNames = Object.keys(files).filter((n) => n.endsWith('.dxf'))
    expect(dxfNames).toEqual([
      'general-plan-sheet-1-of-3.dxf',
      'general-plan-sheet-2-of-3.dxf',
      'general-plan-sheet-3-of-3.dxf',
    ])
    // Every sheet is its own DXF, with its own geometry — not three copies of
    // the first. (These are the mocked generator's bytes; that the real output
    // is a complete DXF is dxfSheetFiles' job, against the real generator.)
    for (const n of dxfNames) {
      expect(Buffer.from(files[n]).toString()).toBe(`SHEET-${n.match(/sheet-(\d)-/)[1]}-DXF`)
    }
    // Exactly one .prj and no .gpkg entries for the mocked suite: the GDAL
    // bridge is mocked to null here (real georeferencing is the .dxf-gpkg
    // suite's job, against real ogr2ogr).
    expect(Object.keys(files).filter((n) => n.endsWith('.gpkg'))).toEqual([])
    // One .prj for the plan, not one per sheet: same Lo zone, same three lines.
    const prjNames = Object.keys(files).filter((n) => n.endsWith('.prj'))
    expect(prjNames).toEqual(['general-plan.prj'])
    expect(Buffer.from(files[prjNames[0]]).toString()).toContain('Cape_Lo_31')
    expect(res.headers['x-sheet-count']).toBe('3')
  })

  test('several sheets without zip is refused, never answered with sheet 1 alone', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/dxf', payload: { ...basePayload, sheets: [sheeted(1), sheeted(2)] } })
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.rawPayload.toString())
    expect(body.error).toMatch(/one file per sheet/i)
    expect(body.message).toMatch(/zip: true/)
    // The response tells the caller the full set of filenames it would have got.
    expect(body.sheets).toEqual(['general-plan-sheet-1-of-3.dxf', 'general-plan-sheet-2-of-3.dxf'])
  })

  test('gpkgOnly on a multi-sheet plan is refused rather than shipping one sheet', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/dxf', payload: { ...basePayload, sheets: [sheeted(1), sheeted(2)], gpkgOnly: true } })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.rawPayload.toString()).error).toMatch(/not available for a multi-sheet/i)
  })

  test('an empty or malformed sheets value is a 400, not a 200 with no content', async () => {
    const app = buildApp()
    const empty = await app.inject({ method: 'POST', url: '/dxf', payload: { ...basePayload, sheets: [] } })
    expect(empty.statusCode).toBe(400)
    const bad = await app.inject({ method: 'POST', url: '/dxf', payload: { ...basePayload, sheets: 'nope' } })
    expect(bad.statusCode).toBe(400)
    expect(JSON.parse(bad.rawPayload.toString()).error).toMatch(/array/i)
  })

  test('sheets without parcels or beacons is accepted; sheets are the geometry', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/dxf', payload: { sheets: [sheeted(1)] } })
    expect(res.statusCode).toBe(200)
    expect(mockGenerateSheetedDXF).toHaveBeenCalledTimes(1)
  })
})
