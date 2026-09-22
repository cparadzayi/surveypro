/**
 * app-shared/beaconName.js — the single source of the beacon name rule.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js beaconName-shared
 */
import { describe, test, expect } from '@jest/globals'
import {
  splitBeaconName,
  normalizeBeaconName,
  labelParts,
  findCaseFoldDuplicates,
  planNameNormalization,
  isReferenceMarkName,
} from '../../../../app-shared/beaconName.js'

describe('splitBeaconName', () => {
  test('splits a numeric prefix from an alphabetic suffix, verbatim', () => {
    expect(splitBeaconName('2474a')).toEqual({ prefix: '2474', suffix: 'a' })
    expect(splitBeaconName('1464An')).toEqual({ prefix: '1464', suffix: 'An' })
    expect(splitBeaconName('2474AB')).toEqual({ prefix: '2474', suffix: 'AB' })
  })

  test('returns null for anything that is not digits-then-letters', () => {
    for (const name of ['SD4', 'TSM5025', 'A', '1425', '2474A1', '', ' 2474a', '2474a ']) {
      expect(splitBeaconName(name)).toBeNull()
    }
  })

  test('returns null for non-strings without throwing', () => {
    for (const name of [null, undefined, 42, {}, []]) {
      expect(splitBeaconName(name)).toBeNull()
    }
  })
})

describe('normalizeBeaconName', () => {
  test('uppercases an ALL-lowercase suffix', () => {
    expect(normalizeBeaconName('2474a')).toBe('2474A')
    expect(normalizeBeaconName('15b')).toBe('15B')
    expect(normalizeBeaconName('1464an')).toBe('1464AN')
  })

  test('passes everything else through byte for byte', () => {
    // 1464An is a deliberate naming form (spec Resolved #1) — never touched.
    for (const name of ['1464An', '2474A', 'A', 'SD4', 'TSM5025', '2474A1', '1425', '']) {
      expect(normalizeBeaconName(name)).toBe(name)
    }
  })

  test('does not trim — callers trim where they already do', () => {
    expect(normalizeBeaconName(' 2474a')).toBe(' 2474a')
  })

  test('is idempotent', () => {
    for (const name of ['2474a', '15b', '1464an', '1464An', 'SD4', '']) {
      const once = normalizeBeaconName(name)
      expect(normalizeBeaconName(once)).toBe(once)
    }
  })

  test('returns non-string input unchanged and never throws', () => {
    expect(normalizeBeaconName(null)).toBeNull()
    expect(normalizeBeaconName(undefined)).toBeUndefined()
    expect(normalizeBeaconName(42)).toBe(42)
  })
})

describe('labelParts', () => {
  test('splits the NORMALISED name', () => {
    expect(labelParts('2474a')).toEqual({ prefix: '2474', suffix: 'A' })
    expect(labelParts('2474A')).toEqual({ prefix: '2474', suffix: 'A' })
    expect(labelParts('2474AB')).toEqual({ prefix: '2474', suffix: 'AB' })
  })

  test('keeps a mixed-case suffix as written', () => {
    expect(labelParts('1464An')).toEqual({ prefix: '1464', suffix: 'An' })
  })

  test('is null for a control beacon', () => {
    expect(labelParts('SD4')).toBeNull()
    expect(labelParts(undefined)).toBeNull()
  })
})

describe('findCaseFoldDuplicates', () => {
  test('reports two raw names that normalise to one', () => {
    expect(findCaseFoldDuplicates(['99a', '12', '99A'])).toEqual([['99a', '99A']])
  })

  test('does not report exact duplicates — those keep today\'s averaging', () => {
    expect(findCaseFoldDuplicates(['15b', '15b', '15B'])).toEqual([['15b', '15B']])
    expect(findCaseFoldDuplicates(['15b', '15b'])).toEqual([])
  })

  test('does not group a mixed-case suffix with its uppercase form', () => {
    // 1464An does not normalise, so it is a different name from 1464AN.
    expect(findCaseFoldDuplicates(['1464An', '1464AN'])).toEqual([])
    expect(findCaseFoldDuplicates(['1464an', '1464AN'])).toEqual([['1464an', '1464AN']])
  })

  test('reports every group and tolerates junk', () => {
    expect(findCaseFoldDuplicates(['1a', null, '1A', 7, '2b', '2B'])).toEqual([['1a', '1A'], ['2b', '2B']])
    expect(findCaseFoldDuplicates(null)).toEqual([])
  })
})

describe('planNameNormalization', () => {
  const rows = [
    { id: 1, name: '2474a', y: 10, x: 20 },
    { id: 2, name: '2475b', y: 30, x: 40 },
    { id: 3, name: '2475B', y: 31, x: 41 },
    { id: 4, name: '1464An', y: 50, x: 60 },
    { id: 5, name: 'SD4', y: 70, x: 80 },
  ]

  test('plans a rename for each lowercase suffix whose target is free', () => {
    expect(planNameNormalization(rows).renames).toEqual([{ id: 1, from: '2474a', to: '2474A' }])
  })

  test('puts a rename whose target already exists in collisions, never in renames', () => {
    expect(planNameNormalization(rows).collisions).toEqual([{ from: '2475b', existing: '2475B' }])
  })

  test('returns the row list with the renames applied, every other field intact', () => {
    const { after } = planNameNormalization(rows)
    expect(after.map(r => r.name)).toEqual(['2474A', '2475b', '2475B', '1464An', 'SD4'])
    expect(after[0]).toEqual({ id: 1, name: '2474A', y: 10, x: 20 })
  })

  test('does not mutate its input', () => {
    const before = JSON.stringify(rows)
    planNameNormalization(rows)
    expect(JSON.stringify(rows)).toBe(before)
  })

  test('plans nothing for clean or empty input', () => {
    expect(planNameNormalization([{ id: 9, name: '2474A' }])).toEqual({
      renames: [], collisions: [], after: [{ id: 9, name: '2474A' }],
    })
    expect(planNameNormalization(null)).toEqual({ renames: [], collisions: [], after: [] })
  })
})
describe('isReferenceMarkName', () => {
  test('reads RM prefixed with a numeric suffix', () => {
    for (const name of ['RM16', 'RM 16', 'RM7', 'RM15A', 'rm16', 'RM 7', ' RM16 ', 'RM16 ']) {
      expect(isReferenceMarkName(name)).toBe(true)
    }
  })

  test('refuses anything without the numeric suffix', () => {
    for (const name of ['RM', 'SD4', '87DR', 'BASE', '170/T', 'RMX']) {
      expect(isReferenceMarkName(name)).toBe(false)
    }
  })

  test('returns false rather than throwing for non-strings', () => {
    for (const name of [null, undefined, 42, {}, []]) {
      expect(isReferenceMarkName(name)).toBe(false)
    }
  })
})
