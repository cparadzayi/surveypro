import type { FoundBeacon, BeaconComparisonConfig } from '@/types/cadastral'
import type { HistoricalPointCSV } from '@/services/historicalSurveyPoints'

export interface StorePoint { id: number; name: string; yH: number; xH: number; yS: number; xS: number }
export interface EdgeRow {
  from: string; to: string
  dH: number; dS: number; dDiff: number; dAllow: number; distOk: boolean
  brgH: number; brgS: number; dirDiffSec: number; swingResidSec: number
  dirAllowSec: number; dirOk: boolean
  pass: boolean
}
export interface EdgeSummary {
  totalLines: number; distPass: number; dirPass: number; bothPass: number
  meanScale: number | null
  sigma0: number; posLimit: number; lmed: number
  networkSwingDeg: number | null; networkSwingSec: number | null
  networkSwingWarn: boolean
}
export interface EngineResult {
  pts: Array<{ id: number; name: string; finalStatus: 'ACCEPT' | 'REJECT' }>
  /** Posteriori unit-weight standard error from the Helmert adjustment (metres). */
  adj?: { stats?: { s0?: number } }
  /** SI 727 s.67(5) inter-beacon edge compliance (si727.js's edgeCompliance() result). */
  edges?: { rows: EdgeRow[]; summary: EdgeSummary }
  surveyClass?: 'B' | 'C'
  /** Which comparison check produced this result ('coords' | 'edges' | 'wtest'). */
  method?: 'coords' | 'edges' | 'wtest'
  /** SI 727 §67(5) co-ordinate comparison acceptance limit in metres ('coords' mode). */
  posLimit?: number
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
  const m = result?.method
  const cls = result?.surveyClass ?? 'B'
  let conclusion: string
  let adjustmentSummary: string
  if (m === 'coords') {
    // §67(5) co-ordinate comparison — consistency verdict on the raw residuals, not a fit.
    const pos = result?.posLimit != null
      ? `co-ordinate limit ±${result.posLimit.toFixed(4)} m (95% 2-D)`
      : `co-ordinate limit (class ${cls}, 95% 2-D)`
    adjustmentSummary =
      `SI 727 §67(5) co-ordinate comparison — class ${cls}, ${pos}, `
      + 'two-gate consistency verdict (reject only when Δ/limit > 1.25 × network median and Δ/limit > 1)'
    conclusion = rejected.length === 0
      ? 'From the above comparison, I adopt the positions of all found beacons.'
      : `From the above comparison, I adopt the positions of the found beacons, except ${rejected.join(', ')}, ` +
        (rejected.length === 1 ? 'which falls' : 'which fall') +
        ` outside the SI 727 class ${cls} co-ordinate limit.`
  } else if (m === 'edges') {
    // Second Schedule edge compliance + severity verdict — no adjustment was fitted.
    // Distances use the para 7(5) Limits of Error; directions use the swing principle
    // (swing residual vs the class positional limit as an angle — a point whose edges do
    // not display consistent distances and directions is suspect).
    adjustmentSummary =
      `SI 727 Second Schedule edge compliance (para 7(5) distances, swing-principle directions) — `
      + `class ${cls} limits, two-gate severity verdict`
    conclusion = rejected.length === 0
      ? 'From the above comparison, I adopt the positions of all found beacons.'
      : `From the above comparison, I adopt the positions of the found beacons, except ${rejected.join(', ')}, flagged by the SI 727 Second Schedule severity verdict.`
  } else {
    // Helmert LSQ + W-test (explicit 'wtest' mode or legacy results without a method).
    const s0 = result?.adj?.stats?.s0
    adjustmentSummary =
      '4-parameter Helmert least-squares, W-test data snooping @ 99% confidence'
      + (typeof s0 === 'number' && Number.isFinite(s0) ? `, posteriori σ₀ = ${s0.toFixed(4)} m` : '')
    conclusion = rejected.length === 0
      ? 'From the above comparison, I adopt the positions of all found beacons.'
      : `From the above comparison, I adopt the positions of the found beacons, except ${rejected.join(', ')}, ${rejected.length === 1 ? 'flagged as an outlier' : 'flagged as outliers'} by the Section 67(5) W-test.`
  }
  return {
    method: opts.method ?? 'tabulation',
    currentSRNumber: '',
    toleranceThreshold: opts.toleranceThreshold ?? 0.02,
    adjustmentSummary,
    conclusion,
    ...(result?.method ? { checkMethod: result.method } : {}),
    ...(result?.edges ? {
      edgeCompliance: {
        surveyClass: result.surveyClass ?? 'B',
        rows: result.edges.rows,
        summary: result.edges.summary,
      },
    } : {}),
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
