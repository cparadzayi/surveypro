// app-frontend/src/utils/si727.js
// Pure SI 727 (1979) comparison-sketch tolerances + helpers. No jsPDF/Vue imports.
// The tolerance kernel (SI727_CLASS, distanceToleranceM, directionToleranceArcsec,
// medianPairwiseDistance, suggestedSigma0) lives in app-shared/si727Tolerances.js so
// the backend write doors resolve the same schedule (bnr-part8.md); this file re-exports
// it unchanged and keeps the line check (edgeCompliance) and the comparison wrapper local.
import { bearingSouth } from '@/utils/surveyMath'
import { compareCoordinates67, para75Limit } from '../../../app-shared/coordinateComparison67.js'
import {
  SI727_CLASS,
  distanceToleranceM,
  directionToleranceArcsec,
  medianPairwiseDistance,
  suggestedSigma0,
  classifyDuplicateGroup,
  groupSpread,
  resolveDuplicateGroups,
} from '../../../app-shared/si727Tolerances.js'

export { SI727_CLASS, distanceToleranceM, directionToleranceArcsec, medianPairwiseDistance, suggestedSigma0, classifyDuplicateGroup, groupSpread, resolveDuplicateGroups }

// ── Second Schedule verdict ──────────────────────────────────────────────────
// The Schedule sets per-LINE limits; a comparison has to reach a per-BEACON verdict. Both the comparison of
// co-ordinates and the edge check reach it the same way (app-shared/coordinateComparison67.js): a beacon is
// set aside when lines to it fail para 7(5) while the lines among the others pass. A "severity" score (1.25 x
// the network median) and a direction limit (2.45 x sigma0 as an angle) used to decide the edge check; neither
// is in SI 727, and para 8 is a setting-out test, so both were retired.

function dist(y1, x1, y2, x2) {
  return Math.hypot(y2 - y1, x2 - x1)
}

/** Robust weighted median: weights ∝ precision (the longest rays dominate without letting
 *  a displaced beacon skew the estimate, which a weighted mean would). 0 if empty. */
function weightedMedian(values, weights) {
  const entries = []
  for (let i = 0; i < values.length; i++) {
    const w = weights[i]
    if (Number.isFinite(values[i]) && Number.isFinite(w) && w > 0) entries.push({ v: values[i], w })
  }
  if (!entries.length) return 0
  entries.sort((a, b) => a.v - b.v)
  const total = entries.reduce((s, e) => s + e.w, 0)
  let acc = 0
  for (const e of entries) { acc += e.w; if (acc >= total / 2) return e.v }
  return entries[entries.length - 1].v
}

/** Wrap degrees to (−180, 180]. */
function wrapDeg(d) {
  let x = ((d % 360) + 360) % 360
  if (x > 180) x -= 360
  return x
}

/**
 * Per-line SI 727 check for all unordered pairs of the given beacons: the difference between the two
 * surveys' distances against Second Schedule para 7(5), K x sqrt(0,075f + 0,000 15f^2) m (K 0,01 / 0,04 /
 * 0,06 for class A / B / C, f the shorter of the two distances). That is the only line limit SI 727 states for
 * a comparison, so it alone decides a line (`pass = distOk`).
 *
 * Each line's direction in both surveys, its swing (Survey - Hist) and its swing residual after the network
 * swing (the length-weighted median of the swings) are kept FOR INFORMATION only. They used to be judged
 * against 2.45 x sigma0 x 206265 / S, sigma0 = the para 7(5) tolerance at the median spacing / 5: a limit
 * SI 727 does not state (para 8 is a setting-out test, not a comparison test), which failed 14 of 15 lines
 * of a class B network whose distances mostly agreed.
 * @param {Array<{name,yH,xH,yS,xS}>} points
 * @param {'A'|'B'|'C'} cls
 * @returns {{ rows, summary }}
 *   rows[i].dirDiffSec    = raw swing (Survey - Hist) in seconds
 *   rows[i].swingResidSec = swing after removing the network swing (information)
 *   summary.networkSwingDeg/Sec = the network swing (signed)
 */
export function edgeCompliance(points, cls) {
  const swings = [], weights = []
  const pass1 = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j]
      const dH = dist(a.yH, a.xH, b.yH, b.xH)
      const dS = dist(a.yS, a.xS, b.yS, b.xS)
      if (!(dH > 0) || !(dS > 0)) continue   // skip degenerate/zero-length lines
      const dDiff = dS - dH
      const f = Math.min(dH, dS)
      const dAllow = para75Limit(f, cls) // the same para 7(5) limit the comparison decides by (classes A, B, C)
      const distOk = Math.abs(dDiff) <= dAllow
      const brgH = bearingSouth(b.yH - a.yH, b.xH - a.xH)
      const brgS = bearingSouth(b.yS - a.yS, b.xS - a.xS)
      const swingDeg = wrapDeg(brgS - brgH)
      pass1.push({ a, b, dH, dS, dDiff, dAllow, distOk, brgH, brgS, swingDeg })
      swings.push(swingDeg)
      weights.push(dH * dH)
    }
  }
  const networkSwingDeg = weightedMedian(swings, weights)
  const networkSwingSec = networkSwingDeg * 3600

  const rows = []
  let distPass = 0
  const scales = []
  for (const e of pass1) {
    const swingResidSec = wrapDeg(e.swingDeg - networkSwingDeg) * 3600
    if (e.distOk) { distPass++; scales.push(e.dS / e.dH) }
    rows.push({ from: e.a.name, to: e.b.name, dH: e.dH, dS: e.dS, dDiff: e.dDiff, dAllow: e.dAllow,
                distOk: e.distOk, brgH: e.brgH, brgS: e.brgS,
                dirDiffSec: e.swingDeg * 3600, swingResidSec, pass: e.distOk })
  }
  const mean = arr => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null)
  return {
    rows,
    summary: {
      totalLines: rows.length, distPass,
      meanScale: mean(scales),
      networkSwingDeg: rows.length ? networkSwingDeg : null,
      networkSwingSec: rows.length ? networkSwingSec : null,
    },
  }
}

/**
 * SI 727 s.67(5) comparison of co-ordinates, judged only by what the regulations state: every line between
 * two compared beacons against Second Schedule para 7(5), a beacon set aside when lines to it fail while lines
 * among the others pass, and the common shift and swing reported for information (no co-ordinate limit: the
 * regulations set none). The rule itself is app-shared/coordinateComparison67.js; this keeps the per-beacon
 * shape the schedule, sketch and reports read (dY, dX, rawDist, rawBrg, finalStatus, rejSource).
 *
 * It replaced a co-ordinate limit of 2.45 x (para 7(5) at the median beacon spacing / 5) with a 1.25 x median
 * reject rule (0.079 m on Brackenhurst): neither figure is in SI 727, and a shifted network failed it while its
 * beacons agreed with each other.
 * @param {Array<{name,yH,xH,yS,xS}>} points
 * @param {'B'|'C'} cls
 */
export function coordinateComparison(points, cls) {
  const r = compareCoordinates67(points, cls)
  const by = new Map(r.beacons.map((b) => [b.name, b]))
  // UNRESOLVED: the comparison could not decide this beacon -- every beacon when the para 7(5) failures run
  // through the network, or the two ends of a lone failing line. It is neither accepted nor rejected.
  const undecided = new Set(r.networkWide ? r.beacons.map((b) => b.name) : r.unresolved.flatMap((l) => [l.from, l.to]))
  const pts = points.map((p) => {
    const b = by.get(p.name)
    const dY = p.yS - p.yH
    const dX = p.xS - p.xH
    return {
      ...p, dY, dX, rawDist: Math.sqrt(dY * dY + dX * dX), rawBrg: bearingSouth(dY, dX),
      resY: b?.resY ?? 0, resX: b?.resX ?? 0, residual: b?.residual ?? 0,
      failedLines: b?.failedLines ?? 0, linesChecked: b?.linesChecked ?? 0,
      finalStatus: b?.setAside ? 'REJECT' : undecided.has(p.name) ? 'UNRESOLVED' : 'ACCEPT',
      rejSource: b?.setAside ? 'coords' : null, rejIter: null,
    }
  })
  return { pts, surveyClass: cls, comparison67: r, verdict: { rejected: r.setAside, unresolved: r.unresolved } }
}
