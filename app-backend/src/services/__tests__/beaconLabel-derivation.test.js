/**
 * Part 4 suffix-derivation sites — the shared label rule (`app-shared/beaconName.js`)
 * against the two pure fallback derivations. Run:
 * cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js beaconLabel-derivation
 */
import { describe, test, expect } from '@jest/globals'
import { fallbackBeaconLabel } from '../dxfGenerator.js'
import { splitBeaconName, normalizeBeaconName, labelParts } from '../../../../app-shared/beaconName.js'

describe('shared rule (surface, so a site break is visible in its own suite)', () => {
  test('2474a → suffix A; 1464An → suffix An; SD4 → no prefix', () => {
    expect(labelParts('2474a')).toEqual({ prefix: '2474', suffix: 'A' })
    expect(labelParts('1464An')).toEqual({ prefix: '1464', suffix: 'An' })
    expect(labelParts('2474AB')).toEqual({ prefix: '2474', suffix: 'AB' })
    expect(labelParts('SD4')).toBeNull()
    expect(labelParts('2474A1')).toBeNull() // trailing digit is not a suffix
    expect(labelParts('')).toBeNull()
  })
  test('normalizeBeaconName only uppercases an ALL-lowercase suffix', () => {
    expect(normalizeBeaconName('2474a')).toBe('2474A')
    expect(normalizeBeaconName('1464An')).toBe('1464An')
    expect(normalizeBeaconName('2474A')).toBe('2474A')
  })
})

describe('fallbackBeaconLabel (site #3, extracted)', () => {
  test('2474a on stand 2474 → suffix A INSIDE the stand', () => {
    const result = fallbackBeaconLabel('2474a', prefix => (prefix === '2474' ? { stand: '2474' } : null))
    expect(result).toEqual({ text: 'A', isInsideParcel: true, polygon: { stand: '2474' } })
  })

  test('1464An on stand 1464 → suffix An INSIDE the stand (mixed-case preserved)', () => {
    const result = fallbackBeaconLabel('1464An', prefix => (prefix === '1464' ? { stand: '1464' } : null))
    expect(result?.text).toBe('An')
    expect(result?.isInsideParcel).toBe(true)
  })

  test('2474AB on stand 2474 → suffix AB INSIDE', () => {
    const result = fallbackBeaconLabel('2474AB', prefix => (prefix === '2474' ? {} : null))
    expect(result?.text).toBe('AB')
    expect(result?.isInsideParcel).toBe(true)
  })

  test('numeric-prefix name with no matching stand → full name OUTSIDE', () => {
    const result = fallbackBeaconLabel('2474a', () => null)
    expect(result).toEqual({ text: '2474a', isInsideParcel: false, polygon: null })
  })

  test('letter-only name (SD4) → full name OUTSIDE, untouched', () => {
    const result = fallbackBeaconLabel('SD4', () => null)
    expect(result).toEqual({ text: 'SD4', isInsideParcel: false, polygon: null })
  })

  test('empty/undefined is safe', () => {
    expect(fallbackBeaconLabel('', () => null).text).toBe('')
    expect(fallbackBeaconLabel(undefined, () => null).text).toBeUndefined()
  })
})