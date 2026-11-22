/**
 * The comparison of co-ordinates (SI 727 s.67(5), judged by Second Schedule para 7(5) on the lines): a beacon is
 * set aside only when the lines among the OTHERS then pass. Against a local system on another scale every line
 * failed; the rule used to set one beacon aside anyway and claim the rest agreed.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js coordinateComparison67
 */
import { describe, test, expect } from '@jest/globals'
import { compareCoordinates67, comparisonConclusion } from '../../../../app-shared/coordinateComparison67.js'

// From the comparison report of 22 Nov 2026: original data in a local system, survey in Lo 29.
const LOCAL = [
  { name: '40', yH: 7047.618, xH: 3891.003, yS: -85264.744, xS: 2140365.502 },
  { name: 'FS2', yH: 8539.025, xH: 2859.112, yS: -86750.198, xS: 2141403.600 },
  { name: 'o', yH: 4800.250, xH: -923.416, yS: -83032.998, xS: 2145135.852 },
  { name: 'n', yH: 4203.845, xH: 1047.230, yS: -82440.018, xS: 2143157.201 },
]

// A clean ring a few centimetres off, all lines comfortably within para 7(5).
const RING = [
  { name: 'A', yH: 50000, xH: 2200500, yS: 50000.005, xS: 2200500.004 },
  { name: 'B', yH: 50100, xH: 2200500, yS: 50100.000, xS: 2200500.006 },
  { name: 'C', yH: 50100, xH: 2200600, yS: 50100.008, xS: 2200600.002 },
  { name: 'D', yH: 50000, xH: 2200600, yS: 50000.003, xS: 2200600.003 },
  { name: 'E', yH: 50050, xH: 2200550, yS: 50050.001, xS: 2200550.005 },
]

describe('disagreement through the whole network', () => {
  test('sets no beacon aside, says so, and does not claim the others agree', () => {
    const r = compareCoordinates67(LOCAL, 'B')
    expect(r.linesFailing).toBe(6)
    expect(r.networkWide).toBe(true)
    expect(r.setAside).toEqual([])
    expect(r.beacons.every((b) => !b.setAside)).toBe(true)
    const c = comparisonConclusion(r)
    expect(c).toMatch(/disagreement runs through the network/)
    expect(c).toMatch(/no beacon is singled out/)
    expect(c).not.toMatch(/I adopt/)
  })

  test('recognises that the original data are in another co-ordinate system', () => {
    expect(compareCoordinates67(LOCAL, 'B').otherSystem).toBe(true)
    expect(compareCoordinates67(RING, 'B').otherSystem).toBe(false)
  })
})

describe('one moved beacon is still singled out', () => {
  test('a beacon moved 0.15 m is set aside, the others then agree', () => {
    const moved = RING.map((p) => (p.name === 'B' ? { ...p, yS: p.yS + 0.15, xS: p.xS + 0.12 } : p))
    const r = compareCoordinates67(moved, 'B')
    expect(r.setAside).toEqual(['B'])
    expect(r.networkWide).toBe(false)
    expect(comparisonConclusion(r)).toMatch(/except B, whose distances/)
  })

  test('a clean network sets nothing aside and is not network-wide', () => {
    const r = compareCoordinates67(RING, 'B')
    expect(r.linesFailing).toBe(0)
    expect(r.networkWide).toBe(false)
    expect(comparisonConclusion(r)).toBe('From the above comparison, I adopt the positions of all found beacons.')
  })
})
