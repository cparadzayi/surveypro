/**
 * Beacon name write doors (spec Part 3). Db-free: every function takes a connection.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js beaconNameDoors
 */
import { describe, test, expect } from '@jest/globals'
import {
  BeaconNameCaseError,
  assertNoCaseFoldDuplicates,
  normalizeBatchPoints,
  normalizeMergeNames,
  renameByName,
  applyNameNormalization,
} from '../beaconNameDoors.js'

/** A pg-shaped fake: records every query, answers from [regex, fn] responders. */
function fakeDb(responders = []) {
  const calls = []
  const state = { released: false }
  const query = async (sql, params) => {
    calls.push({ sql: sql.replace(/\s+/g, ' ').trim(), params })
    for (const [pattern, respond] of responders) {
      if (pattern.test(sql)) return respond(params)
    }
    return { rows: [], rowCount: 0 }
  }
  return {
    calls,
    state,
    query,
    async connect() {
      return { query, release: () => { state.released = true } }
    },
  }
}

describe('assertNoCaseFoldDuplicates', () => {
  test('throws a 400 naming the pair', () => {
    let caught
    try {
      assertNoCaseFoldDuplicates(['99a', '12', '99A'])
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(BeaconNameCaseError)
    expect(caught.statusCode).toBe(400)
    expect(caught.message).toMatch(/"99a" \/ "99A"/)
  })

  test('allows exact duplicates and clean lists', () => {
    expect(() => assertNoCaseFoldDuplicates(['15b', '15b', 'SD4'])).not.toThrow()
  })
})

describe('normalizeBatchPoints', () => {
  test('normalises every name and keeps every other field', () => {
    expect(normalizeBatchPoints([{ name: '2474a', y: 1, x: 2, description: 'peg' }, { name: '1464An', y: 3, x: 4 }]))
      .toEqual([{ name: '2474A', y: 1, x: 2, description: 'peg' }, { name: '1464An', y: 3, x: 4 }])
  })

  test('rejects a case-fold pair instead of averaging or dropping one (decision 15)', () => {
    expect(() => normalizeBatchPoints([{ name: '99a', y: 1, x: 1 }, { name: '99A', y: 1, x: 1 }])).toThrow(BeaconNameCaseError)
  })
})

describe('normalizeMergeNames', () => {
  test('normalises matched newId and new point ids', () => {
    expect(normalizeMergeNames({
      project_id: 1,
      matched_points: [{ oldDbId: 7, newId: '2474a', coordinate: { y: 1, x: 2 } }],
      new_points: [{ id: '15b', y: 3, x: 4 }, { id: '15b', y: 3.01, x: 4 }],
    })).toEqual({
      matched_points: [{ oldDbId: 7, newId: '2474A', coordinate: { y: 1, x: 2 } }],
      new_points: [{ id: '15B', y: 3, x: 4 }, { id: '15B', y: 3.01, x: 4 }],
    })
  })

  test('rejects a case-fold pair across matched and new points', () => {
    expect(() => normalizeMergeNames({
      matched_points: [{ newId: '99a' }],
      new_points: [{ id: '99A' }],
    })).toThrow(/"99a" \/ "99A"/)
  })

  test('returns only the keys that were arrays, so route validation is unchanged', () => {
    expect(normalizeMergeNames({ project_id: 1 })).toEqual({})
    expect(normalizeMergeNames(undefined)).toEqual({})
  })
})

describe('renameByName', () => {
  test('normalises the new name BEFORE the conflict check and the UPDATE', async () => {
    const db = fakeDb([[/UPDATE coordinate_points/, params => ({ rows: [{ id: 5, name: params[0] }], rowCount: 1 })]])
    const out = await renameByName(db, '3', '1620', '2474b')
    expect(out).toEqual({ status: 200, row: { id: 5, name: '2474B' } })
    expect(db.calls[0].sql).toMatch(/^SELECT id FROM coordinate_points/)
    expect(db.calls[0].params).toEqual(['3', '2474B', '1620'])
    expect(db.calls[1].params).toEqual(['2474B', '3', '1620'])
  })

  test('409 when the normalised name is taken by another point', async () => {
    const db = fakeDb([[/^SELECT id FROM coordinate_points/, () => ({ rows: [{ id: 9 }], rowCount: 1 })]])
    expect(await renameByName(db, '3', '1620', '2474a')).toEqual({ status: 409, name: '2474A' })
    expect(db.calls).toHaveLength(1)
  })

  test('404 when the old name does not exist', async () => {
    const db = fakeDb([[/UPDATE coordinate_points/, () => ({ rows: [], rowCount: 0 })]])
    expect(await renameByName(db, '3', 'NOPE', '2474A')).toEqual({ status: 404 })
  })
})

describe('applyNameNormalization', () => {
  const rows = [{ id: 1, name: '2474a' }, { id: 2, name: '2475b' }, { id: 3, name: '2475B' }, { id: 4, name: 'SD4' }]
  const selectRows = [/SELECT id, name FROM coordinate_points/, () => ({ rows, rowCount: rows.length })]

  test('applies the plan in ONE transaction and never touches a collision', async () => {
    const db = fakeDb([selectRows])
    const out = await applyNameNormalization(db, '3', [{ id: 1, from: '2474a', to: '2474A' }])
    expect(out).toEqual({ stale: false, renamed: 1 })
    const sqls = db.calls.map(c => c.sql)
    expect(sqls[0]).toBe('BEGIN')
    expect(sqls[1]).toMatch(/FOR UPDATE/)
    const updates = db.calls.filter(c => /^UPDATE/.test(c.sql))
    expect(updates.map(c => c.params)).toEqual([['2474A', 1, '3']])
    expect(sqls[sqls.length - 1]).toBe('COMMIT')
    expect(db.state.released).toBe(true)
  })

  test('409-shaped result and ROLLBACK when the client plan no longer matches the rows', async () => {
    const db = fakeDb([selectRows])
    const out = await applyNameNormalization(db, '3', [{ id: 1, from: '2474a', to: '2474A' }, { id: 2, from: '2475b', to: '2475B' }])
    expect(out).toEqual({ stale: true, renamed: 0 })
    expect(db.calls.some(c => /^UPDATE/.test(c.sql))).toBe(false)
    expect(db.calls[db.calls.length - 1].sql).toBe('ROLLBACK')
    expect(db.state.released).toBe(true)
  })

  test('accepts the same plan in a different order and with string ids', async () => {
    const two = [{ id: 1, name: '2474a' }, { id: 2, name: '15b' }]
    const db = fakeDb([[/SELECT id, name FROM coordinate_points/, () => ({ rows: two, rowCount: 2 })]])
    const out = await applyNameNormalization(db, '3', [{ id: '2', from: '15b', to: '15B' }, { id: '1', from: '2474a', to: '2474A' }])
    expect(out).toEqual({ stale: false, renamed: 2 })
  })

  test('rolls back, releases and rethrows when an UPDATE fails', async () => {
    const db = fakeDb([selectRows, [/^UPDATE/, () => { throw new Error('unique violation') }]])
    await expect(applyNameNormalization(db, '3', [{ id: 1, from: '2474a', to: '2474A' }])).rejects.toThrow('unique violation')
    expect(db.calls[db.calls.length - 1].sql).toBe('ROLLBACK')
    expect(db.state.released).toBe(true)
  })
})