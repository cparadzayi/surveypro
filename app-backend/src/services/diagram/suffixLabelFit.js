/**
 * Fit a beacon suffix letter ("A", "C", ...) wholly inside the parcel it belongs
 * to, as close to its beacon as the corner allows. Pure geometry: the caller
 * supplies the ring, a text-width function and a collision callback, so the PDF
 * and DXF writers share one rule and a letter cannot land differently on each.
 *
 * Rules, in the order they were asked for:
 *  1. The whole (possibly rotated) text box must clear every boundary line by
 *     `edgeClear`. The old test checked only the box CENTRE, so a letter could
 *     straddle a boundary and read as sitting on the line.
 *  2. At an acute corner the bisector is searched outward until the box clears
 *     BOTH lines of the corner, so the letter moves deeper into the parcel only
 *     as far as it must.
 *  3. A smaller font is allowed per beacon (down to `minScale` of the base), and
 *     is preferred over sitting far from the beacon: each candidate is costed on
 *     distance from the beacon plus a penalty for shrinking.
 *  4. Where two boundary lines run close and parallel (a thin strip), the box is
 *     also tried with its baseline perpendicular to the longer adjacent side,
 *     which lets the letter stand in the strip instead of spanning it.
 *
 * Coordinates are in whatever frame the caller uses; angles are `atan2(dy, dx)`
 * of that frame, so in PDF's y-down space they are the clockwise angle that
 * `doc.rotate` expects.
 */

const DEG = Math.PI / 180

/** Ray-cast point-in-polygon on [{x,y}]. */
function inRing(px, py, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j]
    if ((a.y > py) !== (b.y > py) &&
        px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** Does segment p-q touch the axis-aligned box [-hw,hw]x[-hh,hh]? (Liang-Barsky) */
function segHitsBox(p, q, hw, hh) {
  let t0 = 0, t1 = 1
  const dx = q.x - p.x, dy = q.y - p.y
  const clip = (pp, qq) => {
    if (pp === 0) return qq >= 0
    const r = qq / pp
    if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r }
    else { if (r < t0) return false; if (r < t1) t1 = r }
    return true
  }
  return clip(-dx, p.x + hw) && clip(dx, hw - p.x) &&
         clip(-dy, p.y + hh) && clip(dy, hh - p.y)
}

/** Baseline angle folded to (-90, 90] so text is never upside down. */
function readable(deg) {
  let a = ((deg % 360) + 360) % 360
  if (a > 180) a -= 360
  if (a > 90) a -= 180
  if (a <= -90) a += 180
  return a
}

function dedupeRing(polygon) {
  const last = polygon[polygon.length - 1], first = polygon[0]
  const closed = last && first &&
    Math.abs(last.x - first.x) < 0.001 && Math.abs(last.y - first.y) < 0.001
  return closed ? polygon.slice(0, -1) : polygon
}

function centroidOf(ring) {
  let sx = 0, sy = 0
  for (const p of ring) { sx += p.x; sy += p.y }
  return { x: sx / ring.length, y: sy / ring.length }
}

/**
 * Does a w x h box centred (cx,cy) and rotated `rotDeg` sit wholly inside `ring`,
 * clear of every edge by `edgeClear` and of the beacon circle by `circleClear`?
 */
export function boxFitsInside(ring, beacon, cx, cy, w, h, rotDeg, {
  beaconRadius = 0, edgeClear = 0.6, circleClear = 0.5,
} = {}) {
  if (!inRing(cx, cy, ring)) return false
  const r = rotDeg * DEG
  const c = Math.cos(-r), s = Math.sin(-r)
  const local = (p) => {
    const dx = p.x - cx, dy = p.y - cy
    return { x: dx * c - dy * s, y: dx * s + dy * c }
  }
  const hw = w / 2 + edgeClear, hh = h / 2 + edgeClear
  const lb = local(beacon)
  const nx = Math.max(-w / 2, Math.min(lb.x, w / 2))
  const ny = Math.max(-h / 2, Math.min(lb.y, h / 2))
  if (Math.hypot(lb.x - nx, lb.y - ny) < beaconRadius + circleClear) return false
  for (let i = 0; i < ring.length; i++) {
    if (segHitsBox(local(ring[i]), local(ring[(i + 1) % ring.length]), hw, hh)) return false
  }
  return true
}

/**
 * @param {object} o
 * @param {{x:number,y:number}} o.beaconPos
 * @param {Array<{x:number,y:number}>} o.polygon   parcel ring (closing vertex optional)
 * @param {(fontSize:number)=>number} o.widthAt     text width at a font size
 * @param {number} o.fontSize                       preferred (largest) font size
 * @param {number} o.beaconRadius
 * @param {(aabb:{x:number,y:number,w:number,h:number})=>boolean} [o.collides]
 * @param {number} [o.minScale=0.65]                smallest allowed fraction of fontSize
 * @param {number} [o.lineHeight=1.2]               box height as a multiple of fontSize
 * @returns {{cx:number, cy:number, fontSize:number, rotation:number, fitted:boolean}}
 */
export function fitSuffixLabel({
  beaconPos, polygon, widthAt, fontSize, beaconRadius,
  collides = null, minScale = 0.65, lineHeight = 1.2,
  edgeClear = 0.6, circleClear = 0.5,
}) {
  const ring = dedupeRing(polygon)
  const rn = ring.length
  const centroid = rn ? centroidOf(ring) : beaconPos
  if (rn < 3) {
    return { cx: centroid.x, cy: centroid.y, fontSize, rotation: 0, fitted: false }
  }

  // The ring vertex this beacon sits on, and the two edges meeting there.
  let bi = 0, bd = Infinity
  for (let i = 0; i < rn; i++) {
    const d = Math.hypot(ring[i].x - beaconPos.x, ring[i].y - beaconPos.y)
    if (d < bd) { bd = d; bi = i }
  }
  const B = ring[bi], P = ring[(bi - 1 + rn) % rn], N = ring[(bi + 1) % rn]
  const l1 = Math.hypot(P.x - B.x, P.y - B.y), l2 = Math.hypot(N.x - B.x, N.y - B.y)

  let ix = 0, iy = 1
  if (l1 > 1e-3 && l2 > 1e-3) {
    const u1x = (P.x - B.x) / l1, u1y = (P.y - B.y) / l1
    const u2x = (N.x - B.x) / l2, u2y = (N.y - B.y) / l2
    let bx = u1x + u2x, by = u1y + u2y
    const bl = Math.hypot(bx, by)
    if (bl < 1e-3) { bx = -u1y; by = u1x } else { bx /= bl; by /= bl }
    const dot = bx * (centroid.x - B.x) + by * (centroid.y - B.y)
    ix = dot >= 0 ? bx : -bx
    iy = dot >= 0 ? by : -by
  }

  // Baseline angles to try: horizontal, and perpendicular to the longer side.
  const rotations = [0]
  if (l1 > 1e-3 || l2 > 1e-3) {
    const Lng = l1 >= l2 ? P : N
    const edgeDeg = Math.atan2(Lng.y - B.y, Lng.x - B.x) / DEG
    const perp = readable(edgeDeg + 90)
    if (Math.abs(perp) > 1) rotations.push(perp)
  }

  const scales = [1, 0.9, 0.8, 0.72, minScale].filter((s, i, a) => s >= minScale - 1e-9 && a.indexOf(s) === i)
  const perturbs = [0, 8, -8, 16, -16, 26, -26, 40, -40]
  const dStart = beaconRadius + 0.8
  const dStep = 0.4
  const dMax = beaconRadius + fontSize * lineHeight * 4

  let best = null
  for (const sc of scales) {
    const fs = fontSize * sc
    const w = widthAt(fs), h = fs * lineHeight
    const shrink = (1 - sc) * 10
    for (const rot of rotations) {
      const rotCost = rot === 0 ? 0 : 1
      for (const pd of perturbs) {
        const a = pd * DEG, ca = Math.cos(a), sa = Math.sin(a)
        const dx = ix * ca - iy * sa, dy = ix * sa + iy * ca
        for (let d = dStart; d <= dMax; d += dStep) {
          const cost = d + shrink + rotCost + Math.abs(pd) * 0.03
          if (best && cost >= best.cost) break // later d only costs more
          const cx = beaconPos.x + dx * d, cy = beaconPos.y + dy * d
          if (!boxFitsInside(ring, beaconPos, cx, cy, w, h, rot, { beaconRadius, edgeClear, circleClear })) continue
          if (collides) {
            const r = rot * DEG
            const ew = Math.abs(Math.cos(r)) * w + Math.abs(Math.sin(r)) * h
            const eh = Math.abs(Math.sin(r)) * w + Math.abs(Math.cos(r)) * h
            if (collides({ x: cx - ew / 2, y: cy - eh / 2, w: ew, h: eh })) continue
          }
          best = { cost, cx, cy, fontSize: fs, rotation: rot, fitted: true }
          break // first clear d on this ray is its cheapest
        }
      }
    }
  }
  if (best) return best

  // Nothing clears at any size: smallest font at the centroid, as before.
  return { cx: centroid.x, cy: centroid.y, fontSize: fontSize * minScale, rotation: 0, fitted: false }
}
