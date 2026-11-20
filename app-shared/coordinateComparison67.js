/**
 * Comparison of a survey's found beacons with the original (previous survey) data, SI 727 section 67(5), judged
 * only by what the regulations state.
 *
 * Section 67(5) requires a schedule comparing the survey data (red) with the original data (black); it sets no
 * co-ordinate limit. A survey system may sit shifted or swung against the old one with its beacons perfectly
 * consistent among themselves, so a beacon is not judged by its own co-ordinate difference. What the regulations
 * DO limit is the distance between two beacons: Second Schedule para 7(5) -- the difference between the distance
 * from one survey's co-ordinates and the same distance from the other's shall not exceed K * sqrt(0,075f +
 * 0,000 15f^2) m, K = 0,01 (class A), 0,04 (class B), 0,06 (class C), f the distance in metres. A shift or a swing
 * leaves every distance unchanged, so this test sees only beacons that moved relative to the others.
 *
 * So:
 *   - every line between two compared beacons is checked against para 7(5) (`lines`);
 *   - a beacon is singled out when lines to it fail while lines among the others pass: repeatedly, the beacon
 *     with the most failing lines among those still in is set aside, until no line fails. Where two beacons are
 *     tied, each with only the one failing line between them, the line alone cannot say which moved: it is
 *     reported as unresolved and neither is set aside (the surveyor decides). A tie on two or more lines is
 *     broken by the larger difference after the common shift and swing. At least three beacons always remain.
 *   - the common shift and swing (a rigid fit, no scale) and each beacon's difference after removing them are
 *     given for the surveyor's information; no limit is applied to them, because the regulations set none.
 *
 * Para 7(5)'s proviso -- it does not apply to a beacon whose co-ordinates were adopted under section 16(6) or
 * section 44 -- is honoured through `exempt`: such a beacon's lines are listed but not judged.
 */

/** Para 7(5) K by class. */
export const PARA_7_5_K = { A: 0.01, B: 0.04, C: 0.06 }

/** Para 7(5): the largest allowed difference in a distance of f metres. */
export function para75Limit(f, cls = 'B') {
  const k = PARA_7_5_K[cls] ?? PARA_7_5_K.B
  return f > 0 ? k * Math.sqrt(0.075 * f + 0.00015 * f * f) : 0
}

const MIN_REMAINING = 3

/**
 * @param {{name:string,yH:number,xH:number,yS:number,xS:number}[]} points  original (H) and survey (S) co-ordinates
 * @param {'A'|'B'|'C'} cls
 * @param {{exempt?: Iterable<string>}} [opts]  beacons adopted under s.16(6) or s.44 (para 7(5) does not apply)
 */
export function compareCoordinates67(points, cls = 'B', opts = {}) {
  const pts = (points ?? []).filter((p) => [p.yH, p.xH, p.yS, p.xS].every(Number.isFinite))
  const exempt = new Set(opts.exempt ?? [])

  // Common shift and swing: rigid fit of the original co-ordinates onto the survey's (no scale).
  const n = pts.length || 1
  const cH = { y: pts.reduce((s, p) => s + p.yH, 0) / n, x: pts.reduce((s, p) => s + p.xH, 0) / n }
  const cS = { y: pts.reduce((s, p) => s + p.yS, 0) / n, x: pts.reduce((s, p) => s + p.xS, 0) / n }
  let sDot = 0, sCross = 0
  for (const p of pts) {
    const hy = p.yH - cH.y, hx = p.xH - cH.x, sy = p.yS - cS.y, sx = p.xS - cS.x
    sDot += hy * sy + hx * sx
    sCross += hy * sx - hx * sy
  }
  const swing = pts.length >= 2 ? Math.atan2(sCross, sDot) : 0   // rotation taking (y, x) of H onto S
  const cos = Math.cos(swing), sin = Math.sin(swing)
  const fitted = (p) => {
    const hy = p.yH - cH.y, hx = p.xH - cH.x
    return { y: cS.y + hy * cos - hx * sin, x: cS.x + hy * sin + hx * cos }
  }

  const rows = pts.map((p) => {
    const f = fitted(p)
    const resY = p.yS - f.y, resX = p.xS - f.x
    return {
      name: p.name, dY: p.yS - p.yH, dX: p.xS - p.xH,
      resY, resX, residual: Math.hypot(resY, resX),
      failedLines: 0, linesChecked: 0, exempt: exempt.has(p.name), setAside: false,
    }
  })
  const byName = new Map(rows.map((r) => [r.name, r]))

  const lines = []
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j]
      const fH = Math.hypot(b.yH - a.yH, b.xH - a.xH)
      const fS = Math.hypot(b.yS - a.yS, b.xS - a.xS)
      const limit = para75Limit(Math.min(fH, fS), cls)
      const judged = !exempt.has(a.name) && !exempt.has(b.name)
      const diff = fS - fH
      lines.push({ from: a.name, to: b.name, fH, fS, diff, limit, judged, pass: !judged || Math.abs(diff) <= limit })
    }
  }
  for (const l of lines) {
    if (!l.judged) continue
    for (const nme of [l.from, l.to]) {
      const r = byName.get(nme)
      r.linesChecked++
      if (!l.pass) r.failedLines++
    }
  }

  // Single out beacons: the one with the most failing lines among those still in, until no line fails.
  const remaining = new Set(rows.map((r) => r.name))
  const setAside = []
  const unresolved = []
  const failingAmong = () => lines.filter((l) => !l.pass && remaining.has(l.from) && remaining.has(l.to))
  for (;;) {
    const failing = failingAmong()
    if (!failing.length || remaining.size <= MIN_REMAINING) break
    const count = new Map()
    for (const l of failing) for (const nme of [l.from, l.to]) count.set(nme, (count.get(nme) ?? 0) + 1)
    const ranked = [...count].sort((p, q) => q[1] - p[1] || byName.get(q[0]).residual - byName.get(p[0]).residual)
    const [top, topCount] = ranked[0]
    if (topCount === 1 && ranked.length >= 2 && ranked[1][1] === 1) {
      // Only isolated failing lines remain: the line alone cannot say which end moved.
      unresolved.push(...failing.map((l) => ({ from: l.from, to: l.to })))
      break
    }
    remaining.delete(top)
    byName.get(top).setAside = true
    setAside.push(top)
  }

  return {
    surveyClass: cls,
    lines,
    beacons: rows,
    shift: { dY: cS.y - cH.y, dX: cS.x - cH.x },
    swingSec: swing * 206264.806,
    setAside,
    unresolved,
    linesFailing: lines.filter((l) => !l.pass).length,
  }
}

/** The conclusion the comparison supports, in the report's words. */
export function comparisonConclusion(result) {
  const lines = (names) => names.join(', ')
  const parts = []
  if (!result.setAside.length) {
    parts.push('From the above comparison, I adopt the positions of all found beacons.')
  } else {
    parts.push(`From the above comparison, I adopt the positions of the found beacons, except ${lines(result.setAside)}, `
      + 'whose distances to the other beacons do not agree with the original data within SI 727 Second Schedule para 7(5).')
  }
  if (result.unresolved.length) {
    parts.push(`The line${result.unresolved.length === 1 ? '' : 's'} ${lines(result.unresolved.map((l) => `${l.from} - ${l.to}`))} `
      + 'exceed para 7(5), but the lines alone do not show which beacon moved; this is for the surveyor to decide.')
  }
  return parts.join(' ')
}
