/**
 * Which beacons plot on top of each other, and therefore need an inset.
 *
 * Crowding is a fact about the PAPER, not the ground: 87D and 87DNew of
 * Brackenhurst Township are 0.061 m apart, which at 1:2000 is 0.03 mm -- the
 * two signs land inside the same dot and their names print over each other. The
 * same 0.061 m on a 1:50 detail would be 1.2 m of paper and perfectly legible.
 *
 * The test is whether two signs overlap by MORE THAN HALF: the smaller mark is
 * buried once the nearer centre sits inside the other mark. That is
 * d < max(rA, rB) -- at exactly the larger reach the overlap is half, not more
 * than half. At 1:2000 a found sign's 1.25 mm radius is 2.5 m, so a pair must
 * come within 2.5 m of each other to earn an inset (87D/87DNew at 0.061 m
 * clearly do); a trig pair must come within ~2.6 mm converted at the sheet's
 * scale, because the triangle reaches further than the found sign.
 *
 * Clustering is single-link: if A crowds B and B crowds C, all three share one
 * inset, because separating A from C alone would still leave B overlapping both.
 */

import { describe, test, expect } from '@jest/globals'
import { crowdedClusters } from '../crowdedBeacons.js'

/** The Brackenhurst beacons, as ground east/north. */
const brackenhurst = [
  { name: 'SD6', e: 85723.396, n: -2144076.451, symbol: 'peg' },
  { name: 'SD2', e: 85774.38, n: -2144120.22, symbol: 'peg' },
  { name: '87D', e: 85729.99, n: -2144164.80, symbol: 'found' },
  { name: '87DNew', e: 85729.942, n: -2144164.763, symbol: 'found' },
  { name: 'SD3', e: 85682.515, n: -2144117.414, symbol: 'peg' },
  { name: '87A', e: 85809.63, n: -2144070.74, symbol: 'rm' },
  { name: '87C', e: 85816.30, n: -2144078.19, symbol: 'rm' },
]

/** Paper radius of each sign, converted to ground metres at a scale. */
const radii = {
  found: 1.249,   // foundOuterDia / 2
  rm: 1.80,       // refMarkArm / 2
  peg: 1.249,     // placedDia / 2
  trig: 2.59,     // triReach
}
/** The cluster test at a paper scale: radius in ground metres. */
const atScale = (paperMm, scale) => (paperMm * scale) / 1000

describe('crowdedClusters', () => {
  test('finds the pair that plots inside one dot', () => {
    const radiusOf = (b) => atScale(radii[b.symbol], 2000)
    const clusters = crowdedClusters(brackenhurst, radiusOf)

    expect(clusters).toHaveLength(1)
    expect(clusters[0].map((b) => b.name).sort()).toEqual(['87D', '87DNew'])
  })

  test('leaves beacons that are merely near', () => {
    // 87A and 87C are 9.995 m apart; at 1:2000 an rm reach is 3.6 m, so the
    // signs do not overlap at all and both stay on the figure.
    const radiusOf = (b) => atScale(radii[b.symbol], 2000)
    const names = crowdedClusters(brackenhurst, radiusOf)
      .flat().map((b) => b.name)

    expect(names).not.toContain('87A')
    expect(names).not.toContain('87C')
  })

  test('catches them once the sheet is coarse enough to merge them', () => {
    // At 1:10000 an rm reach is 18 m, so 87A/87C at 9.995 m do bury each other.
    const radiusOf = (b) => atScale(radii[b.symbol], 10000)
    const clusters = crowdedClusters(brackenhurst, radiusOf)
    const names = clusters.flat().map((b) => b.name)

    expect(names).toContain('87A')
    expect(names).toContain('87C')
  })

  test('requires more than half overlap, not merely a touch', () => {
    // Two found signs (reach 2 m here) whose centres are 2.1 m apart just
    // graze; one sign's centre is still outside the other. At 1.9 m, one centre
    // sits inside the other and the pair reads as one blob.
    const radiusOf = () => 2
    const F = (name, d) => ({ name, symbol: 'found', e: 0, n: d })

    const grazing = crowdedClusters([F('A', 0), F('B', 2.1)], radiusOf)
    expect(grazing).toEqual([])

    const buried = crowdedClusters([F('A', 0), F('B', 1.9)], radiusOf)
    expect(buried).toHaveLength(1)
    expect(buried[0].map((b) => b.name).sort()).toEqual(['A', 'B'])
  })

  test('exactly half overlap does not crowd', () => {
    // At a centre distance exactly equal to the larger reach the overlap is
    // half a sign, and the rule is "more than half".
    const radiusOf = (b) => b.symbol === 'trig' ? 3 : 1.5
    const A = { name: 'A', symbol: 'found', e: 0, n: 0 }
    const B = { name: 'B', symbol: 'trig', e: 3, n: 0 }
    expect(crowdedClusters([A, B], radiusOf)).toEqual([])

    const C = { name: 'C', symbol: 'trig', e: 2.9, n: 0 }
    expect(crowdedClusters([A, C], radiusOf)).toHaveLength(1)
  })

  test('a small sign is crowded whenever the large one covers it', () => {
    // Half-overlap is judged against the larger sign: the peg's centre lies
    // inside the trig triangle's reach long before the trig grazes it.
    const radiusOf = (b) => b.symbol === 'trig' ? 3 : 1.5
    const trig = { name: 'T', symbol: 'trig', e: 0, n: 0 }
    const peg  = { name: 'P', symbol: 'peg', e: 2.5, n: 0 }

    const clusters = crowdedClusters([trig, peg], radiusOf)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].map((b) => b.name).sort()).toEqual(['P', 'T'])
  })

  test('joins a chain into one cluster, not two overlapping pairs', () => {
    // B crowds A and C; separating A from C alone would leave B over both.
    const chain = [
      { name: 'A', e: 0, n: 0, symbol: 'found' },
      { name: 'B', e: 1.0, n: 0, symbol: 'found' },
      { name: 'C', e: 2.0, n: 0, symbol: 'found' },
      { name: 'FAR', e: 100, n: 0, symbol: 'found' },
    ]

    const clusters = crowdedClusters(chain, () => 1.5)

    expect(clusters).toHaveLength(1)
    expect(clusters[0].map((b) => b.name)).toEqual(['A', 'B', 'C'])
  })

  test('separates genuinely distinct groups', () => {
    const two = [
      { name: 'A', e: 0, n: 0, symbol: 'found' },
      { name: 'B', e: 1, n: 0, symbol: 'found' },
      { name: 'Y', e: 500, n: 0, symbol: 'found' },
      { name: 'Z', e: 501, n: 0, symbol: 'found' },
    ]

    const clusters = crowdedClusters(two, () => 1.5)

    expect(clusters).toHaveLength(2)
    expect(clusters.map((c) => c.map((b) => b.name))).toEqual([['A', 'B'], ['Y', 'Z']])
  })

  test('handles exactly coincident beacons', () => {
    // Two observations recorded at the identical position: no enlargement can
    // ever separate them, which is why a detail inset is schematic.
    const clusters = crowdedClusters(
      [{ name: 'P', e: 10, n: 10, symbol: 'found' },
       { name: 'P_dupl', e: 10, n: 10, symbol: 'found' }],
      () => 4,
    )

    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toHaveLength(2)
  })

  test('reports nothing when every beacon stands clear', () => {
    // 87D and 87DNew are 0.061 m apart, so they crowd at every scale a plan is
    // ever drawn at -- separating them would take about 1:15. The no-cluster
    // case is a separation the threshold genuinely clears.
    const radiusOf = (b) => atScale(radii[b.symbol], 2000)
    // the crowded pair itself pulled apart, far beyond any reach
    const spread = brackenhurst.map((b) => b.name === '87DNew'
      ? { ...b, e: b.e + 100 } : b)
    expect(crowdedClusters(spread, radiusOf)).toEqual([])
    expect(crowdedClusters([], () => 8)).toEqual([])
    expect(crowdedClusters([{ name: 'A', e: 0, n: 0, symbol: 'found' }], () => 8)).toEqual([])
  })

  test('the crowded pair survives every scale a plan is drawn at', () => {
    for (const scale of [200, 500, 1000, 2000, 5000]) {
      const radiusOf = (b) => atScale(radii[b.symbol], scale)
      const names = crowdedClusters(brackenhurst, radiusOf)
        .flat().map((b) => b.name)
      expect(names).toContain('87D')
      expect(names).toContain('87DNew')
    }
  })

  test('is stable: same input, same order out', () => {
    const radiusOf = (b) => atScale(radii[b.symbol], 5000)
    const a = crowdedClusters(brackenhurst, radiusOf)
    const b = crowdedClusters([...brackenhurst].reverse(), radiusOf)

    expect(a.map((c) => c.map((x) => x.name))).toEqual(b.map((c) => c.map((x) => x.name)))
  })
})