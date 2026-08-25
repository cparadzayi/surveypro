import { describe, it, expect } from 'vitest'
import { f3s, iterativeAdjust, mergeExcludedBeacons, SAMPLE_DATA } from '../surveyMath'

describe('f3s', () => {
  it('formats a positive number with an explicit + sign and 3 decimals', () => {
    expect(f3s(0.0495)).toBe('+0.050')
  })

  it('formats a negative number with a - sign and 3 decimals', () => {
    expect(f3s(-0.0014)).toBe('-0.001')
  })

  it('formats exactly zero with a + sign, matching the existing f4s convention', () => {
    expect(f3s(0)).toBe('+0.000')
  })

  it('returns an em dash for non-numbers, matching f3/f4/f4s', () => {
    expect(f3s(undefined as unknown as number)).toBe('—')
    expect(f3s(null as unknown as number)).toBe('—')
  })
})

/**
 * When a beacon is condemned by the Second Schedule it is held out of the Helmert fit
 * entirely, so the reported transformation, residuals and LOO describe only the beacons
 * actually accepted. It still has to reappear in the schedule and on the sketch — its
 * failing rays are the evidence for rejecting it — shaped exactly like a beacon the
 * W-test itself threw out.
 */
describe('mergeExcludedBeacons', () => {
  const held = SAMPLE_DATA.filter((p) => p.name === 'BM 004')
  const kept = SAMPLE_DATA.filter((p) => p.name !== 'BM 004')
  const fit = () => iterativeAdjust(kept, 2.576, 0.01)

  it('brings the held-out beacon back as a REJECT carrying the given source', () => {
    const merged = mergeExcludedBeacons(fit(), held, 'si727')
    const bm4 = merged.pts.find((p) => p.name === 'BM 004')
    expect(bm4.finalStatus).toBe('REJECT')
    expect(bm4.rejSource).toBe('si727')
  })

  it('shapes it with the same fields the adjustment gives its own rejects', () => {
    const merged = mergeExcludedBeacons(fit(), held, 'si727')
    const bm4 = merged.pts.find((p) => p.name === 'BM 004')
    for (const field of ['dY', 'dX', 'rawDist', 'rawBrg', 'yT', 'xT', 'tvY', 'tvX', 'tResid', 'tBrg'])
      expect(bm4[field], `missing ${field}`).toBeTypeOf('number')
    // Its transformed position comes from the fit it was excluded from, and the residual
    // is the distance between that and where the survey actually found it.
    expect(bm4.tResid).toBeCloseTo(Math.hypot(bm4.yT - bm4.yS, bm4.xT - bm4.xS), 9)
    // SAMPLE_DATA plants a ~0.25 m southing blunder in BM 004; holding it out must expose it.
    expect(bm4.tResid).toBeGreaterThan(0.2)
  })

  it('restores the caller\'s original beacon order by id', () => {
    const merged = mergeExcludedBeacons(fit(), held, 'si727')
    expect(merged.pts.map((p) => p.id)).toEqual(SAMPLE_DATA.map((p) => p.id))
  })

  it('leaves the beacons that were in the fit untouched', () => {
    const before = fit()
    const merged = mergeExcludedBeacons(before, held, 'si727')
    for (const p of before.pts)
      expect(merged.pts.find((q) => q.id === p.id)).toEqual(p)
  })

  it('returns the result unchanged when nothing was held out', () => {
    const before = fit()
    expect(mergeExcludedBeacons(before, [], 'si727')).toEqual(before)
  })

  it('passes an errored adjustment straight through', () => {
    const failed = { error: 'Too few active points remaining for adjustment', pts: [] }
    expect(mergeExcludedBeacons(failed, held, 'si727')).toEqual(failed)
  })
})
