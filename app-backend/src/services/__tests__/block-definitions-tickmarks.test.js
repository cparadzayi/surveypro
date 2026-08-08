import { describe, test, expect } from '@jest/globals'
import { chooseTickIntervalMetres, computeGridTickPositions } from '../../../../app-shared/block-definitions.js'

describe('chooseTickIntervalMetres', () => {
  test('1:500 scale picks 100m (200mm paper spacing)', () => {
    expect(chooseTickIntervalMetres(500)).toBe(100)
  })

  test('1:1500 scale picks 200m (133mm paper spacing)', () => {
    expect(chooseTickIntervalMetres(1500)).toBe(200)
  })

  test('1:2500 scale picks 500m (200mm paper spacing)', () => {
    expect(chooseTickIntervalMetres(2500)).toBe(500)
  })

  test('every returned interval keeps paper spacing at or under the target', () => {
    for (const scale of [250, 500, 750, 1000, 1250, 1500, 2000, 2500, 5000, 10000]) {
      const interval = chooseTickIntervalMetres(scale)
      const paperMm = (interval * 1000) / scale
      expect(paperMm).toBeLessThanOrEqual(250)
    }
  })

  test('respects a custom targetPaperMm', () => {
    // At 1:500, 300mm target allows up to 150m; largest nice number <=150 is 100.
    expect(chooseTickIntervalMetres(500, 300)).toBe(100)
    // At 1:1000, 300mm target allows up to 300m; largest nice number <=300 is 200.
    expect(chooseTickIntervalMetres(1000, 300)).toBe(200)
  })
})

describe('computeGridTickPositions', () => {
  test('a 200x200 extent at 100m interval produces 8 unique perimeter points', () => {
    const points = computeGridTickPositions({ aMin: 50000, aMax: 50200, bMin: 2200000, bMax: 2200200, intervalM: 100 })
    // a-values: 50000, 50100, 50200 (3); b-values: 2200000, 2200100, 2200200 (3)
    // top/bottom edges (a varies, b fixed at bMin/bMax): 3 + 3 = 6
    // left/right edges (b varies, a fixed at aMin/aMax): 3 + 3 = 6
    // minus 4 shared corners = 8 unique points
    expect(points).toHaveLength(8)
    const keys = new Set(points.map(p => `${p.a},${p.b}`))
    expect(keys.size).toBe(8) // no duplicates
  })

  test('includes all 4 corners', () => {
    const points = computeGridTickPositions({ aMin: 0, aMax: 200, bMin: 0, bMax: 200, intervalM: 100 })
    const has = (a, b) => points.some(p => p.a === a && p.b === b)
    expect(has(0, 0)).toBe(true)
    expect(has(0, 200)).toBe(true)
    expect(has(200, 0)).toBe(true)
    expect(has(200, 200)).toBe(true)
  })

  test('extent narrower than one interval collapses to just the 4 corners', () => {
    const points = computeGridTickPositions({ aMin: 0, aMax: 40, bMin: 0, bMax: 40, intervalM: 100 })
    expect(points).toHaveLength(4)
  })

  test('no duplicate points when a and b ranges are unequal', () => {
    const points = computeGridTickPositions({ aMin: 0, aMax: 370, bMin: 0, bMax: 250, intervalM: 100 })
    const keys = points.map(p => `${p.a},${p.b}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
