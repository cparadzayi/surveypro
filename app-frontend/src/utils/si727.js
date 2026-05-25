// app-frontend/src/utils/si727.js
// Pure SI 727 (1979) comparison-sketch tolerances + helpers. No jsPDF/Vue imports.
import { bearingSouth } from '@/utils/surveyMath'

export const SI727_CLASS = {
  B: { distFactor: 0.01,  dirK: 15000 },
  C: { distFactor: 0.015, dirK: 45000 },
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

/** Wrap degrees to (−180, 180]. */
function wrapDeg(d) {
  let x = ((d % 360) + 360) % 360
  if (x > 180) x -= 360
  return x
}

/**
 * Per-line SI 727 compliance for all unordered pairs of the given beacons.
 * @param {Array<{name,yH,xH,yS,xS}>} points
 * @param {'B'|'C'} cls
 * @param {number} swingDeg  Helmert rotation (deg), removed from direction differences.
 * @returns {{ rows, summary }}
 */
export function edgeCompliance(points, cls, swingDeg = 0) {
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

      const brgH = bearingSouth(b.yH - a.yH, b.xH - a.xH)
      const brgS = bearingSouth(b.yS - a.yS, b.xS - a.xS)
      const dirDiffRaw = wrapDeg(brgS - brgH)
      const dirResidualSec = wrapDeg(dirDiffRaw - swingDeg) * 3600
      const dirAllowSec = directionToleranceArcsec(dH, cls)
      const dirOk = Math.abs(dirResidualSec) <= dirAllowSec

      const pass = distOk && dirOk
      if (distOk) distPass++
      if (dirOk) dirPass++
      // SI 727: only tolerance-passing lines are "used in the determination" of
      // scale/swing, so meanScale/meanSwingDeg are taken over both-pass lines only.
      if (pass) { bothPass++; scales.push(dS / dH); swings.push(dirDiffRaw) }
      rows.push({ from: a.name, to: b.name, dH, dS, dDiff, dAllow, distOk,
                  dirResidualSec, dirAllowSec, dirOk, pass })
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
