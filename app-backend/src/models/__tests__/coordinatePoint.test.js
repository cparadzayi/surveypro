/**
 * CoordinatePoint.batchCreate — bnr-part8 conflict adjudication.
 *
 * Db-free in two senses:
 *  - the real config/db.js pool is mocked away (importing it would open a live
 *    connection and keep Jest from exiting), and
 *  - the model is handed a pg-shaped fake for its two queries.
 *
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js coordinatePoint
 */
import { jest, describe, test, expect } from '@jest/globals'
import { classifyDuplicateGroup, resolveDuplicateGroups } from '../../../../app-shared/si727Tolerances.js'

// coordinatePoint.js imports the default db pool at module scope; that pool fires
// a real `SELECT NOW()` and keeps Jest (or process.exit(1)s on a dead DB). Mock the
// module away so the model is tested with the fake handed to batchCreate itself.
jest.unstable_mockModule('../../config/db.js', () => ({
  __esModule: true,
  default: { query: jest.fn(async () => ({ rows: [], rowCount: 0 })) },
}))

const { default: CoordinatePoint } = await import('../coordinatePoint.js')

/** A pg-shaped fake: answers the project-meridian SELECT and returns given rows for INSERTs. */
function fakeDb({ insertRows = [] } = {}) {
  const calls = []
  const state = { released: false }
  const query = async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
    if (/SELECT central_meridian FROM survey_projects/.test(sql)) {
      return { rows: [{ central_meridian: 31 }], rowCount: 1 }
    }
    if (/INSERT INTO coordinate_points/.test(sql)) {
      return { rows: insertRows, rowCount: insertRows.length }
    }
    return { rows: [], rowCount: 0 }
  }
  return { calls, state, query }
}

// How many params one row consumes, derived rather than hardcoded: the stride
// changes whenever a column is added (survey_date took it from 7 to 8), and a
// stale constant silently reads the wrong slot instead of failing loudly.
//
// Counted from the rows rather than the column list, because the two differ:
// geom is one column but two params (ST_MakePoint takes westing and southing).
// One ST_SetSRID appears per row, so that is the row count.
const paramsPerRow = (call) =>
  call.params.length / (call.sql.match(/ST_SetSRID/g) || []).length

const insertedNames = (db) => db.calls
  .filter(c => /INSERT INTO coordinate_points/.test(c.sql))
  .flatMap(c => {
    const stride = paramsPerRow(c)
    const names = []
    for (let i = 1; i < c.params.length; i += stride) names.push(c.params[i])
    return names
  })
const singleInsert = (db) => db.calls
  .find(c => /INSERT INTO coordinate_points/.test(c.sql))
  .params

describe('CoordinatePoint.batchCreate — repeat vs conflict (bnr-part8)', () => {

  test('exactly-coincident duplicates average to a single stored row (repeat)', async () => {
    // With f = the observations' own separation, only separations within the
    // para 7(5) Limits-of-Error window — tolerance >= separation, i.e. ~0.13 mm (B) /
    // ~0.28 mm (C) or less — classify as repeats; distanceToleranceM returns 0 for
    // f <= 0, so a 0 m spread always repeats. Two rows carrying identical coords are
    // the same peg re-listed — averaged, not conflicted. (A case-fold pair like
    // 2474a + 2474A is a 400 per Decision 15, so no fold here.)
    expect(classifyDuplicateGroup([{ y: 100, x: 200 }, { y: 100, x: 200 }], 'B').kind).toBe('repeat')

    const db = fakeDb({ insertRows: [{ id: 1, name: '2474A', project_id: 7 }] })
    const out = await CoordinatePoint.batchCreate(db, 7, [
      { name: '2474A', y: 100, x: 200 },
      { name: '2474A', y: 100, x: 200 },
    ], 'B')

    expect(out.conflicts).toHaveLength(0)
    expect(out.created).toHaveLength(1)
    // One stored row keeps the canonical name.
    expect(insertedNames(db)).toEqual(['2474A'])
  })

  test('any nonzero separation beyond the ~0.13 mm repeat window is a conflict — first observation canonical, rest escape as _dupl', async () => {
    // A 1 mm spread already exceeds the para 7(5) tolerance (0.04·√(0.075f + 0.00015f²)
    // < f for f > ~0.13 mm), so every genuinely distinct position claiming one name is
    // surfaced, never silently averaged.
    expect(classifyDuplicateGroup([{ y: 100, x: 200 }, { y: 100, x: 200.001 }], 'B').kind).toBe('conflict')

    const db = fakeDb({ insertRows: [
      { id: 1, name: '5000A', project_id: 7 },
      { id: 2, name: '5000A_dupl', project_id: 7 },
    ] })
    const out = await CoordinatePoint.batchCreate(db, 7, [
      { name: '5000A', y: 100, x: 200 },
      { name: '5000A', y: 105, x: 200 },
    ], 'B')

    expect(out.conflicts).toHaveLength(1)
    expect(out.conflicts[0]).toMatchObject({
      id: '5000A',
      count: 2,
      canonical: { y: 100, x: 200 },
    })
    expect(out.conflicts[0].extras).toHaveLength(1)
    expect(out.conflicts[0].extras[0].name).toBe('5000A_dupl')
    expect(out.conflicts[0].extras[0].distance).toBeCloseTo(5, 6)

    // Both rows inserted: canonical and escaped.
    expect(insertedNames(db)).toEqual(['5000A', '5000A_dupl'])
  })

  test('a second extra escapes to _dupl2 once _dupl is taken', async () => {
    const db = fakeDb({ insertRows: [
      { id: 1, name: '7000B', project_id: 7 },
      { id: 2, name: '7000B_dupl', project_id: 7 },
      { id: 3, name: '7000B_dupl2', project_id: 7 },
    ] })
    const out = await CoordinatePoint.batchCreate(db, 7, [
      { name: '7000B', y: 100, x: 200 },
      { name: '7000B', y: 110, x: 200 },
      { name: '7000B', y: 115, x: 205 },
    ], 'C')

    expect(out.conflicts).toHaveLength(1)
    expect(out.conflicts[0].extras.map(e => e.name)).toEqual(['7000B_dupl', '7000B_dupl2'])
    expect(insertedNames(db)).toEqual(['7000B', '7000B_dupl', '7000B_dupl2'])
  })

  test('the stored average is the mean of the repeated group', async () => {
    const db = fakeDb({ insertRows: [{ id: 1, name: 'P9', project_id: 7 }] })
    await CoordinatePoint.batchCreate(db, 7, [
      { name: 'P9', y: 100.1, x: 200.2 },
      { name: 'P9', y: 100.1, x: 200.2 },
      { name: 'P9', y: 100.1, x: 200.2 },
    ], 'B')
    const insert = singleInsert(db)
    // params per row: [project_id, name, y, x, elevation, description, status]
    expect(insert[1]).toBe('P9')
    expect(insert[2]).toBeCloseTo(100.1, 10)
    expect(insert[3]).toBeCloseTo(200.2, 10)
  })

  test('groups are independent — one conflict does not name-collide the next', async () => {
    const db = fakeDb({ insertRows: [
      { id: 1, name: '5000A', project_id: 7 },
      { id: 2, name: '5000A_dupl2', project_id: 7 },
      { id: 3, name: '5000A_dupl', project_id: 7 },
      { id: 4, name: '5000A_dupl_dupl', project_id: 7 },
    ] })
    const out = await CoordinatePoint.batchCreate(db, 7, [
      { name: '5000A', y: 100, x: 200 },
      { name: '5000A', y: 105, x: 200 },
      { name: '5000A_dupl', y: 120, x: 200 }, // input already contains a _dupl name
      { name: '5000A_dupl', y: 130, x: 200 },
    ], 'B')

    // '5000A_dupl' is itself a conflict group; its canonical claim keeps that name,
    // so the 5000A extra must escalate past the literal input name to _dupl2.
    expect(out.conflicts.map(c => c.id)).toEqual(['5000A', '5000A_dupl'])
    expect(out.conflicts[0].extras.map(e => e.name)).toEqual(['5000A_dupl2'])
    expect(insertedNames(db)).toEqual(['5000A', '5000A_dupl2', '5000A_dupl', '5000A_dupl_dupl'])
  })
})

describe('resolveDuplicateGroups — the shared adjudication used by both write doors', () => {
  test('mirrors batchCreate: exact duplicates average, distinct positions conflict', () => {
    const { points, conflicts } = resolveDuplicateGroups([
      ['A1', [{ name: 'A1', y: 0, x: 0 }, { name: 'A1', y: 0, x: 0 }]],
      ['A2', [{ name: 'A2', y: 0, x: 0 }, { name: 'A2', y: 0, x: 2 }]],
    ], { surveyClass: 'B' })

    expect(points.filter(p => p.name === 'A1')).toHaveLength(1)
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0].id).toBe('A2')
    expect(conflicts[0].extras[0].name).toBe('A2_dupl')
  })

  test('honours takenNames from other layers (matched imports already claiming _dupl)', () => {
    const { points } = resolveDuplicateGroups([
      ['A3', [{ name: 'A3', y: 0, x: 0 }, { name: 'A3', y: 0, x: 3 }]],
    ], { surveyClass: 'B', takenNames: new Set(['A3', 'A3_dupl']) })

    expect(points[1].name).toBe('A3_dupl2')
  })
})