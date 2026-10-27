import { describe, test, expect } from '@jest/globals'
import { describePointProblems, isRowId, toFinite } from '../requestChecks.js'
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
