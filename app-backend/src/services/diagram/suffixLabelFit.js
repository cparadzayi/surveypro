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
 *  4. The letter is HORIZONTAL. Only where a horizontal box cannot clear the
 *     boundary lines is a minor rotation tried (up to MAX_TILT_DEG either way),
 *     and each degree costs a little, so the smallest tilt that clears wins. A
 *     letter is never stood vertical or laid along a diagonal side: horizontal
 *     reads best in the field.
 *  5. A letter must read as belonging to ITS beacon. Neighbouring beacons are
 *     passed in as `neighbours`; a candidate nearer to somebody else's circle
 *     than to its own is penalised, and a candidate is judged by what it leaves
 *     a neighbour on the same ring (that neighbour's best response), not by its
 *     own cost alone. So when two corners are
 *     close, one letter steps aside (D to the lower right) and leaves the spot
 *     beside the other circle for its own letter, whichever is placed first.
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

/** Largest tilt from horizontal a beacon letter may take to clear a boundary. */
export const MAX_TILT_DEG = 20
const COOP_SLACK = 4
/** A letter shrunk below this fraction of its base size counts as cramped. */
const CRAMPED_SCALE = 0.7
const TILT_STEPS_DEG = [7, 14, MAX_TILT_DEG]

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
 * Last-resort test for a stand too narrow to hold the letter anywhere: the centre
 * must be inside the parcel and the box clear of the beacon circle, but the box
 * may touch the boundary. Returns how many of the four corners fall outside the
 * parcel (so the least-straddling spot can be preferred), or -1 if rejected.
 */
function straddle(ring, beacon, cx, cy, w, h, rotDeg, beaconRadius, circleClear) {
  if (!inRing(cx, cy, ring)) return -1
  const r = rotDeg * DEG, c = Math.cos(-r), s = Math.sin(-r)
  const dx = beacon.x - cx, dy = beacon.y - cy
  const lx = dx * c - dy * s, ly = dx * s + dy * c
  const nx = Math.max(-w / 2, Math.min(lx, w / 2)), ny = Math.max(-h / 2, Math.min(ly, h / 2))
  if (Math.hypot(lx - nx, ly - ny) < beaconRadius + circleClear) return -1
  let out = 0
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const px = cx + Math.cos(r) * sx * w / 2 - Math.sin(r) * sy * h / 2
    const py = cy + Math.sin(r) * sx * w / 2 + Math.cos(r) * sy * h / 2
    if (!inRing(px, py, ring)) out++
  }
  return out
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
 * @returns {{cx:number, cy:number, fontSize:number, rotation:number, fitted:boolean,
 *            tier:number, cramped:boolean}}  `cramped` is true when the letter had to be
 *            shrunk well below its size, or squeezed against / across a boundary: the
 *            caller can then draw this beacon in an inset instead.
 */
export function fitSuffixLabel({
  beaconPos, polygon, widthAt, fontSize, beaconRadius,
  collides = null, minScale = 0.65, lineHeight = 1.2,
  edgeClear = 0.6, circleClear = 0.5, neighbours = [], relaxed = false, _tier = 0,
}) {
  const ring = dedupeRing(polygon)
  const rn = ring.length
  const centroid = rn ? centroidOf(ring) : beaconPos
  if (rn < 3) {
    return { cx: centroid.x, cy: centroid.y, fontSize, rotation: 0, fitted: false, tier: 4, cramped: true }
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
    // Which way is the interior? At a convex corner the summed unit vectors
    // point into it; at a REFLEX corner (the parcel wraps round a neighbour,
    // interior angle > 180) they point out of it and the interior bisector is
    // the opposite way. Probe just off the corner rather than guessing from the
    // centroid, which is on the wrong side for a wrapped corner.
    const eps = Math.max(0.3, Math.min(l1, l2) * 0.05)
    const fwd = inRing(B.x + bx * eps, B.y + by * eps, ring)
    const back = inRing(B.x - bx * eps, B.y - by * eps, ring)
    let sgn
    if (fwd !== back) sgn = fwd ? 1 : -1
    else sgn = (bx * (centroid.x - B.x) + by * (centroid.y - B.y)) >= 0 ? 1 : -1
    ix = sgn * bx
    iy = sgn * by
  }

  // Baseline angles to try: horizontal first, then small tilts either way.
  const rotations = [0, ...TILT_STEPS_DEG.flatMap((t) => [t, -t])]

  const penalty = (cx, cy, ownD) => {
    let pen = 0
    for (const nb of neighbours) {
      const dn = Math.hypot(cx - nb.x, cy - nb.y)
      if (dn < ownD * 1.15) pen += 4 + (ownD - dn) * 0.5
    }
    return pen
  }

  const scales = [1, 0.9, 0.8, 0.72, minScale].filter((s, i, a) => s >= minScale - 1e-9 && a.indexOf(s) === i)
  // A reflex corner has up to ~270 deg of interior, so the fan goes wide enough
  // to reach either side of it; the 0.03/deg cost keeps the narrow rays preferred.
  const perturbs = [0, 8, -8, 16, -16, 26, -26, 40, -40, 60, -60, 80, -80, 105, -105, 130, -130]
  const dStart = beaconRadius + 0.8
  const dStep = 0.4
  const dMax = beaconRadius + fontSize * lineHeight * 4

  // Per ray (size, rotation, bearing) the first clear spot, and the next one a
  // box-height further out, are kept as candidates.
  const cands = []
  for (const sc of scales) {
    const fs = fontSize * sc
    const w = widthAt(fs), h = fs * lineHeight
    const shrink = (1 - sc) * 10
    for (const rot of rotations) {
      const rotCost = Math.abs(rot) * 0.08 // 7 deg ~ 0.6, 20 deg ~ 1.6
      const rr = rot * DEG
      const ew = Math.abs(Math.cos(rr)) * w + Math.abs(Math.sin(rr)) * h
      const eh = Math.abs(Math.sin(rr)) * w + Math.abs(Math.cos(rr)) * h
      for (const pd of perturbs) {
        const a = pd * DEG, ca = Math.cos(a), sa = Math.sin(a)
        const dx = ix * ca - iy * sa, dy = ix * sa + iy * ca
        let kept = 0, firstD = 0
        for (let d = dStart; d <= dMax && kept < 2; d += dStep) {
          if (kept === 1 && d < firstD + h) continue
          const cx = beaconPos.x + dx * d, cy = beaconPos.y + dy * d
          let straddled = 0
          if (relaxed) {
            straddled = straddle(ring, beaconPos, cx, cy, w, h, rot, beaconRadius, circleClear)
            if (straddled < 0) continue
          } else if (!boxFitsInside(ring, beaconPos, cx, cy, w, h, rot, { beaconRadius, edgeClear, circleClear })) continue
          const box = { x: cx - ew / 2, y: cy - eh / 2, w: ew, h: eh }
          if (collides && collides(box)) continue
          if (kept === 0) firstD = d
          kept++
          cands.push({
            cost: d + shrink + rotCost + Math.abs(pd) * 0.03 + penalty(cx, cy, d) + straddled * 1.5,
            cx, cy, fontSize: fs, rotation: rot, fitted: true, box,
          })
        }
      }
    }
  }
  cands.sort((x, y) => x.cost - y.cost)
  let best = cands[0] || null

  // Neighbouring corners of this same ring will need a spot of their own. Judge
  // the leading candidates by what they leave the neighbours, not by their own
  // cost alone, so a letter steps aside rather than boxing a neighbour in.
  // Only the two nearest, and only those near enough to compete for the space:
  // each one costs a full response search per leading candidate.
  const ringNbs = neighbours
    .filter((nb) => Math.hypot(nb.x - beaconPos.x, nb.y - beaconPos.y) >= 0.5 &&
      Math.hypot(nb.x - beaconPos.x, nb.y - beaconPos.y) < fontSize * lineHeight * 3 &&
      ring.some((v) => Math.hypot(v.x - nb.x, v.y - nb.y) < 0.6))
    .sort((u, v) => Math.hypot(u.x - beaconPos.x, u.y - beaconPos.y) - Math.hypot(v.x - beaconPos.x, v.y - beaconPos.y))
    .slice(0, 2)
  if (best && ringNbs.length) {
    const hit = (u, v) => u.x < v.x + v.w && v.x < u.x + u.w && u.y < v.y + v.h && v.y < u.y + u.h
    const picked = []
    // A letter may give up at most COOP_SLACK of its own cost to help a neighbour:
    // two letters sharing the tip of a narrow stand must each stay beside their
    // own beacon, not have one sent up the stand so the other can have the corner.
    for (const c of cands) {
      if (picked.length >= 6 || c.cost > cands[0].cost + COOP_SLACK) break
      if (picked.every((q) => Math.hypot(q.cx - c.cx, q.cy - c.cy) > c.fontSize * 0.5)) picked.push(c)
    }
    let bestTotal = Infinity
    for (const c of picked) {
      let total = c.cost
      for (const nb of ringNbs) {
        const resp = fitSuffixLabel({
          beaconPos: nb, polygon: ring, widthAt, fontSize, beaconRadius, minScale,
          lineHeight, edgeClear, circleClear,
          collides: (r) => hit(r, c.box) || (collides ? collides(r) : false),
        })
        total += resp.fitted ? resp.cost : 12
      }
      if (total < bestTotal) { bestTotal = total; best = c }
    }
  }
  if (best) {
    return {
      cost: best.cost, cx: best.cx, cy: best.cy, fontSize: best.fontSize, rotation: best.rotation,
      fitted: true, tier: _tier, cramped: _tier >= 1 || best.fontSize < fontSize * CRAMPED_SCALE,
    }
  }

  // Nothing clears at the normal margins: retry tighter and smaller before
  // giving up, so a cramped corner still gets a letter beside its own beacon
  // rather than one dropped at the centroid.
  if (edgeClear > 0.15 && !relaxed) {
    return fitSuffixLabel({
      beaconPos, polygon, widthAt, fontSize, beaconRadius, collides, lineHeight,
      neighbours, minScale: minScale * 0.8, edgeClear: edgeClear * 0.25, circleClear: circleClear * 0.5,
      _tier: 1,
    })
  }

  // A stand narrower than the smallest letter: nothing fits WHOLLY inside. Rather
  // than drop the letter at the centroid, tens of points from its beacon, keep it
  // beside the beacon at the smallest size, centre inside the parcel and touching
  // the boundary as little as possible. If other labels block that too, accept
  // the overlap with them over losing the letter's place.
  if (!relaxed) {
    return fitSuffixLabel({
      beaconPos, polygon, widthAt, fontSize, beaconRadius, collides, lineHeight,
      neighbours, minScale: minScale * 0.8, edgeClear: 0, circleClear: circleClear * 0.5, relaxed: true,
      _tier: 2,
    })
  }
  if (collides) {
    return fitSuffixLabel({
      beaconPos, polygon, widthAt, fontSize, beaconRadius, collides: null, lineHeight,
      neighbours, minScale, edgeClear: 0, circleClear: circleClear * 0.5, relaxed: true,
      _tier: 3,
    })
  }

  // Still nothing: smallest font at the centroid, as before.
  return { cx: centroid.x, cy: centroid.y, fontSize: fontSize * minScale, rotation: 0, fitted: false, tier: 4, cramped: true }
}
