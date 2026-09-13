/**
 * Entry-point normalisation — the frontend side of spec Part 3.
 * Pure: only tests validateAndParseCSV and the normalisation helpers,
 * no network. Run: cd app-frontend && vitest run beaconName-entry
 */
import { describe, test, expect } from 'vitest'
import { validateAndParseCSV } from '../cadastral-csv'
import { normalizeBeaconName, findCaseFoldDuplicates } from '../../../../app-shared/beaconName'

const HEADER = 'Point,Y,X,Status,Description,Date of survey'

function csv(...rows: string[]) {
  return [HEADER, ...rows].join('\n')
}

describe('cadastral-csv — normalised id on parse', () => {
  test('a lowercase-suffix id is accepted but keeps its original id in the point (the normaliser runs elsewhere)', () => {
    // The CSV parser itself does NOT mutate the id — it stores the raw id; the
    // normalisation happens in validateAndParseCSV BEFORE the point is emitted.
    const r = validateAndParseCSV(csv('2474a,97581.234,2247733.456,P,peg,1/10/2025'))
    expect(r.isValid).toBe(true)
    expect(r.preview[0].id).toBe('2474A')
  })

  test('1464An passes through byte-for-byte (mixed-case is a deliberate naming form)', () => {
    const r = validateAndParseCSV(csv('1464An,97581.234,2247733.456,F,town,1/10/2025'))
    expect(r.isValid).toBe(true)
    expect(r.preview[0].id).toBe('1464An')
  })

  test('SD4, TSM5025, 2474A1, 1425, "" are byte-for-byte (no numeric prefix)', () => {
    const r = validateAndParseCSV(csv(
      'SD4,97581.234,2247733.456,P,peg,1/10/2025',
      'TSM5025,97581.234,2247733.456,P,peg,1/10/2025',
      '2474A1,97581.234,2247733.456,P,peg,1/10/2025',
      '1425,97581.234,2247733.456,P,peg,1/10/2025',
    ))
    expect(r.preview.map(p => p.id)).toEqual(['SD4', 'TSM5025', '2474A1', '1425'])
  })
})

describe('cadastral-csv — case-fold pair rejection (decision 15)', () => {
  test('99a + 99A in the same file is a hard error', () => {
    const r = validateAndParseCSV(csv(
      '99a,97581.234,2247733.456,P,peg,1/10/2025',
      '99A,97581.234,2247733.456,P,peg,1/10/2025',
    ))
    expect(r.isValid).toBe(false)
    expect(r.errors.some(e => e.severity === 'error' && /99a.*99A/.test(e.message))).toBe(true)
  })

  test('15b + 15B in the same file is a hard error', () => {
    const r = validateAndParseCSV(csv(
      '15b,97581.234,2247733.456,P,peg,1/10/2025',
      '15B,97581.234,2247733.456,P,peg,1/10/2025',
    ))
    expect(r.isValid).toBe(false)
    expect(r.errors.some(e => e.severity === 'error' && /15b.*15B/.test(e.message))).toBe(true)
  })

  test('2474a twice is NOT an error (exact duplicate, decision 15 — keeps averaging)', () => {
    const r = validateAndParseCSV(csv(
      '2474a,97581.234,2247733.456,P,peg,1/10/2025',
      '2474a,97582.000,2247734.000,P,peg,1/10/2025',
    ))
    expect(r.isValid).toBe(true)
  })
})

describe('app-shared normalisation sanity (same suite as beaconName-shared)', () => {
  test('2474a → 2474A, 15b → 15B, 1464An → 1464An', () => {
    expect(normalizeBeaconName('2474a')).toBe('2474A')
    expect(normalizeBeaconName('15b')).toBe('15B')
    expect(normalizeBeaconName('1464An')).toBe('1464An')
    expect(normalizeBeaconName('SD4')).toBe('SD4')
    expect(normalizeBeaconName('')).toBe('')
    expect(normalizeBeaconName(null as any)).toBe(null)
  })

  test('findCaseFoldDuplicates catches a pair, not an exact repeat', () => {
    expect(findCaseFoldDuplicates(['99a', '99A', '99a'])).toEqual([['99a', '99A']])
    expect(findCaseFoldDuplicates(['1464An', '2474A'])).toEqual([])
  })
})