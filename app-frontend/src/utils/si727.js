// app-frontend/src/utils/si727.js
// Pure SI 727 (1979) comparison-sketch tolerances + helpers. No jsPDF/Vue imports.
import { bearingSouth } from '@/utils/surveyMath'

// Second Schedule of the Land Survey (General) Regulations, 1979 (S.I. 727 of 1979):
// distFactor from para 7(1) (acceptance of co-ordinates i.t.o. s.15(1)) and dirK from
// para 8 (i.t.o. s.15(2)) — the paragraphs that govern accepting a PREVIOUS survey's
// co-ordinates, which is what a found-beacon comparison does. Not para 5 ("Distances",
// 0,01/0,04/0,06), which limits a ground distance against the same survey's own
// co-ordinates, and not para 7(2) (0,01/0,015), which limits the angle subtended at a
// beacon. Paras 7 and 8 define class B and class C only — class A does not exist here.
export const SI727_CLASS = {
  B: { distFactor: 0.01, dirK: 15000 },
  C: { distFactor: 0.02, dirK: 45000 },
}

/** Allowable distance difference (m): factor·√(0.075f + 0.00015f²). f = shorter line length (m). */
export function distanceToleranceM(f, cls) {
  const c = SI727_CLASS[cls] || SI727_CLASS.B
  if (!(f > 0)) return 0
  return c.distFactor * Math.sqrt(0.075 * f + 0.00015 * f * f)
}

/** Allowable direction difference (arc-seconds): K/(S+300). S = ray length (m). */
export function directionToleranceArcsec(S, cls) {
  const c = SI727_CLASS[cls] || SI727_CLASS.B
  if (!(S >= 0)) return 0   // S=0 allowed: the +300 term caps short-ray tolerance at K/300
  return c.dirK / (S + 300)
}

function dist(y1, x1, y2, x2) {
  return Math.hypot(y2 - y1, x2 - x1)
}

/** Median of all pairwise distances. useSurvey=false → historical (yH,xH); true → survey (yS,xS). */
export function medianPairwiseDistance(points, useSurvey = false) {
  const ds = []
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      const a = points[i], b = points[j]
      const d = useSurvey ? dist(a.yS, a.xS, b.yS, b.xS) : dist(a.yH, a.xH, b.yH, b.xH)
      if (d > 0) ds.push(d)
    }
  if (ds.length === 0) return 0
  ds.sort((p, q) => p - q)
  const m = Math.floor(ds.length / 2)
  return ds.length % 2 ? ds[m] : (ds[m - 1] + ds[m]) / 2
}

/**
 * Suggested a-priori σ₀ (m) from the survey class.
 * σ₀ = distanceToleranceM(L) / div ;  L = median pairwise (historical) distance.
 * div default 5 ≈ 95% 2-D confidence (≈2.45σ) propagated to a per-coordinate σ.
 * Falls back to 0.010 m if the network is degenerate.
 */
export function suggestedSigma0(points, cls, div = 5) {
  const L = medianPairwiseDistance(points, false)
  if (!(L > 0) || !(div > 0)) return 0.010
  const s = distanceToleranceM(L, cls) / div
  return s > 0 ? s : 0.010
}

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

/**
 * Per-beacon severity: the mean, over every line the beacon sits on, of the worse of
 * that line's two Schedule ratios. 1.0 = exactly at the limit, 2.0 = twice the limit.
 * @param {Array<{from,to,dDiff,dAllow,dirDiffSec,dirAllowSec}>} rows edgeCompliance rows
 * @returns {Map<string, number>} beacon name → severity
 */
export function beaconSeverity(rows) {
  const acc = new Map()
  for (const r of rows) {
    const distRatio = r.dAllow > 0 ? Math.abs(r.dDiff) / r.dAllow : 0
    const dirRatio = r.dirAllowSec > 0 ? Math.abs(r.dirDiffSec) / r.dirAllowSec : 0
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
 * Per-line SI 727 compliance for all unordered pairs of the given beacons.
 * Independent of the Helmert least-squares solution: per SI 727 the test is the
 * RAW difference between the survey-derived and historical-derived directions
 * (no swing/rotation removed), compared to the direction tolerance.
 * @param {Array<{name,yH,xH,yS,xS}>} points
 * @param {'B'|'C'} cls
 * @returns {{ rows, summary }}
 */
export function edgeCompliance(points, cls) {
  const rows = []
  let distPass = 0, dirPass = 0, bothPass = 0
  const scales = [], swings = []
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

      // South-oriented directions from each survey; RAW difference (deg → arc-sec).
      const brgH = bearingSouth(b.yH - a.yH, b.xH - a.xH)
      const brgS = bearingSouth(b.yS - a.yS, b.xS - a.xS)
      const dirDiffDeg = wrapDeg(brgS - brgH)
      const dirDiffSec = dirDiffDeg * 3600
      const dirAllowSec = directionToleranceArcsec(dH, cls)
      const dirOk = Math.abs(dirDiffSec) <= dirAllowSec

      const pass = distOk && dirOk
      if (distOk) distPass++
      if (dirOk) dirPass++
      // SI 727: only tolerance-passing lines are "used in the determination" of
      // scale/swing, so meanScale/meanSwingDeg are taken over both-pass lines only.
      // (meanSwingDeg here is the SI 727 swing — independent of the Helmert rotation.)
      if (pass) { bothPass++; scales.push(dS / dH); swings.push(dirDiffDeg) }
      rows.push({ from: a.name, to: b.name, dH, dS, dDiff, dAllow, distOk,
                  brgH, brgS, dirDiffSec, dirAllowSec, dirOk, pass })
    }
  }
  const mean = arr => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null)
  return {
    rows,
    summary: {
      totalLines: rows.length, distPass, dirPass, bothPass,
      meanScale: mean(scales), meanSwingDeg: mean(swings),
    },
  }
}
