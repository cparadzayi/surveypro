/**
 * POST /adopted-beacons/adopt is the Parcel Digitization & Areas equivalent of
 * the Import CSV correction: one live observation becomes an adopted beacon,
 * carrying its own coordinates/status/description into project_adopted_beacons
 * while the surveyor supplies the source record citation.
 *
 * The delete and insert are one data-modifying CTE. These tests pin that the
 * citation reaches both statements' params, that a missing point is not silently
 * adopted, and that a name already in the adopted set rolls the delete back
 * (409) instead of orphaning the live observation.
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import Fastify from 'fastify'

const calls = []
const fakeDb = { query: jest.fn() }

jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({
  authenticateWithSchema: async (request) => {
    request.db = fakeDb
    request.surveyorSchema = 'surveyor_test'
  },
  requireSchema: async () => {},
}))
const { default: adoptedBeaconRoutes } = await import('../adoptedBeacons.js')

function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async () => {})
  app.decorate('pg', {
    query: jest.fn(() => {
      throw new Error('fell back to the global pool')
    }),
  })
  app.register(adoptedBeaconRoutes)
  return app
}

const adopt = (body) =>
  buildApp().inject({ method: 'POST', url: '/adopted-beacons/adopt', payload: body })

const validBody = {
  project_id: 12,
  point_name: '2474a',
  sr_number: '112/2021',
  survey_date: 'February-21',
}

const adoptedRow = {
  id: 5,
  project_id: 12,
  sr_number: '112/2021',
  point_name: '2474A',
  y: 97538.004,
  x: 2247107.872,
  status: 'F',
  description: '12mm iron peg',
  survey_date: 'February-21',
  point_order: 3,
}

describe('POST /adopted-beacons/adopt', () => {
  beforeEach(() => {
    calls.length = 0
    fakeDb.query.mockReset()
    fakeDb.query.mockImplementation(async (sql, params) => {
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params })
      if (/WITH removed AS/i.test(sql)) return { rows: [adoptedRow], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    })
  })

  test('atomically deletes the live point and adopts it with the source citation', async () => {
    const res = await adopt(validBody)

    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ ok: true, data: adoptedRow })
    const stmt = calls.find((c) => /WITH removed AS/i.test(c.sql))
    expect(stmt).toBeDefined()
    expect(stmt.sql).toMatch(/DELETE FROM coordinate_points/)
    expect(stmt.sql).toMatch(/INSERT INTO project_adopted_beacons/)
    expect(stmt.sql).toMatch(/ST_X\(geom\) AS y, ST_Y\(geom\) AS x/)
    expect(stmt.params).toEqual([12, '2474A', '112/2021', 'February-21'])
  })

  test('refuses a bad project id or empty citation before touching the database', async () => {
    expect((await adopt({ ...validBody, project_id: 'abc' })).statusCode).toBe(400)
    expect((await adopt({ ...validBody, sr_number: '  ' })).statusCode).toBe(400)
    expect((await adopt({ ...validBody, point_name: '' })).statusCode).toBe(400)
    expect(fakeDb.query).not.toHaveBeenCalled()
  })

  test('reports a point that is not there instead of adopting an empty row', async () => {
    fakeDb.query.mockImplementation(async (sql, params) => {
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params })
      return { rows: [], rowCount: 0 }
    })

    const res = await adopt(validBody)
    expect(res.statusCode).toBe(404)
    expect(res.json().ok).toBe(false)
  })

  test('reports a point with no geometry so it can be repaired rather than adopted at 0,0', async () => {
    fakeDb.query.mockImplementation(async (sql, params) => {
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params })
      if (/WITH removed AS/i.test(sql)) return { rows: [], rowCount: 0 }
      return { rows: [{ id: 77 }], rowCount: 1 }
    })

    const res = await adopt(validBody)
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatch(/no stored coordinates/i)
  })

  test('a duplicate adopted name is a 409 and does not leave the live point deleted', async () => {
    fakeDb.query.mockImplementation(async (sql, params) => {
      calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params })
      if (/WITH removed AS/i.test(sql)) {
        const error = new Error('duplicate key')
        error.code = '23505'
        throw error
      }
      return { rows: [], rowCount: 0 }
    })

    const res = await adopt(validBody)
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatch(/already adopted/i)
    // One statement only: there is no second DELETE to undo.
    expect(calls.filter((c) => /WITH removed AS/i.test(c.sql))).toHaveLength(1)
  })
})
