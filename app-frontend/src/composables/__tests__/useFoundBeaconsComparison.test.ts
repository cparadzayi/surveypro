import { describe, it, expect } from 'vitest'
import {
  buildFoundBeacons, buildComparisonConfig, toHistoricalRows, pointsFromExistingBeacons,
} from '../useFoundBeaconsComparison'

const points = [
  { id: 1, name: '86B', yH: -85728.77, xH: 2143972.22, yS: -85728.70, xS: 2143972.14 },
  { id: 2, name: '87A', yH: -85809.70, xH: 2144070.83, yS: -85809.64, xS: 2144070.74 },
]
const result = {
  pts: [
    { id: 1, name: '86B', finalStatus: 'ACCEPT' as const },
    { id: 2, name: '87A', finalStatus: 'REJECT' as const },
  ],
}

describe('buildFoundBeacons', () => {
  it('maps each point to a FoundBeacon with both coordinate pairs and a coordinate-derived discrepancy', () => {
    const beacons = buildFoundBeacons(points, result)
    expect(beacons).toHaveLength(2)
    expect(beacons[0]).toMatchObject({
      beaconId: '86B',
      status: 'found',
      originalData: { coordinates: { y: -85728.77, x: 2143972.22 }, source: 'previous-survey' },
      currentCoordinates: { y: -85728.70, x: 2143972.14 },
      adopted: true,
    })
    // discrepancy distance = hypot(yS-yH, xS-xH)
    expect(beacons[0].discrepancy!.distance).toBeCloseTo(Math.hypot(0.07, -0.08), 6)
    expect(beacons[0].discrepancy!.withinTolerance).toBe(true)
    // Rejected point: adopted false, withinTolerance false
    expect(beacons[1].adopted).toBe(false)
    expect(beacons[1].discrepancy!.withinTolerance).toBe(false)
  })

  it('normalises beaconId to the project beacon casing when a name matches (case-insensitive)', () => {
    const beacons = buildFoundBeacons(points, result, [{ beaconId: '86b' }, { beaconId: 'ZZ' }])
    expect(beacons[0].beaconId).toBe('86b')  // matched project casing
    expect(beacons[1].beaconId).toBe('87A')  // unmatched → keep CSV name
  })
})

describe('buildComparisonConfig', () => {
  it('produces a tabulation config with default tolerance and an all-adopted conclusion', () => {
    const cfg = buildComparisonConfig(points, { pts: [
      { id: 1, name: '86B', finalStatus: 'ACCEPT' as const },
      { id: 2, name: '87A', finalStatus: 'ACCEPT' as const },
    ] })
    expect(cfg.method).toBe('tabulation')
    expect(cfg.toleranceThreshold).toBeCloseTo(0.02, 6)
    expect(cfg.currentSRNumber).toBe('')  // parent overrides
    expect(cfg.conclusion).toMatch(/adopt the positions of all found beacons/i)
    expect(cfg.adjustmentSummary).toMatch(/Helmert least-squares.*W-test/i)
  })

  it('describes rejects as W-test outliers (not "exceeded tolerance") and honours explicit tolerance/method', () => {
    const cfg = buildComparisonConfig(points, result, { method: 'both', toleranceThreshold: 0.2 })
    expect(cfg.method).toBe('both')
    expect(cfg.toleranceThreshold).toBe(0.2)
    expect(cfg.conclusion).toMatch(/87A/)
    expect(cfg.conclusion).toMatch(/W-test/i)
    expect(cfg.conclusion).not.toMatch(/exceeded tolerance/i)
  })

  it('includes the posteriori σ₀ in the adjustment summary when the result carries it', () => {
    const cfg = buildComparisonConfig(points, {
      pts: [{ id: 1, name: '86B', finalStatus: 'ACCEPT' as const }],
      adj: { stats: { s0: 0.0123 } },
    })
    expect(cfg.adjustmentSummary).toMatch(/0\.0123 m/)
  })
})

describe('toHistoricalRows', () => {
  it('maps to {Point, Y:Hist_Y, X:Hist_X} strings for the DB import', () => {
    expect(toHistoricalRows(points)).toEqual([
      { Point: '86B', Y: '-85728.77', X: '2143972.22' },
      { Point: '87A', Y: '-85809.7', X: '2144070.83' },
    ])
  })
})

describe('pointsFromExistingBeacons', () => {
  it('reconstructs store rows from saved beacons carrying both coordinate pairs', () => {
    const existing = [
      { beaconId: '86B', originalData: { coordinates: { y: -85728.77, x: 2143972.22 } }, currentCoordinates: { y: -85728.70, x: 2143972.14 } },
      { beaconId: 'noHist', currentCoordinates: { y: 1, x: 2 } }, // dropped: no originalData
    ]
    const rows = pointsFromExistingBeacons(existing as any)
    expect(rows).toEqual([{ name: '86B', yH: -85728.77, xH: 2143972.22, yS: -85728.70, xS: 2143972.14 }])
  })
})

describe('buildComparisonConfig — edgeCompliance carry-through', () => {
  const edgeRow = {
    from: '86B', to: '87A', dH: 67.19, dS: 67.21, dDiff: 0.02, dAllow: 0.05, distOk: true,
    brgH: 130.5, brgS: 130.502, dirDiffSec: 7.2, swingResidSec: 7.2, dirAllowSec: 45.0, dirOk: true, pass: true,
  }
  const edgeSummary = {
    totalLines: 1, distPass: 1, dirPass: 1, bothPass: 1, meanScale: 1.0003,
    sigma0: 0.02, posLimit: 0.049, lmed: 100, networkSwingDeg: 0.002, networkSwingSec: 7.2, networkSwingWarn: false,
  }

  it('populates edgeCompliance from result.edges + result.surveyClass when present', () => {
    const cfg = buildComparisonConfig(points, {
      pts: [{ id: 1, name: '86B', finalStatus: 'ACCEPT' as const }, { id: 2, name: '87A', finalStatus: 'ACCEPT' as const }],
      edges: { rows: [edgeRow], summary: edgeSummary },
      surveyClass: 'B',
    })
    expect(cfg.edgeCompliance).toEqual({ surveyClass: 'B', rows: [edgeRow], summary: edgeSummary })
  })

  it('omits edgeCompliance when result has no edges', () => {
    const cfg = buildComparisonConfig(points, {
      pts: [{ id: 1, name: '86B', finalStatus: 'ACCEPT' as const }],
    })
    expect(cfg.edgeCompliance).toBeUndefined()
  })

  it('omits edgeCompliance when result is null', () => {
    const cfg = buildComparisonConfig(points, null)
    expect(cfg.edgeCompliance).toBeUndefined()
  })
})

describe('buildComparisonConfig — per-check-method wording', () => {
  const rej = { id: 2, name: '87A', finalStatus: 'REJECT' as const }
  const acc = { id: 1, name: '86B', finalStatus: 'ACCEPT' as const }

  it('describes a coords-mode result as a §67(5) co-ordinate comparison and carries checkMethod', () => {
    const cfg = buildComparisonConfig(points, {
      pts: [acc, rej],
      method: 'coords', surveyClass: 'C', posLimit: 0.0623,
    })
    expect(cfg.checkMethod).toBe('coords')
    expect(cfg.adjustmentSummary).toMatch(/co-ordinate comparison/i)
    expect(cfg.adjustmentSummary).toMatch(/class C/)
    expect(cfg.adjustmentSummary).toMatch(/0\.0623 m/)
    expect(cfg.adjustmentSummary).not.toMatch(/W-test/i)
    expect(cfg.conclusion).toMatch(/class C co-ordinate limit/)
    expect(cfg.conclusion).toMatch(/87A/)
  })

  it('describes an edges-mode result as a Second Schedule severity verdict (no W-test)', () => {
    const cfg = buildComparisonConfig(points, {
      pts: [acc, rej],
      method: 'edges', surveyClass: 'B',
      edges: { rows: [], summary: { totalLines: 0, distPass: 0, dirPass: 0, bothPass: 0, meanScale: null, sigma0: 0.02, posLimit: 0.049, lmed: 100, networkSwingDeg: null, networkSwingSec: null, networkSwingWarn: false } },
    })
    expect(cfg.checkMethod).toBe('edges')
    expect(cfg.adjustmentSummary).toMatch(/Second Schedule edge compliance/i)
    expect(cfg.adjustmentSummary).not.toMatch(/W-test/i)
    expect(cfg.conclusion).toMatch(/severity verdict/i)
    expect(cfg.conclusion).toMatch(/87A/)
  })

  it('omits checkMethod entirely for legacy results without a method', () => {
    const cfg = buildComparisonConfig(points, { pts: [acc] })
    expect(cfg.checkMethod).toBeUndefined()
    expect(cfg.adjustmentSummary).toMatch(/Helmert least-squares.*W-test/i)
  })
})
