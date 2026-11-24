/**
 * POST /csv-imports/execute-merge (the CSV re-import "smart merge").
 *
 * It used to DELETE every point of the project first and then UPDATE the matched points by their old ids,
 * rows it had just deleted, so a re-import of the same field data (every point matched) left the project
 * with no points: goodyear2026 lost all 453, and its field book and Co-ordinate List printed only the trig
 * stations and the calculated points added afterwards. These tests pin that the matched rows are kept and
 * updated, only the points the file no longer has are removed, the file's status, description and survey
 * date reach the rows, and an escaped duplicate is stored under its escaped name.
 *
 * Same harness as csvImports.tracking.test.js: the schema hooks are stubbed and request.db is a fake whose
 * connect() hands out a recording client.
 */
import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import Fastify from 'fastify'

const calls = []
const client = {
  query: jest.fn(async (sql, params) => {
    calls.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), params })
    if (/^INSERT INTO coordinate_points/i.test(String(sql).trim())) return { rows: [{ id: 900 + calls.length }], rowCount: 1 }
    if (/SELECT central_meridian/i.test(sql)) return { rows: [{ central_meridian: 29 }] }
    if (/^DELETE FROM coordinate_points/i.test(String(sql).trim())) return { rows: [], rowCount: 2 }
    return { rows: [], rowCount: 1 }
  }),
  release: jest.fn(),
}
const fakeDb = { query: jest.fn(), connect: jest.fn(async () => client) }

jest.unstable_mockModule('../../utils/schemaAuth.js', () => ({
  authenticateWithSchema: async (request) => { request.db = fakeDb; request.surveyorSchema = 'surveyor_test' },
  requireSchema: async () => {},
}))
const { default: csvImportRoutes } = await import('../csvImports.js')

function buildApp() {
  const app = Fastify({ logger: false })
  app.decorate('authenticate', async () => {})
  app.decorate('pg', { query: jest.fn(() => { throw new Error('fell back to the global pool') }) })
  app.register(csvImportRoutes)
  return app
}

const merge = (body) => buildApp().inject({ method: 'POST', url: '/csv-imports/execute-merge', payload: body })
const sqlOf = (re) => calls.filter((c) => re.test(c.sql))

describe('POST /csv-imports/execute-merge', () => {
  beforeEach(() => { calls.length = 0; client.query.mockClear() })

  test('keeps every matched point: only the points the file no longer has are deleted', async () => {
    const res = await merge({
      project_id: 12, import_id: 25,
      matched_points: [
        { oldDbId: 11, newId: 'A1', coordinate: { y: -1, x: 2 } },
        { oldDbId: 12, newId: 'A2', coordinate: { y: -3, x: 4 } },
      ],
      new_points: [],
    })
    expect(res.statusCode).toBe(200)
    const del = sqlOf(/^DELETE FROM coordinate_points/i)
    expect(del).toHaveLength(1)
    expect(del[0].sql).toMatch(/NOT \(id = ANY\(\$2::int\[\]\)\)/)
    expect(del[0].params).toEqual([12, [11, 12]])
    const updates = sqlOf(/^UPDATE coordinate_points SET geom/i)
    expect(updates.map((u) => u.params[4])).toEqual([11, 12])
    expect(sqlOf(/^COMMIT/)).toHaveLength(1)
  })

  test('parks the kept rows on clash-free names before renaming them (a rename swap cannot hit the unique key)', async () => {
    await merge({
      project_id: 12, import_id: 25,
      matched_points: [
        { oldDbId: 11, newId: 'B', coordinate: { y: -1, x: 2 } },
        { oldDbId: 12, newId: 'A', coordinate: { y: -3, x: 4 } },
      ],
      new_points: [],
    })
    const order = calls.map((c) => c.sql)
    const park = order.findIndex((s) => /SET name = '__merge_' \|\| id::text/.test(s))
    const firstRename = order.findIndex((s) => /^UPDATE coordinate_points SET geom/i.test(s))
    expect(park).toBeGreaterThan(-1)
    expect(park).toBeLessThan(firstRename)
  })

  test('writes the file’s status, description and survey date to matched and new points', async () => {
    await merge({
      project_id: 12, import_id: 25,
      matched_points: [{ oldDbId: 11, newId: 'A1', coordinate: { y: -1, x: 2 }, status: 'F', description: '12mm iron peg', surveyDate: '2026-10-14' }],
      new_points: [{ id: 'N1', y: -5, x: 6, status: 'P', description: 'Iron peg in concrete', surveyDate: '2026-10-15' }],
    })
    const upd = sqlOf(/^UPDATE coordinate_points SET geom/i)[0]
    expect(upd.sql).toMatch(/status = COALESCE\(\$7, status\)/)
    expect(upd.params.slice(6)).toEqual(['F', '12mm iron peg', '2026-10-14'])
    const ins = sqlOf(/^INSERT INTO coordinate_points/i)[0]
    expect(ins.params[1]).toBe('N1')
    expect(ins.params[4]).toBe('P')
    expect(ins.params[5]).toBe('Iron peg in concrete')
    expect(ins.params[8]).toBe('2026-10-15')
  })

  test('a matched point the file gives no status keeps its stored one (null, not an empty value)', async () => {
    await merge({
      project_id: 12, import_id: 25,
      matched_points: [{ oldDbId: 11, newId: 'A1', coordinate: { y: -1, x: 2 } }],
      new_points: [],
    })
    expect(sqlOf(/^UPDATE coordinate_points SET geom/i)[0].params.slice(6)).toEqual([null, null, null])
  })

  test('stores an escaped duplicate under its _dupl name, not the name it duplicates', async () => {
    await merge({
      project_id: 12, import_id: 25, surveyClass: 'B',
      matched_points: [],
      new_points: [
        { id: 'D1', y: -100, x: 200, status: 'F' },
        { id: 'D1', y: -100.5, x: 200.5, status: 'F' },
      ],
    })
    const names = sqlOf(/^INSERT INTO coordinate_points/i).map((c) => c.params[1])
    expect(names).toEqual(['D1', 'D1_dupl'])
  })
})
