/**
 * The Report on Survey's found-beacons paragraph agrees with the Beacon Comparison: when the comparison of
 * co-ordinates could not decide, it does not say the positions were accepted.
 */
import { describe, it, expect } from 'vitest'
import { buildFoundBeaconsNarrative } from '../beaconAcceptanceNarrative'

const SUMMARY = 'SI 727 s.67(5) comparison of co-ordinates, class B: Second Schedule para 7(5) on every line between the found beacons'
const report = (rows: [string, number, number, number, number][]) => ({
  beacons: rows.map(([beaconId, yH, xH, yS, xS]) => ({
    beaconId, status: 'found', adopted: true,
    originalData: { coordinates: { y: yH, x: xH } }, currentCoordinates: { y: yS, x: xS },
  })),
  beaconComparison: { method: 'tabulation', checkMethod: 'coords', surveyClass: 'B', adjustmentSummary: SUMMARY },
}) as any

// Original data in a local system on another scale (22 Nov 2026): every line fails para 7(5).
const LOCAL: [string, number, number, number, number][] = [
  ['40', 7047.618, 3891.003, -85264.744, 2140365.502], ['FS2', 8539.025, 2859.112, -86750.198, 2141403.6],
  ['o', 4800.25, -923.416, -83032.998, 2145135.852], ['n', 4203.845, 1047.23, -82440.018, 2143157.201],
]
const RING: [string, number, number, number, number][] = [
  ['A', 50000, 2200500, 50000.005, 2200500.004], ['B', 50100, 2200500, 50100, 2200500.006],
  ['C', 50100, 2200600, 50100.008, 2200600.002], ['D', 50000, 2200600, 50000.003, 2200600.003],
]

describe('found beacons after a comparison of co-ordinates', () => {
  it('does not call the positions accepted when the disagreement runs through the network', () => {
    const n = buildFoundBeaconsNarrative(report(LOCAL))
    expect(n.comparisonSentence).toMatch(/did not resolve/)
    expect(n.comparisonSentence).toMatch(/not yet accepted/)
    expect(n.fullText).not.toMatch(/were accepted/)
    expect(n.adoptionSentence).toMatch(/No coordinates are adopted/)
  })

  it('still accepts a network that agrees with the original data', () => {
    const n = buildFoundBeaconsNarrative(report(RING))
    expect(n.comparisonSentence).toBe('After comparison, positions of all the found beacons/stations were accepted after the comparison of coordinates.')
    expect(n.adoptionSentence).toMatch(/were adopted as final coordinates/)
  })

  it('names the two ends of a lone failing line as undecided and accepts the rest', () => {
    const rows: [string, number, number, number, number][] = [
      ['P', 50000, 2200000, 50000, 2200000], ['Q', 50020, 2200000, 50020.2, 2200000],
      ['R', 51000, 2201000, 51000, 2201000], ['S', 51000, 2199000, 51000, 2199000],
    ]
    const n = buildFoundBeaconsNarrative(report(rows))
    expect(n.comparisonSentence).toMatch(/positions of R and S were accepted/)
    expect(n.comparisonSentence).toMatch(/The line P - Q exceeds SI 727 Second Schedule para 7\(5\); which of P and Q moved/)
  })
})
