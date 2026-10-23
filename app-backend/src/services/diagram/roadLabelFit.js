/**
 * Place a road's name BETWEEN the two lines of the road reserve and clear of every
 * line, instead of at a fixed offset from the tagged edge.
 *
 * A fixed offset (or even half the typed width) cannot know where the far
 * boundary actually is: the surveyor's width can differ from what is drawn, and a
 * junction or kink puts other lines through the label. So the far boundary is
 * found geometrically. A ray is cast outward from the tagged edge to the first
 * line it meets, and the name goes midway. The lettering shrinks to fit the gap,
 * and the box is slid along the road past any cross line (a side street, a
 * boundary meeting the reserve) rather than printed across it.
 *
 * Pure geometry in the caller's own units and frame (PDF points or DXF ground
 * metres); `normal` is the outward unit vector supplied by the caller, so the
 * frame's handedness never matters here.
 */

const EPS = 1e-9

/** Distance along a ray (o + t*d, t > 0) to segment p-q, or null. */
function rayHit(o, d, p, q) {
  const sx = q[0] - p[0], sy = q[1] - p[1]
  const den = d[0] * sy - d[1] * sx
  if (Math.abs(den) < EPS) return null
  const t = ((p[0] - o[0]) * sy - (p[1] - o[1]) * sx) / den
  const u = ((p[0] - o[0]) * d[1] - (p[1] - o[1]) * d[0]) / den
  return t > 1e-6 && u >= 0 && u <= 1 ? t : null
}

/** Does segment p-q cross the axis-aligned box [-hw,hw]x[-hh,hh]? (Liang-Barsky) */
function segHitsBox(p, q, hw, hh) {
  let t0 = 0, t1 = 1
  const dx = q[0] - p[0], dy = q[1] - p[1]
  const clip = (pp, qq) => {
    if (pp === 0) return qq >= 0
    const r = qq / pp
    if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r }
    else { if (r < t0) return false; if (r < t1) t1 = r }
    return true
  }
  return clip(-dx, p[0] + hw) && clip(dx, hw - p[0]) && clip(-dy, p[1] + hh) && clip(dy, hh - p[1])
}

/**
 * @param {object} o
 * @param {[number,number]} o.a            tagged edge start
 * @param {[number,number]} o.b            tagged edge end
 * @param {[number,number]} o.normal       outward unit normal (towards the road)
 * @param {Array<[[number,number],[number,number]]>} o.segments  every drawn line
 * @param {(fontSize:number)=>number} o.widthAt  text width at a font size
 * @param {number} o.fontMax
 * @param {number} [o.fontMin]
 * @param {number} [o.maxReach]            farthest a "far boundary" may be
 * @param {number} [o.widthHint]           surveyor's typed width, same units
 * @returns {{cx:number, cy:number, fontSize:number, gap:number|null, clear:boolean, angleDeg:number}}
 */
export function fitRoadLabel({
  a, b, normal, segments, widthAt, fontMax, fontMin = fontMax * 0.5,
  maxReach = Infinity, widthHint = 0,
}) {
  const ex = b[0] - a[0], ey = b[1] - a[1]
  const len = Math.hypot(ex, ey) || 1
  const ux = ex / len, uy = ey / len
  const tol = Math.max(len * 1e-4, fontMax * 0.02)

  // Lines worth testing: everything except the tagged edge itself (collinear).
  const dist = (p) => Math.abs((p[0] - a[0]) * -uy + (p[1] - a[1]) * ux)
  const others = segments.filter(([p, q]) => !(dist(p) < tol && dist(q) < tol))

  // Far boundary: nearest line met by rays from a few points along the edge.
  let gap = null
  for (const t of [0.5, 0.25, 0.75]) {
    const o = [a[0] + ex * t + normal[0] * tol * 2, a[1] + ey * t + normal[1] * tol * 2]
    let best = null
    for (const [p, q] of others) {
      const h = rayHit(o, normal, p, q)
      if (h != null && (best == null || h < best)) best = h
    }
    if (best != null) { const g = best + tol * 2; gap = gap == null ? g : Math.min(gap, g) }
  }
  // Trust the geometry unless it is implausible against what the surveyor typed.
  if (gap != null && (gap > maxReach || (widthHint > 0 && (gap > widthHint * 2 || gap < widthHint * 0.5)))) gap = null
  if (gap == null && widthHint > 0) gap = widthHint
  if (gap == null) return { cx: 0, cy: 0, fontSize: fontMax, gap: null, clear: false, angleDeg: 0, ok: false }

  const centreOff = gap / 2
  const baseX = (t) => a[0] + ux * t + normal[0] * centreOff
  const baseY = (t) => a[1] + uy * t + normal[1] * centreOff
  const angleDeg = Math.atan2(ey, ex) * 180 / Math.PI
  const cosA = Math.cos(-Math.atan2(ey, ex)), sinA = Math.sin(-Math.atan2(ey, ex))

  const clearAt = (t, w, h) => {
    const cx = baseX(t), cy = baseY(t)
    const hw = w / 2 + h * 0.15, hh = h / 2 + h * 0.15
    const loc = (p) => {
      const dx = p[0] - cx, dy = p[1] - cy
      return [dx * cosA - dy * sinA, dx * sinA + dy * cosA]
    }
    for (const [p, q] of segments) if (segHitsBox(loc(p), loc(q), hw, hh)) return false
    return true
  }

  // Largest size that fits between the lines, shrinking until it also finds a
  // spot along the road with no line through it.
  let fs = Math.max(Math.min(fontMax, gap * 0.6), Math.min(fontMin, gap * 0.6))
  for (let guard = 0; guard < 8; guard++) {
    const w = widthAt(fs), h = fs * 0.9
    const step = Math.max(h * 0.5, len / 40)
    const offsets = [0]
    for (let k = 1; k * step <= len / 2; k++) offsets.push(k * step, -k * step)
    for (const o of offsets) {
      const t = len / 2 + o
      if (clearAt(t, w, h)) return { cx: baseX(t), cy: baseY(t), fontSize: fs, gap, clear: true, angleDeg, ok: true }
    }
    if (fs * 0.85 < Math.min(fontMin, gap * 0.6) * 0.99) break
    fs *= 0.85
  }
  return { cx: baseX(len / 2), cy: baseY(len / 2), fontSize: fs, gap, clear: false, angleDeg, ok: true }
}
