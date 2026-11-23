// app-frontend/src/utils/si727.js
// Pure SI 727 (1979) comparison-sketch tolerances + helpers. No jsPDF/Vue imports.
// The tolerance kernel (SI727_CLASS, distanceToleranceM, directionToleranceArcsec,
// medianPairwiseDistance, suggestedSigma0) lives in app-shared/si727Tolerances.js so
// the backend write doors resolve the same schedule (bnr-part8.md); this file re-exports
// it unchanged and keeps the network-adjustment logic (edgeCompliance, severity) local.
import { bearingSouth } from '@/utils/surveyMath'
import { compareCoordinates67 } from '../../../app-shared/coordinateComparison67.js'
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
// The Schedule sets per-LINE limits; a comparison has to reach a per-BEACON verdict.
// Counting a beacon's failing lines does not get there: at short ray lengths the para 8
// direction limit (K/(S+300)) fails almost every line — an 18 m ray with a 0.2 m lateral
// discrepancy is ~2300″ whatever the survey's quality — so on a class B township network
// the counts come out near-identical for sound and unsound beacons alike. Severity (how
// far past the limit, not merely whether) does separate them, and its ranking at the top
// (the part that decides rejections) holds whichever class is declared.

/**
 * How far above the network's own median severity a beacon must sit before it is
 * rejected. Deliberately relative: an absolute cut cannot be stated once for both
 * classes, and a whole network may be uniformly poor without any one beacon being at
 * fault. Calibrated against the SG reference comparison sketch (it reproduces that
 * examiner's three rejections on both classes) and cross-checked against SAMPLE_DATA's
 * planted blunder. Known limit: on a UNIFORMLY bad network the median rises with the
 * failures and nothing is flagged — the certification's summary has to carry that case.
 */
export const SI727_SEVERITY_FACTOR = 1.25

/** A Helmert fit needs three points; never reject a network below that. */
const MIN_SURVIVORS = 3

function dist(y1, x1, y2, x2) {
  return Math.hypot(y2 - y1, x2 - x1)
}

/**
 * Per-beacon severity: the mean, over every line the beacon sits on, of the worse of
 * that line's two ratios. 1.0 = exactly at the limit, 2.0 = twice the limit.
 * Directions are judged on the swing RESIDUAL (swingResidSec) when the row carries it
 * (edgeCompliance's swing-principle reading); a plain dirDiffSec row falls back to raw.
 * @param {Array<{from,to,dDiff,dAllow,dirDiffSec,dirAllowSec,swingResidSec?}>} rows edgeCompliance rows
 * @returns {Map<string, number>} beacon name → severity
 */
export function beaconSeverity(rows) {
  const acc = new Map()
  for (const r of rows) {
    const distRatio = r.dAllow > 0 ? Math.abs(r.dDiff) / r.dAllow : 0
    const dirDev = r.swingResidSec != null ? r.swingResidSec : r.dirDiffSec
    const dirRatio = r.dirAllowSec > 0 ? Math.abs(dirDev) / r.dirAllowSec : 0
    const worst = Math.max(distRatio, dirRatio)
    for (const name of [r.from, r.to]) {
      const cur = acc.get(name) || { sum: 0, n: 0 }
      cur.sum += worst
      cur.n += 1
      acc.set(name, cur)
    }
  }
  const out = new Map()
  for (const [name, { sum, n }] of acc) out.set(name, n ? sum / n : 0)
  return out
}

function median(values) {
  if (!values.length) return 0
  const v = [...values].sort((a, b) => a - b)
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
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

/** Arc-second equivalent of a lateral displacement: θ(″) ≈ s·206265/L. */
const RAD2SEC = 206265

/**
 * Which beacons the Second Schedule condemns. A beacon is rejected only when it clears
 * BOTH gates — it stands apart from its own network (severity > factor × median) AND it
 * genuinely breaches the Schedule somewhere (severity > 1). The second gate is what stops
 * a purely relative cut from condemning a beacon that is comfortably inside tolerance and
 * merely happens to be the least good of a clean set.
 * @returns {{ rejected: string[], severity: Map<string,number>, median: number, cut: number }}
 *   `rejected` is ordered worst-first.
 */
export function severityVerdict(rows, factor = SI727_SEVERITY_FACTOR) {
  const severity = beaconSeverity(rows)
  const med = median([...severity.values()])
  const cut = factor * med
  const ranked = [...severity.keys()].sort((a, b) => severity.get(b) - severity.get(a))
  const maxRejects = Math.max(0, severity.size - MIN_SURVIVORS)
  const rejected = ranked
    .filter((name) => severity.get(name) > cut && severity.get(name) > 1)
    .slice(0, maxRejects)
  return { rejected, severity, median: med, cut }
}

/** Wrap degrees to (−180, 180]. */
function wrapDeg(d) {
  let x = ((d % 360) + 360) % 360
  if (x > 180) x -= 360
  return x
}

/**
 * Per-line SI 727 compliance for all unordered pairs of the given beacons, judged on the
 * old-days SWING PRINCIPLE for directions:
 *   - each line has a swing = (Survey − Hist) direction, wrapped to ±180°;
 *   - the network swing ω̂ is the LENGTH-WEIGHTED MEDIAN of the swings (weight ∝ S² — the
 *     longest rays determine direction best and dominate, without letting one displaced
 *     beacon pull the consensus, which a weighted mean would);
 *   - a line's direction test is its swing RESIDUAL ω − ω̂ against the class positional
 *     limit expressed as an angle on that ray: tol = 2.45·σ₀·206265/S, where σ₀ =
 *     distanceToleranceM(L)/5 with L = median pairwise historical distance. That is the
 *     SAME 95% 2-D budget the §67(5) co-ordinate comparison uses, so distances and
 *     directions are two projections of one class positional budget — a point whose edges
 *     do not display consistent distances AND directions is suspect.
 * Distances use the para 7(5) Limits of Error (factor·√(0.075f + 0.00015f²), f = shorter line).
 * Para 8 (K/(S+300)) is deliberately NOT the direction gate here: it is a setting-out
 * acceptance test (office-computed direction vs field-set direction), not a re-observation
 * swing consistency test. Independent of any Helmert fit.
 * @param {Array<{name,yH,xH,yS,xS}>} points
 * @param {'B'|'C'} cls
 * @returns {{ rows, summary }}
 *   rows[i].dirDiffSec  = raw swing (Survey − Hist) in seconds — kept for display
 *   rows[i].swingResidSec = swing residual after the network swing, the value dirOk tests
 *   summary.networkSwingDeg/Sec = ω̂ (signed); networkSwingWarn when |ω̂| exceeds the angular
 *   tolerance at the median ray (a uniform orientation offset worth noting, never a rejection).
 */
export function edgeCompliance(points, cls) {
  const sigma0 = suggestedSigma0(points, cls)
  const posLimit = 2.45 * (sigma0 > 0 ? sigma0 : 0.01)
  const lmed = medianPairwiseDistance(points, false)
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
      const dAllow = distanceToleranceM(f, cls)
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
  const tolAngMed = lmed > 0 ? posLimit * RAD2SEC / lmed : 0

  const rows = []
  let distPass = 0, dirPass = 0, bothPass = 0
  const scales = []
  for (const e of pass1) {
    const swingResidSec = wrapDeg(e.swingDeg - networkSwingDeg) * 3600
    const dirAllowSec = e.dH > 0 ? posLimit * RAD2SEC / e.dH : 0
    const dirOk = Math.abs(swingResidSec) <= dirAllowSec
    const pass = e.distOk && dirOk
    if (e.distOk) distPass++
    if (dirOk) dirPass++
    if (pass) { bothPass++; scales.push(e.dS / e.dH) }
    rows.push({ from: e.a.name, to: e.b.name, dH: e.dH, dS: e.dS, dDiff: e.dDiff, dAllow: e.dAllow,
                distOk: e.distOk, brgH: e.brgH, brgS: e.brgS,
                dirDiffSec: e.swingDeg * 3600, swingResidSec, dirAllowSec, dirOk, pass })
  }
  const mean = arr => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null)
  return {
    rows,
    summary: {
      totalLines: rows.length, distPass, dirPass, bothPass,
      meanScale: mean(scales),
      sigma0, posLimit, lmed,
      networkSwingDeg: rows.length ? networkSwingDeg : null,
      networkSwingSec: rows.length ? networkSwingSec : null,
      networkSwingWarn: rows.length > 0 && tolAngMed > 0 && Math.abs(networkSwingSec) > tolAngMed,
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

/**
 * Bundle a Second Schedule severity verdict into per-beacon accept/reject status —
 * shaped like iterativeAdjust's rejects (rejSource 'si727'), so the schedule, sketch
 * and report certification treat it identically. No adjustment is performed; this is
 * the "Edge compliance with the SI 727 classes" option.
 * @param {Array<{name,yH,xH,yS,xS}>} points
 * @param {{ rows }} edges         edgeCompliance() result (kept for display)
 * @param {{ rejected: string[] }} verdict  severityVerdict() result
 * @returns {Array<{...points, finalStatus, rejSource, rejIter}>}
 */
export function edgeVerdictPoints(points, edges, verdict) {
  const rejected = new Set(verdict.rejected)
  return points.map(p => {
    const rej = rejected.has(p.name)
    const dY = p.yS - p.yH
    const dX = p.xS - p.xH
    return {
      ...p,
      dY, dX, rawDist: Math.sqrt(dY * dY + dX * dX), rawBrg: bearingSouth(dY, dX),
      finalStatus: rej ? 'REJECT' : 'ACCEPT',
      rejSource: rej ? 'si727' : null,
      rejIter: rej ? 0 : null,
    }
  })
}
