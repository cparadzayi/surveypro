import type { FoundBeacon, BeaconComparisonConfig } from '@/types/cadastral'
import type { HistoricalPointCSV } from '@/services/historicalSurveyPoints'
import { comparisonConclusion, type ComparisonResult67 } from '../../../app-shared/coordinateComparison67'

export interface StorePoint { id: number; name: string; yH: number; xH: number; yS: number; xS: number }
export interface EdgeRow {
  from: string; to: string
  dH: number; dS: number; dDiff: number; dAllow: number; distOk: boolean
  brgH: number; brgS: number; dirDiffSec: number; swingResidSec: number
  /** Sideways movement (m) after the common swing of the beacons kept, against the same para 7(5) tolerance. */
  side?: number; sideOk?: boolean
  /** Within para 7(5) along the line and across it. Saved results may still carry dirOk/dirAllowSec. */
  pass: boolean
  dirAllowSec?: number; dirOk?: boolean
}
export interface EdgeSummary {
  totalLines: number; distPass: number
  sidePass?: number; bothPass?: number
  meanScale: number | null
  networkSwingDeg: number | null; networkSwingSec: number | null
}
export interface EngineResult {
  pts: Array<{ id: number; name: string; finalStatus: 'ACCEPT' | 'REJECT' | 'UNRESOLVED' }>
  /** Posteriori unit-weight standard error from the Helmert adjustment (metres). */
  adj?: { stats?: { s0?: number } }
  /** SI 727 s.67(5) inter-beacon edge compliance (si727.js's edgeCompliance() result). */
  edges?: { rows: EdgeRow[]; summary: EdgeSummary }
  surveyClass?: 'B' | 'C'
  /** Which comparison check produced this result ('coords' | 'edges' | 'wtest'). */
  method?: 'coords' | 'edges' | 'wtest'
  /** 'coords' mode: the s.67(5) comparison judged by Second Schedule para 7(5) on the lines between beacons. */
  comparison67?: ComparisonResult67
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
    // UNRESOLVED (the comparison could not decide) is neither within nor outside: left undefined, not adopted.
    const withinTolerance = rp && rp.finalStatus !== 'UNRESOLVED' ? rp.finalStatus === 'ACCEPT' : undefined
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
    // s.67(5) schedule, judged by Second Schedule para 7(5) on the lines between the beacons (no co-ordinate
    // limit: the regulations set none). The report re-derives the lines from the printed co-ordinates.
    const c67 = result?.comparison67
    adjustmentSummary =
      `SI 727 s.67(5) comparison of co-ordinates, class ${cls}: Second Schedule para 7(5) on every line between the found beacons`
      + (c67 ? ` (${c67.lines.length} lines, ${c67.linesFailing} outside the limit)` : '')
    conclusion = c67
      ? comparisonConclusion(c67)
      : rejected.length === 0
        ? 'From the above comparison, I adopt the positions of all found beacons.'
        : `From the above comparison, I adopt the positions of the found beacons, except ${rejected.join(', ')}.`
  } else if (m === 'edges') {
    // Every line between the beacons against Second Schedule para 7(5) along the line and, sideways after the
    // common swing of the beacons kept, across it; decided as the co-ordinate comparison is. No scale fitted.
    const c67 = result?.comparison67
    adjustmentSummary =
      `SI 727 Second Schedule para 7(5), class ${cls}, on every line between the found beacons`
      + (c67?.sideways ? ', along the line and (its tolerance applied by this check) across it' : '')
      + (c67 ? ` (${c67.lines.length} lines, ${c67.linesFailing} outside the limit)` : '')
    conclusion = c67
      ? comparisonConclusion(c67)
      : rejected.length === 0
        ? 'From the above comparison, I adopt the positions of all found beacons.'
        : `From the above comparison, I adopt the positions of the found beacons, except ${rejected.join(', ')}.`
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
    ...(result?.surveyClass ? { surveyClass: result.surveyClass } : {}),
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
