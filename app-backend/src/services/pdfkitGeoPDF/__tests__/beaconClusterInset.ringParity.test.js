import { describe, test, expect } from '@jest/globals'
import { fitIndicatorRing } from '../beaconClusterInset.js'
import { fitIndicatorRingReference } from './helpers/fitIndicatorRingReference.js'

/**
 * fitIndicatorRing now measures each label and circle once per ring centre and answers "is this radius
 * clear" and "how many does it cut" from sorted intervals. The ring it returns must be exactly the one
 * the per-radius search returned: centre, radius, clear flag and cut count, ties included, because a
 * different ring would move inset marks on a legal plan.
 */
function rng(seed) { let t = seed; return () => ((t = (t * 1664525 + 1013904223) % 4294967296) / 4294967296) }

function scene(seed, { labels, beacons, cluster, grid }) {
  const rnd = rng(seed)
  const snap = (v) => (grid ? Math.round(v / grid) * grid : v)
  const cx = 100 + snap(rnd() * 20), cy = 80 + snap(rnd() * 20)
  const pts = Array.from({ length: cluster }, () => ({ x: cx + snap((rnd() - 0.5) * 24), y: cy + snap((rnd() - 0.5) * 16) }))
  return {
    cx, cy, cluster: pts, beaconRadius: 2.15,
    otherBeacons: Array.from({ length: beacons }, () => ({ x: cx + snap((rnd() - 0.5) * 160), y: cy + snap((rnd() - 0.5) * 120) })),
    rects: Array.from({ length: labels }, () => ({
      x: cx + snap((rnd() - 0.5) * 180), y: cy + snap((rnd() - 0.5) * 140), width: snap(4 + rnd() * 30) || 4, height: snap(3 + rnd() * 8) || 3,
    })),
  }
}

const OPTIONS = [
  ['defaults', {}],
  ['soft beacons', { softBeacons: true }],
  ['wide reach and offsets', { reach: 70, offsets: [1.5, 3, 5, 8, 12, 16] }],
  ['least cut', { leastCut: true, minR: 20 }],
  ['soft, wide, least cut (the last resort in the renderer)', { softBeacons: true, reach: 70, offsets: [1.5, 3, 5, 8, 12, 16], leastCut: true, minR: 30 }],
  ['a different gap', { gap: 0.7, leastCut: true }],
]
const SCENES = [
  ['sparse', { labels: 12, beacons: 8, cluster: 3, grid: 0 }],
  ['dense', { labels: 120, beacons: 80, cluster: 5, grid: 0 }],
  ['dense on a grid, so distances tie', { labels: 150, beacons: 100, cluster: 4, grid: 5 }],
  ['one beacon, nothing around', { labels: 0, beacons: 0, cluster: 1, grid: 0 }],
]

describe('fitIndicatorRing (intervals) equals the per-radius search', () => {
  for (const [sceneName, sc] of SCENES) {
    for (const [optName, opts] of OPTIONS) {
      test(`${sceneName}, ${optName}`, () => {
        // The reference is slow on a dense scene (that is why it was replaced), so fewer seeds there.
        const seeds = sc.labels > 50 ? 4 : 12
        for (let seed = 1; seed <= seeds; seed++) {
          const args = { ...scene(seed * 31 + 7, sc), ...opts }
          expect(fitIndicatorRing(args)).toEqual(fitIndicatorRingReference(args))
        }
      })
    }
  }

  test('the comparison saw rings that are clear and rings that are not', () => {
    let clear = 0, notClear = 0
    for (let seed = 1; seed <= 12; seed++) {
      if (fitIndicatorRing(scene(seed * 31 + 7, SCENES[0][1])).clear) clear++      // sparse
      if (!fitIndicatorRing({ ...scene(seed * 31 + 7, SCENES[2][1]), leastCut: true }).clear) notClear++   // dense, on a grid
    }
    expect(clear).toBeGreaterThan(0)
    expect(notClear).toBeGreaterThan(0)
  })
})
