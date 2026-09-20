/**
 * Which beacons plot on top of each other, and therefore need an inset.
 *
 * Crowding is a fact about the PAPER, not the ground. 87D and 87DNew of
 * Brackenhurst Township are 0.061 m apart, which at 1:2000 is 0.03 mm -- the
 * two signs land inside the same dot and their names print over each other. The
 * same 0.061 m on a 1:50 detail would be 1.2 m of paper and perfectly legible.
 *
 * So the test is separation against a paper distance converted to ground at the
 * sheet's own scale. At 1:2000 a 4 mm threshold is 8 m on the ground, which
 * catches 87D/87DNew and correctly leaves 87A and 87C alone at 9.995 m.
 *
 * Clustering is single-link: if A crowds B and B crowds C, all three share one
 * inset, because separating A from C alone would still leave B overlapping both.
 */

import { describe, test, expect } from '@jest/globals'
import { crowdedClusters, INSET_CROWD_MM } from '../crowdedBeacons.js'

/** The Brackenhurst beacons, as ground east/north. */
const brackenhurst = [
  { name: 'SD6', e: 85723.396, n: -2144076.451 },
  { name: 'SD2', e: 85774.38, n: -2144120.22 },
  { name: '87D', e: 85729.99, n: -2144164.80 },
  { name: '87DNew', e: 85729.942, n: -2144164.763 },
  { name: 'SD3', e: 85682.515, n: -2144117.414 },
  { name: '87A', e: 85809.63, n: -2144070.74 },
  { name: '87C', e: 85816.30, n: -2144078.19 },
]

/** Ground metres for a paper distance at a given scale denominator. */
const groundMm = (paperMm, scale) => (paperMm * scale) / 1000

describe('crowdedClusters', () => {
  test('finds the pair that plots inside one dot', () => {
    const clusters = crowdedClusters(brackenhurst, groundMm(INSET_CROWD_MM, 2000))

    expect(clusters).toHaveLength(1)
    expect(clusters[0].map((b) => b.name).sort()).toEqual(['87D', '87DNew'])
  })

  test('leaves beacons that are merely close', () => {
    // 87A and 87C are 9.995 m apart: 5 mm at 1:2000, which reads perfectly well.
    const names = crowdedClusters(brackenhurst, groundMm(INSET_CROWD_MM, 2000))
      .flat().map((b) => b.name)

    expect(names).not.toContain('87A')
    expect(names).not.toContain('87C')
  })

  test('catches them once the sheet is coarse enough to merge them', () => {
    // At 1:5000 the 4 mm threshold is 20 m, and 87A/87C at 9.995 m do collide.
    const clusters = crowdedClusters(brackenhurst, groundMm(INSET_CROWD_MM, 5000))
    const names = clusters.flat().map((b) => b.name)

    expect(names).toContain('87A')
    expect(names).toContain('87C')
  })

  test('joins a chain into one cluster, not two overlapping pairs', () => {
    // B crowds A and C; separating A from C alone would leave B over both.
    const chain = [
      { name: 'A', e: 0, n: 0 },
      { name: 'B', e: 3, n: 0 },
      { name: 'C', e: 6, n: 0 },
      { name: 'FAR', e: 100, n: 0 },
    ]

    const clusters = crowdedClusters(chain, 4)

    expect(clusters).toHaveLength(1)
    expect(clusters[0].map((b) => b.name)).toEqual(['A', 'B', 'C'])
  })

  test('separates genuinely distinct groups', () => {
    const two = [
      { name: 'A', e: 0, n: 0 },
      { name: 'B', e: 1, n: 0 },
      { name: 'Y', e: 500, n: 0 },
      { name: 'Z', e: 501, n: 0 },
    ]

    const clusters = crowdedClusters(two, 4)

    expect(clusters).toHaveLength(2)
    expect(clusters.map((c) => c.map((b) => b.name))).toEqual([['A', 'B'], ['Y', 'Z']])
  })

  test('handles exactly coincident beacons', () => {
    // Two observations recorded at the identical position: no enlargement can
    // ever separate them, which is why a detail inset is schematic.
    const clusters = crowdedClusters(
      [{ name: 'P', e: 10, n: 10 }, { name: 'P_dupl', e: 10, n: 10 }],
      4,
    )

    expect(clusters).toHaveLength(1)
    expect(clusters[0]).toHaveLength(2)
  })

  test('reports nothing when every beacon stands clear', () => {
    // 87D and 87DNew are 0.061 m apart, so they crowd at every scale a plan is
    // ever drawn at -- separating them would take about 1:15. The no-cluster
    // case is a separation the threshold genuinely clears.
    expect(crowdedClusters(brackenhurst, 0.01)).toEqual([])
    expect(crowdedClusters([], 8)).toEqual([])
    expect(crowdedClusters([{ name: 'A', e: 0, n: 0 }], 8)).toEqual([])
  })

  test('the crowded pair survives every scale a plan is drawn at', () => {
    for (const scale of [200, 500, 1000, 2000, 5000]) {
      const names = crowdedClusters(brackenhurst, groundMm(INSET_CROWD_MM, scale))
        .flat().map((b) => b.name)
      expect(names).toContain('87D')
      expect(names).toContain('87DNew')
    }
  })

  test('is stable: same input, same order out', () => {
    const a = crowdedClusters(brackenhurst, groundMm(INSET_CROWD_MM, 5000))
    const b = crowdedClusters([...brackenhurst].reverse(), groundMm(INSET_CROWD_MM, 5000))

    expect(a.map((c) => c.map((x) => x.name))).toEqual(b.map((c) => c.map((x) => x.name)))
  })
})
