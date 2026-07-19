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
  })

  it('lists rejected beacons in the conclusion and honours an explicit tolerance/method', () => {
    const cfg = buildComparisonConfig(points, result, { method: 'both', toleranceThreshold: 0.2 })
    expect(cfg.method).toBe('both')
    expect(cfg.toleranceThreshold).toBe(0.2)
    expect(cfg.conclusion).toMatch(/87A/)
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
