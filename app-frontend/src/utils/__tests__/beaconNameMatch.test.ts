import { describe, it, expect } from 'vitest'
import {
  isGenericFallbackName,
  findBeaconNameBySpatialMatch,
  resolveBeaconNameForPoint,
} from '../beaconNameMatch'

describe('isGenericFallbackName', () => {
  it('flags known generic/placeholder patterns', () => {
    expect(isGenericFallbackName('PEGGINGA')).toBe(true)
    expect(isGenericFallbackName('STANDB')).toBe(true)
    expect(isGenericFallbackName('P1')).toBe(true)
    expect(isGenericFallbackName('A')).toBe(true)
    expect(isGenericFallbackName('POINT3')).toBe(true)
    expect(isGenericFallbackName('BEACON7')).toBe(true)
    expect(isGenericFallbackName('')).toBe(true)
  })
  it('does not flag a real beacon name', () => {
    expect(isGenericFallbackName('1620a')).toBe(false)
    expect(isGenericFallbackName('10b')).toBe(false)
  })
})

describe('findBeaconNameBySpatialMatch', () => {
  const points = [
    { name: '1620a', y: 100, x: 200 },
    { name: '1620b', y: 150, x: 250 },
  ]
  it('returns the coordinate point within tolerance (2 m)', () => {
    expect(findBeaconNameBySpatialMatch(100.5, 200.5, points)).toBe('1620a')
  })
  it('returns null when nothing is within tolerance and not a generic fallback', () => {
    expect(findBeaconNameBySpatialMatch(500, 600, points)).toBeNull()
  })
  it('uses the extended 10 m tolerance only when isGenericFallback is true', () => {
    // ~8.49 m from 1620a — outside 2 m, inside 5x=10 m extended tolerance.
    expect(findBeaconNameBySpatialMatch(106, 206, points, true)).toBe('1620a')
    expect(findBeaconNameBySpatialMatch(106, 206, points, false)).toBeNull()
  })
})

describe('resolveBeaconNameForPoint', () => {
  const coordinatePoints = [{ name: '1620a', y: 100, x: 200 }]
  it('prefers the point own id/name when not generic', () => {
    expect(resolveBeaconNameForPoint({ id: '1620a', y: 999, x: 999 }, coordinatePoints)).toBe('1620a')
  })
  it('spatially resolves when own name is generic', () => {
    expect(resolveBeaconNameForPoint({ id: 'A', y: 100.2, x: 200.2 }, coordinatePoints)).toBe('1620a')
  })
  it('falls back to the own (generic) name when no spatial match is found', () => {
    expect(resolveBeaconNameForPoint({ id: 'A', y: 9000, x: 9000 }, coordinatePoints)).toBe('A')
  })
  it('returns null when there is no own name and no match', () => {
    expect(resolveBeaconNameForPoint({ y: 9000, x: 9000 }, coordinatePoints)).toBeNull()
  })
})
