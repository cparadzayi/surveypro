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
// set aside when lines to it fail para 7(5) while the lines among the others pass. The edge check also holds
// each line to the para 7(5) tolerance ACROSS it (sideways, after the common swing of the beacons kept): SI 727
// sets no direction limit for a comparison, and that extension is printed as ours. A "severity" score (1.25 x
// the network median) and a direction limit (2.45 x sigma0 as an angle) used to decide the edge check; neither
// is in SI 727, and both were retired.

/** Wrap degrees to (−180, 180]. */
function wrapDeg(d) {
  let x = ((d % 360) + 360) % 360
  if (x > 180) x -= 360
  return x
}

/**
 * Per-line check for all unordered pairs of the given beacons, the edge check:
 *   - ALONG the line: the difference between the two surveys' distances against Second Schedule para 7(5),
 *     K x sqrt(0,075f + 0,000 15f^2) m (K 0,01 / 0,04 / 0,06 for class A / B / C, f the shorter distance);
 *   - ACROSS the line: the sideways movement of one end relative to the other, after the common swing of the
 *     beacons kept is taken out, against the same tolerance. SI 727 states para 7(5) along the line only; a
 *     beacon's error has no preferred direction, so the same bound is applied across it. That extension is ours
 *     and is printed as such.
 * A line passes when both hold. The lines and the verdict come from app-shared/coordinateComparison67.js with
 * `sideways`, so the common swing is fitted to the beacons kept: one that moved sideways cannot pull it.
 *
 * (A direction limit of 2.45 x sigma0 x 206265 / S and a 1.25 x median "severity" cut used to decide this check;
 * neither was in SI 727, and the first did not scale with para 7(5). Both are retired.)
 * @param {Array<{name,yH,xH,yS,xS}>} points
 * @param {'A'|'B'|'C'} cls
 * @returns {{ rows, summary }}
 *   rows[i].dirDiffSec    = raw swing (Survey - Hist) in seconds
 *   rows[i].swingResidSec = swing after removing the common swing of the beacons kept
 *   rows[i].side / sideOk = sideways movement (m) and whether it is within dAllow
 *   summary.networkSwingDeg/Sec = that common swing (signed, as a change of direction)
 */
export function edgeCompliance(points, cls) {
  const r = compareCoordinates67(points, cls, { sideways: true })
  // The rigid fit turns (y, x) through keptSwing; a south-oriented direction atan2(dY, dX) changes by minus that.
  const networkSwingSec = r.lines.length ? -r.keptSwingSec : null
  const networkSwingDeg = networkSwingSec == null ? null : networkSwingSec / 3600
  const by = new Map(points.map((p) => [p.name, p]))
  const rows = []
  let distPass = 0, sidePass = 0, bothPass = 0
  const scales = []
  for (const l of r.lines) {
    const a = by.get(l.from), b = by.get(l.to)
    if (!(l.fH > 0) || !(l.fS > 0)) continue   // skip degenerate/zero-length lines
    const brgH = bearingSouth(b.yH - a.yH, b.xH - a.xH)
    const brgS = bearingSouth(b.yS - a.yS, b.xS - a.xS)
    const swingDeg = wrapDeg(brgS - brgH)
    if (l.distOk) { distPass++; scales.push(l.fS / l.fH) }
    if (l.sideOk) sidePass++
    if (l.distOk && l.sideOk) bothPass++
    rows.push({ from: l.from, to: l.to, dH: l.fH, dS: l.fS, dDiff: l.diff, dAllow: l.limit,
                distOk: l.distOk, side: l.side, sideOk: l.sideOk, brgH, brgS,
                dirDiffSec: swingDeg * 3600, swingResidSec: wrapDeg(swingDeg - (networkSwingDeg ?? 0)) * 3600,
                pass: l.distOk && l.sideOk })
  }
  const mean = arr => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null)
  return {
    rows,
    summary: {
      totalLines: rows.length, distPass, sidePass, bothPass,
      meanScale: mean(scales),
      networkSwingDeg, networkSwingSec,
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
 * @param {{sideways?: boolean}} [opts]  the edge check also holds each line to para 7(5)'s tolerance across it
 */
export function coordinateComparison(points, cls, opts = {}) {
  const r = compareCoordinates67(points, cls, opts)
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
