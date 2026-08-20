import { describe, test, expect } from '@jest/globals'
import { chooseTickIntervalMetres, computeGridTickPositions, computeInwardTickBounds, computeConfinedTickGrid } from '../../../../app-shared/block-definitions.js'

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

describe('computeInwardTickBounds', () => {
  test('bounds already exact multiples of the interval are unchanged', () => {
    const result = computeInwardTickBounds({ aMin: 97400, aMax: 97700, bMin: 2247200, bMax: 2247400, intervalM: 100 })
    expect(result).toEqual({ aMin: 97400, aMax: 97700, bMin: 2247200, bMax: 2247400 })
  })

  test('rounds a real (non-round) figure extent INWARD, never past the true bounds', () => {
    // The reported case: Y 97367.95-97721.38 at a 100m interval.
    const result = computeInwardTickBounds({ aMin: 97367.95, aMax: 97721.38, bMin: 2247108.68, bMax: 2247429.80, intervalM: 100 })
    expect(result).toEqual({ aMin: 97400, aMax: 97700, bMin: 2247200, bMax: 2247400 })
    // Never exceeds the true extent.
    expect(result.aMin).toBeGreaterThanOrEqual(97367.95)
    expect(result.aMax).toBeLessThanOrEqual(97721.38)
    expect(result.bMin).toBeGreaterThanOrEqual(2247108.68)
    expect(result.bMax).toBeLessThanOrEqual(2247429.80)
  })

  test('falls back to the exact min/max when the figure is smaller than one interval', () => {
    // 97420-97480 at 100m interval: ceil(97420/100)*100=97500 > floor(97480/100)*100=97400 — no round multiple fits.
    const result = computeInwardTickBounds({ aMin: 97420, aMax: 97480, bMin: 2247150, bMax: 2247180, intervalM: 100 })
    expect(result).toEqual({ aMin: 97420, aMax: 97480, bMin: 2247150, bMax: 2247180 })
  })

  test('falls back when exactly ONE round multiple fits — a zero-extent range is not usable', () => {
    // Regression: the DXF minimal fixture's X axis is 2200000-2200060 at a
    // 100m interval. ceil(2200000/100)*100 === floor(2200060/100)*100 ===
    // 2200000, so inward rounding collapses the axis to zero extent. That is
    // not a valid grid: computeGridTickPositions turns a zero-extent axis into
    // a single LINE of crosses instead of a rectangle framing the figure,
    // silently dropping the whole opposite axis's labels. Needs the same
    // exact-bounds fallback as the narrower-than-one-interval case.
    const result = computeInwardTickBounds({ aMin: 2200000, aMax: 2200060, bMin: 50000, bMax: 50100, intervalM: 100 })
    expect(result.aMin).toBe(2200000)
    expect(result.aMax).toBe(2200060)
    expect(result.aMax).toBeGreaterThan(result.aMin)
    // The on-grid b axis still rounds normally.
    expect(result.bMin).toBe(50000)
    expect(result.bMax).toBe(50100)
  })

  test('each axis falls back independently — one axis on-grid, the other too narrow', () => {
    const result = computeInwardTickBounds({ aMin: 97400, aMax: 97700, bMin: 2247150, bMax: 2247180, intervalM: 100 })
    expect(result.aMin).toBe(97400)
    expect(result.aMax).toBe(97700)
    expect(result.bMin).toBe(2247150)
    expect(result.bMax).toBe(2247180)
  })
})

describe('GRID_NICE_NUMBERS includes 25 and 75', () => {
  test('a target that only 25m satisfies picks 25, not 10', () => {
    // 1:1000, target 26mm -> maxIntervalM = 26. Largest candidate <=26 in the
    // old ladder was 20; with 25 added, 25 <= 26 so it wins.
    expect(chooseTickIntervalMetres(1000, 26)).toBe(25)
  })

  test('a target that only 75m satisfies picks 75, not 50', () => {
    // 1:1000, target 76mm -> maxIntervalM = 76. Old ladder's largest <=76 was 50;
    // with 75 added, 75 <= 76 so it wins.
    expect(chooseTickIntervalMetres(1000, 76)).toBe(75)
  })

  test('existing scale/target combinations from the suite above are unaffected by the 25/75 insertion', () => {
    // Re-assert the four pre-existing chooseTickIntervalMetres cases directly —
    // confirms 25/75 didn't shift any value that used to resolve to 10/20/50/100/200/500.
    expect(chooseTickIntervalMetres(500)).toBe(100)
    expect(chooseTickIntervalMetres(1500)).toBe(200)
    expect(chooseTickIntervalMetres(2500)).toBe(500)
    expect(chooseTickIntervalMetres(500, 300)).toBe(100)
    expect(chooseTickIntervalMetres(1000, 300)).toBe(200)
  })
})

describe('computeConfinedTickGrid', () => {
  const ticksOn = (min, max, interval) => computeGridTickPositions({ aMin: min, aMax: max, bMin: 0, bMax: interval, intervalM: interval }).filter(p => p.b === 0).length

  test('keeps the ruler-safe interval when both axes already carry an intermediate tick', () => {
    // Y 50000-50500, X 2200000-2200420 at 1:1000 -> interval 200 gives
    // Y 50000/50200/50400 (3) and X 2200000/2200200/2200400 (3). No step-down.
    const g = computeConfinedTickGrid({ aMin: 50000, aMax: 50500, bMin: 2200000, bMax: 2200420, scaleDenominator: 1000 })
    expect(g.intervalM).toBe(200)
    expect(g).toEqual({ intervalM: 200, aMin: 50000, aMax: 50400, bMin: 2200000, bMax: 2200400 })
  })

  test('steps the interval down when inward rounding would leave an axis with only its 2 corners', () => {
    // The dxfGenerator integration fixture: Y 50000-50180, X 2200000-2200090
    // at 1:500. Interval 100 confines to Y 50000-50100 / X 2200000-2200090 —
    // 2 ticks per axis, i.e. corner crosses only, no ruler-checkable pair
    // between them. Stepping down restores a real grid.
    const g = computeConfinedTickGrid({ aMin: 50000, aMax: 50180, bMin: 2200000, bMax: 2200090, scaleDenominator: 500 })
    expect(g.intervalM).toBeLessThan(100)
    expect(ticksOn(g.aMin, g.aMax, g.intervalM)).toBeGreaterThanOrEqual(3)
    expect(ticksOn(g.bMin, g.bMax, g.intervalM)).toBeGreaterThanOrEqual(3)
  })

  test('step-down never breaks confinement — bounds stay inside the true extent', () => {
    const g = computeConfinedTickGrid({ aMin: 50000, aMax: 50180, bMin: 2200000, bMax: 2200090, scaleDenominator: 500 })
    expect(g.aMin).toBeGreaterThanOrEqual(50000)
    expect(g.aMax).toBeLessThanOrEqual(50180)
    expect(g.bMin).toBeGreaterThanOrEqual(2200000)
    expect(g.bMax).toBeLessThanOrEqual(2200090)
  })

  test('the originally-reported Shabani plan resolves to the range its spec expected', () => {
    // True extent measured off the shipped pre-fix DXF's drawn geometry.
    // At 1:1000 the ruler-safe pick is 200m, which confines to just
    // 97400/97600 — the spec's stated expectation is 97400-97700, which
    // only a 100m interval can produce.
    const g = computeConfinedTickGrid({ aMin: 97364.86, aMax: 97720.42, bMin: 2247103.54, bMax: 2247428.84, scaleDenominator: 1000 })
    expect(g.intervalM).toBe(100)
    expect(g.aMin).toBe(97400)
    expect(g.aMax).toBe(97700)
    expect(g.bMin).toBe(2247200)
    expect(g.bMax).toBe(2247400)
  })

  test('never steps down past the paper-readability floor, even if density is unreachable', () => {
    // A 12m figure at 1:500: no ladder rung can give 3 ticks per axis without
    // ticks landing a couple of mm apart on paper. Keep the coarse pick
    // rather than emitting a cluttered grid.
    const g = computeConfinedTickGrid({ aMin: 50000, aMax: 50012, bMin: 2200000, bMax: 2200012, scaleDenominator: 500 })
    const paperMm = (g.intervalM * 1000) / 500
    expect(paperMm).toBeGreaterThanOrEqual(25)
  })

  test('every resolved interval still respects the 30cm-ruler upper bound', () => {
    for (const scale of [250, 500, 1000, 1500, 2500, 5000]) {
      const g = computeConfinedTickGrid({ aMin: 50000, aMax: 50500, bMin: 2200000, bMax: 2200420, scaleDenominator: scale })
      expect((g.intervalM * 1000) / scale).toBeLessThanOrEqual(250)
    }
  })
})
