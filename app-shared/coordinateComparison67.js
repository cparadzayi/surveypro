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
 * With `opts.sideways` (the edge check) each line is also held to the para 7(5) tolerance ACROSS its length,
 * after the common swing of the beacons still in is taken out (see `sideOf` below). SI 727 states the limit
 * along the line only; that extension is ours and is said so wherever it is printed.
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

  const ptByName = new Map(pts.map((p) => [p.name, p]))
  const lines = []
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], b = pts[j]
      const fH = Math.hypot(b.yH - a.yH, b.xH - a.xH)
      const fS = Math.hypot(b.yS - a.yS, b.xS - a.xS)
      const limit = para75Limit(Math.min(fH, fS), cls)
      const judged = !exempt.has(a.name) && !exempt.has(b.name)
      const diff = fS - fH
      const distOk = !judged || Math.abs(diff) <= limit
      lines.push({ from: a.name, to: b.name, fH, fS, diff, limit, judged, distOk, pass: distOk })
    }
  }

  // The sideways test (opts.sideways; the edge check). Para 7(5) limits the difference in a distance: how far
  // one end moved ALONG the line relative to the other. A beacon's error has no preferred direction, so the same
  // tolerance is applied ACROSS the line: after the common swing of the beacons still in is taken out, the
  // sideways movement of one end relative to the other, side = f x sin(line's swing - common swing), must not
  // exceed para 7(5) for that line. SI 727 states the limit along the line only; applying it across is ours,
  // and the report says so. The common swing is the rigid fit (no scale) of the beacons still in, so a beacon
  // that moved sideways cannot pull it: each candidate is judged with the swing of the others.
  const sideways = !!opts.sideways
  const fitRotation = (names) => {
    const set = [...names].map((nme) => ptByName.get(nme))
    const m = set.length || 1
    const h = { y: set.reduce((s, p) => s + p.yH, 0) / m, x: set.reduce((s, p) => s + p.xH, 0) / m }
    const s = { y: set.reduce((t, p) => t + p.yS, 0) / m, x: set.reduce((t, p) => t + p.xS, 0) / m }
    let dot = 0, cross = 0
    for (const p of set) {
      const hy = p.yH - h.y, hx = p.xH - h.x, sy = p.yS - s.y, sx = p.xS - s.x
      dot += hy * sy + hx * sx
      cross += hy * sx - hx * sy
    }
    return set.length >= 2 ? Math.atan2(cross, dot) : 0
  }
  /** Sideways movement (m, signed) of line l after the rotation `rot` (the rigid fit's) is taken out. */
  const sideOf = (l, rot) => {
    const a = ptByName.get(l.from), b = ptByName.get(l.to)
    const hy = b.yH - a.yH, hx = b.xH - a.xH, sy = b.yS - a.yS, sx = b.xS - a.xS
    const c = Math.cos(rot), sn = Math.sin(rot)
    const ry = hy * c - hx * sn, rx = hy * sn + hx * c   // the original line turned through the common swing
    const len = Math.hypot(ry, rx) || 1
    // Signed like the swing column: + when the line's south-oriented direction increased.
    return (rx * sy - ry * sx) / len
  }
  const lineFails = (l, rot) => l.judged && (!l.distOk || (sideways && Math.abs(sideOf(l, rot)) > l.limit))
  const failingIn = (names) => {
    const rot = sideways ? fitRotation(names) : 0
    return lines.filter((l) => names.has(l.from) && names.has(l.to) && lineFails(l, rot))
  }

  // Single out beacons: the one whose removal leaves the fewest failing lines among the others (with the swing
  // fitted afresh to them), until no line fails. Without the sideways test that is simply the beacon with the
  // most failing lines.
  const remaining = new Set(rows.map((r) => r.name))
  const setAside = []
  const unresolved = []
  for (;;) {
    const failing = failingIn(remaining)
    if (!failing.length || remaining.size <= MIN_REMAINING) break
    const count = new Map()
    for (const l of failing) for (const nme of [l.from, l.to]) count.set(nme, (count.get(nme) ?? 0) + 1)
    const left = new Map()
    for (const nme of count.keys()) {
      const others = new Set(remaining)
      others.delete(nme)
      left.set(nme, failingIn(others).length)
    }
    const ranked = [...count].sort((p, q) => left.get(p[0]) - left.get(q[0]) || q[1] - p[1]
      || byName.get(q[0]).residual - byName.get(p[0]).residual)
    const [top, topCount] = ranked[0]
    const isolated = topCount === 1 && ranked.length >= 2 && [...count.values()].every((c) => c === 1)
    if (isolated && left.get(top) >= failing.length - 1) {
      // Only isolated failing lines remain, and setting either end aside clears only its own line: the line
      // alone cannot say which end moved.
      unresolved.push(...failing.map((l) => ({ from: l.from, to: l.to })))
      break
    }
    remaining.delete(top)
    byName.get(top).setAside = true
    setAside.push(top)
  }

  // A beacon is set aside only when the lines AMONG THE OTHERS then pass. If lines still fail among the
  // beacons that remain (and not merely as isolated, undecidable lines), the disagreement runs through the
  // network -- the original data are on another scale or system, or the beacons do not correspond -- and no
  // beacon can be singled out: none is set aside, and the comparison says so. (A comparison against a local
  // system set aside one of four beacons here while every remaining line still failed, and claimed they passed.)
  const networkWide = !unresolved.length && failingIn(remaining).length > 0
  if (networkWide) {
    for (const n of setAside) byName.get(n).setAside = false
    setAside.length = 0
  }

  // Each line as finally judged: the sideways movement is measured against the common swing of the beacons
  // kept (all of them when none could be singled out).
  const kept = networkWide ? new Set(rows.map((r) => r.name)) : remaining
  const finalRot = sideways ? fitRotation(kept) : 0
  for (const l of lines) {
    if (sideways) {
      l.side = sideOf(l, finalRot)
      l.sideOk = !l.judged || Math.abs(l.side) <= l.limit
    }
    l.pass = !lineFails(l, finalRot)
  }
  for (const l of lines) {
    if (!l.judged) continue
    for (const nme of [l.from, l.to]) {
      const r = byName.get(nme)
      r.linesChecked++
      if (!l.pass) r.failedLines++
    }
  }

  return {
    sideways,
    /** The common swing of the beacons kept (the one the sideways test used), radians as the rigid fit's. */
    keptSwingSec: sideways ? finalRot * 206264.806 : null,
    surveyClass: cls,
    lines,
    beacons: rows,
    shift: { dY: cS.y - cH.y, dX: cS.x - cH.x },
    swingSec: swing * 206264.806,
    setAside,
    unresolved,
    networkWide,
    // The original co-ordinates are in another co-ordinate system (a local one, say) when the survey sits
    // kilometres away from them or turned through more than a degree: the "shift" and "swing" then describe that
    // system, not the survey, and are not reported as if they were the survey's.
    otherSystem: Math.hypot(cS.y - cH.y, cS.x - cH.x) > 1000 || Math.abs(swing) > Math.PI / 180,
    linesFailing: lines.filter((l) => !l.pass).length,
  }
}

/** The conclusion the comparison supports, in the report's words. */
export function comparisonConclusion(result) {
  const lines = (names) => names.join(', ')
  // With the sideways test (the edge check) a line can also fail across its length.
  const limitText = result.sideways
    ? 'SI 727 Second Schedule para 7(5) (along the line, and its tolerance applied across the line)'
    : 'SI 727 Second Schedule para 7(5)'
  const parts = []
  if (!result.setAside.length) {
    parts.push('From the above comparison, I adopt the positions of all found beacons.')
  } else {
    parts.push(`From the above comparison, I adopt the positions of the found beacons, except ${lines(result.setAside)}, `
      + `whose ${result.sideways ? 'lines' : 'distances'} to the other beacons do not agree with the original data within ${limitText}.`)
  }
  if (result.networkWide) {
    return `The ${result.sideways ? 'lines' : 'distances'} between the found beacons do not agree with the original data within ${limitText} `
      + `on ${result.linesFailing} of ${result.lines.length} lines, and the disagreement runs through the network rather than to one beacon. `
      + 'The original data appear to be on another scale or co-ordinate system, or the beacons do not correspond; no beacon is singled out, and this is for the surveyor to resolve before the positions are adopted.'
  }
  if (result.unresolved.length) {
    parts.push(`The line${result.unresolved.length === 1 ? '' : 's'} ${lines(result.unresolved.map((l) => `${l.from} - ${l.to}`))} `
      + `${result.unresolved.length === 1 ? 'exceeds' : 'exceed'} ${result.sideways ? 'the para 7(5) tolerance' : 'para 7(5)'}, but the lines alone do not show which beacon moved; this is for the surveyor to decide.`)
  }
  return parts.join(' ')
}
