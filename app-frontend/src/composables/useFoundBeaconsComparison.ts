import type { FoundBeacon, BeaconComparisonConfig } from '@/types/cadastral'
import type { HistoricalPointCSV } from '@/services/historicalSurveyPoints'

export interface StorePoint { id: number; name: string; yH: number; xH: number; yS: number; xS: number }
export interface EngineResult {
  pts: Array<{ id: number; name: string; finalStatus: 'ACCEPT' | 'REJECT' }>
  /** Posteriori unit-weight standard error from the Helmert adjustment (metres). */
  adj?: { stats?: { s0?: number } }
}

/** Map comparison points (+ engine result) to the Report on Survey FoundBeacon[] shape. */
export function buildFoundBeacons(
  points: StorePoint[],
  result: EngineResult | null,
  projectBeacons: Array<{ beaconId: string }> = [],
): FoundBeacon[] {
  const byName = new Map(projectBeacons.map((b) => [b.beaconId.toLowerCase(), b.beaconId]))
  return points.map((p) => {
    const rp = result?.pts.find((r) => r.id === p.id || r.name === p.name)
    const withinTolerance = rp ? rp.finalStatus === 'ACCEPT' : undefined
    const dy = p.yS - p.yH
    const dx = p.xS - p.xH
    return {
      beaconId: byName.get(p.name.toLowerCase()) ?? p.name,
      status: 'found',
      originalData: { coordinates: { y: p.yH, x: p.xH }, srNumber: '', source: 'previous-survey' },
      currentCoordinates: { y: p.yS, x: p.xS },
      discrepancy: { dy, dx, distance: Math.hypot(dy, dx), withinTolerance },
      adopted: withinTolerance === true,
    }
  })
}

/** Build the BeaconComparisonConfig the Report on Survey renders. currentSRNumber is set by the parent. */
export function buildComparisonConfig(
  points: StorePoint[],
  result: EngineResult | null,
  opts: { method?: 'tabulation' | 'sketch' | 'both'; toleranceThreshold?: number } = {},
): BeaconComparisonConfig {
  const rejected = (result?.pts ?? []).filter((r) => r.finalStatus === 'REJECT').map((r) => r.name)
  const conclusion = rejected.length === 0
    ? 'From the above comparison, I adopt the positions of all found beacons.'
    : `From the above comparison, I adopt the positions of the found beacons, except ${rejected.join(', ')}, ${rejected.length === 1 ? 'flagged as an outlier' : 'flagged as outliers'} by the Section 67(5) W-test.`
  // Describe how accept/reject was actually decided (Helmert LSQ + W-test), not an absolute tolerance.
  const s0 = result?.adj?.stats?.s0
  const adjustmentSummary =
    '4-parameter Helmert least-squares, W-test data snooping @ 99% confidence'
    + (typeof s0 === 'number' && Number.isFinite(s0) ? `, posteriori σ₀ = ${s0.toFixed(4)} m` : '')
  return {
    method: opts.method ?? 'tabulation',
    currentSRNumber: '',
    toleranceThreshold: opts.toleranceThreshold ?? 0.02,
    adjustmentSummary,
    conclusion,
  }
}

/** Historical pair for the DB import (importHistoricalSurveyPoints). */
export function toHistoricalRows(points: StorePoint[]): HistoricalPointCSV[] {
  return points.map((p) => ({ Point: p.name, Y: String(p.yH), X: String(p.xH) }))
}

/** Rebuild store rows from previously-saved beacons (reload path). Drops beacons lacking a historical pair. */
export function pointsFromExistingBeacons(
  existingBeacons: FoundBeacon[] | undefined,
): Array<Omit<StorePoint, 'id'>> {
  return (existingBeacons ?? [])
    .filter((b) => b.originalData?.coordinates && b.currentCoordinates)
    .map((b) => ({
      name: b.beaconId,
      yH: b.originalData!.coordinates.y,
      xH: b.originalData!.coordinates.x,
      yS: b.currentCoordinates.y,
      xS: b.currentCoordinates.x,
    }))
}
