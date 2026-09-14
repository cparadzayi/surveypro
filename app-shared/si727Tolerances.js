// app-shared/si727Tolerances.js
// The pure SI 727 (1979) Second Schedule tolerance kernel, shared by the backend
// write doors and the frontend comparison module. Deliberately geometry-free: no
// bearing/CRS imports, so both app-frontend and app-backend can load it.
// See docs/superpowers/plans/bnr-part8.md (moved here from app-frontend/src/utils/si727.js).

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

/**
 * Largest on-the-ground separation (m) inside a group of same-named observations.
 * 0 for a single observation. Observations are { y, x }.
 */
export function groupSpread(observations) {
  const pts = Array.isArray(observations) ? observations : []
  let max = 0
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j]
      const d = dist(a.y, a.x, b.y, b.x)
      if (d > max) max = d
    }
  return max
}

/**
 * Adjudicate a group of same-named observations (bnr-part8.md). Returns:
 *   'repeat'   → spread within SI 727 class tolerance → observations are the same peg,
 *                average them (today's behaviour).
 *   'conflict' → spread beyond the class tolerance → two positions claim one name;
 *                keep the first as canonical and suffix the rest.
 *   'single'   → one observation, nothing to do.
 */
export function classifyDuplicateGroup(observations, cls = 'B') {
  const pts = Array.isArray(observations) ? observations : []
  if (pts.length < 2) return { kind: 'single', separation: 0, tolerance: 0 }
  const separation = groupSpread(pts)
  const tolerance = distanceToleranceM(separation, cls)
  if (separation <= tolerance) return { kind: 'repeat', separation, tolerance }
  return { kind: 'conflict', separation, tolerance }
}

/**
 * Resolve every same-named group in one pass (bnr-part8.md). Shared by the two backend
 * write doors (CoordinatePoint.batchCreate and csv-imports execute-merge) so the two can
 * never drift apart again: repeats are averaged in place, conflicts keep the first
 * observation canonical and escape each extra as _dupl/_dupl2/..., escalating until free.
 *
 * @param {Array<[string, Array<{name,y,x,...}>]>} groups same-name groups, in input order
 * @param {{ surveyClass?: 'B'|'C', takenNames?: Set<string> }} options
 * @returns {{ points: Array, conflicts: Array<{id,count,tolerance,canonical,extras}> }}
 */
export function resolveDuplicateGroups(groups, { surveyClass = 'B', takenNames = new Set() } = {}) {
  const points = []
  const conflicts = []
  // Seed with every input name so an escape never collides with a genuine point
  // (e.g. a CSV that literally lists a beacon called "5000A_dupl").
  const used = new Set(takenNames)
  for (const [name] of (Array.isArray(groups) ? groups : [])) used.add(name)
  for (const [name, observations] of (Array.isArray(groups) ? groups : [])) {
    const pts = Array.isArray(observations) ? observations : []
    const verdict = classifyDuplicateGroup(pts, surveyClass)

    if (pts.length < 2 || verdict.kind === 'repeat') {
      if (verdict.kind === 'repeat') {
        const avgY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length
        const avgX = pts.reduce((sum, p) => sum + p.x, 0) / pts.length
        points.push({ ...pts[0], y: avgY, x: avgX })
      } else {
        points.push(pts[0])
      }
      used.add(name)
      continue
    }

    const [canonical, ...extras] = pts
    points.push(canonical)
    used.add(name)
    const conflict = {
      id: name,
      count: pts.length,
      tolerance: verdict.tolerance,
      canonical: { y: canonical.y, x: canonical.x },
      extras: [],
    }
    for (const extra of extras) {
      let escaped = `${name}_dupl`
      let n = 1
      while (used.has(escaped)) escaped = `${name}_dupl${++n}`
      used.add(escaped)
      points.push({ ...extra, name: escaped })
      conflict.extras.push({
        name: escaped,
        y: extra.y,
        x: extra.x,
        distance: Math.sqrt((extra.y - canonical.y) ** 2 + (extra.x - canonical.x) ** 2),
      })
    }
    conflicts.push(conflict)
  }
  return { points, conflicts }
}

/** Median of all pairwise distances. useSurvey=false → historical (yH,xH); true → survey (yS,xS). */
export function medianPairwiseDistance(points, useSurvey = false) {
  const ds = []
  const pts = Array.isArray(points) ? points : []
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j]
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