import { describe, test, expect } from '@jest/globals'
import { describeGeometryProblems, describePointProblems, isRowId, toFinite } from '../requestChecks.js'
import { NameLock, nameKey } from '../projectNameLock.js'

describe('isRowId', () => {
  test.each(['1', '42', 7, '2147483647'])('%j is an id', (v) => expect(isRowId(v)).toBe(true))
  test.each(['abc', '', '1; select pg_sleep(5)--', '-1', '1.5', '2147483648', '99999999999', null, undefined, {}])('%j is not', (v) => expect(isRowId(v)).toBe(false))
})

describe('toFinite', () => {
  test('numbers and plain numeric strings', () => {
    expect(toFinite(54000.25)).toBe(54000.25)
    expect(toFinite(' -3900000.5 ')).toBe(-3900000.5)
    expect(toFinite('1e3')).toBe(1000)
  })
  test.each([NaN, Infinity, 'abc', '', null, undefined, '12abc', {}])('%j is not a number', (v) => expect(toFinite(v)).toBeNull())
})

describe('describePointProblems', () => {
  test('a clean batch has no problems, including numeric strings and numeric names', () => {
    expect(describePointProblems([{ name: 'A1', y: 54000, x: -3900000 }, { name: 101, y: '54010.5', x: '-3900010', elevation: '1200' }])).toEqual([])
  })

  test('names the row, the beacon and the field', () => {
    const p = describePointProblems([{ name: 'OK', y: 1, x: 2 }, { name: 'B2', y: 'abc', x: null }, { name: '  ', y: 1, x: 2 }, { name: 'B4', y: 1, x: 2, elevation: 'high' }])
    expect(p).toEqual([
      'Row 2 (B2): Y is not a number',
      'Row 2 (B2): X is not a number',
      'Row 3: the beacon name is blank',
      'Row 4 (B4): the elevation is not a number',
    ])
  })

  test('rejects non-objects and stops listing after the cap', () => {
    expect(describePointProblems([null])).toEqual(['Row 1: is not a point'])
    expect(describePointProblems(Array.from({ length: 100 }, () => ({ name: '', y: 'a', x: 'b' })), { max: 20 })).toHaveLength(20)
  })
})

describe('NameLock', () => {
  test('refuses a second run of the same key while the first is going, and frees it afterwards', async () => {
    const lock = new NameLock()
    let release
    const first = lock.run('s|p', () => new Promise((r) => { release = r }))
    expect(await lock.run('s|p', async () => 'second')).toEqual({ busy: true })
    expect(await lock.run('s|other', async () => 'x')).toEqual({ busy: false, value: 'x' })
    release('one')
    expect(await first).toEqual({ busy: false, value: 'one' })
    expect(await lock.run('s|p', async () => 'again')).toEqual({ busy: false, value: 'again' })
  })

  test('frees the key even when the work throws', async () => {
    const lock = new NameLock()
    await expect(lock.run('k', async () => { throw new Error('x') })).rejects.toThrow('x')
    expect(await lock.run('k', async () => 1)).toEqual({ busy: false, value: 1 })
  })

  test('names compare without case or edge spaces', () => {
    expect(nameKey('  Maglas 1686 ')).toBe(nameKey('maglas 1686'))
  })
})

describe('coordinate range', () => {
  test('a coordinate beyond any projected system is a problem, an ordinary Lo coordinate is not', () => {
    expect(describePointProblems([{ name: 'F2', y: 9e9, x: -9e9 }])).toEqual([
      'Row 1 (F2): Y is beyond 10 million metres, which cannot be a survey position',
      'Row 1 (F2): X is beyond 10 million metres, which cannot be a survey position',
    ])
    expect(describePointProblems([{ name: 'OK', y: -103573.21, x: 2248259.159 }])).toEqual([])
  })
})

describe('describeGeometryProblems', () => {
  const ring = [[54000, 2146000], [54180, 2146000], [54180, 2146111], [54000, 2146111], [54000, 2146000]]

  test.each([
    ['a closed Polygon', { type: 'Polygon', coordinates: [ring] }],
    ['a Feature wrapping one', { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] } }],
    ['a MultiPolygon', { type: 'MultiPolygon', coordinates: [[ring], [ring]] }],
    ['a Polygon with a closed hole', { type: 'Polygon', coordinates: [ring, [[54010, 2146010], [54020, 2146010], [54020, 2146020], [54010, 2146010]]] }],
  ])('%s is fine', (_, g) => expect(describeGeometryProblems(g)).toEqual([]))

  test('the two-point polygon the simulation stored', () => {
    expect(describeGeometryProblems({ type: 'Polygon', coordinates: [[[0, 0], [1, 1]]] })[0]).toMatch(/outer ring needs at least 3 distinct corners/)
  })

  test('an unclosed ring', () => {
    expect(describeGeometryProblems({ type: 'Polygon', coordinates: [ring.slice(0, 4)] })).toEqual(['the outer ring is not closed (it must end where it starts)'])
  })

  test('points that are not numbers, and positions off the map', () => {
    const text = [['a', 'b'], [1, 1], [2, 2], ['a', 'b']]
    expect(describeGeometryProblems({ type: 'Polygon', coordinates: [text] })).toEqual(['the outer ring has a point that is not a pair of numbers'])
    const far = [[0, 0], [9e9, 0], [9e9, 9e9], [0, 0]]
    expect(describeGeometryProblems({ type: 'Polygon', coordinates: [far] })[0]).toMatch(/beyond 10 million metres/)
  })

  test('names which part of a MultiPolygon is wrong', () => {
    expect(describeGeometryProblems({ type: 'MultiPolygon', coordinates: [[ring], [[[0, 0]]]] })[0]).toMatch(/outer ring \(part 2\)/)
  })

  test('missing, wrong type, empty', () => {
    expect(describeGeometryProblems(null)).toEqual(['the boundary is missing'])
    expect(describeGeometryProblems({ type: 'Point', coordinates: [1, 2] })[0]).toMatch(/must be a Polygon, not Point/)
    expect(describeGeometryProblems({ type: 'Polygon', coordinates: [] })).toEqual(['the boundary has no rings'])
  })
})
