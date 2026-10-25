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
/**
 * The smallest a letter may be drawn, as a fraction of its base size (8pt base ->
 * 6pt): below that a plan stops being comfortably readable, so a letter that
 * cannot fit at this size goes to an inset rather than getting smaller. The same
 * floor holds at every fallback tier.
 */
const MIN_SCALE = 0.75
/** A letter shrunk below this fraction of its base size counts as cramped. */
const CRAMPED_SCALE = MIN_SCALE
/**
 * Least clear gap between a letter's box and the beacon circle, however far the
 * margins are relaxed. The circle is stroked, so its ink reaches past the radius;
 * a smaller gap reads as the letter nudging the circle.
 */
const CIRCLE_CLEAR_FLOOR = 0.7
/** Corner opening above which a letter may sit straight below its beacon, and the cost it gains for it. */
/** A letter this many font sizes (plus the circle radius) from its beacon is far, and is pulled in if it can be. */
const FAR_LETTERS = 1.6
const PULL_EDGE_FRACTION = 0.4
const PULL_MIN_GAIN = 3
/** An acute corner needs its letter deep in the stand to clear both lines; pulling it in there would touch them. */
const PULL_MIN_OPENING_DEG = 60
const BELOW_MIN_DEG = 100
const BELOW_COST = -1.5
/** Near-right corners (this opening up to BELOW_MIN_DEG) take it too when the bisector leans left. */
const NEAR_RIGHT_MIN_DEG = 80
/** A left-leaning near-right corner is asked for below, so it earns more than an obtuse one. */
const NEAR_RIGHT_COST = -5
const TILT_STEPS_DEG = [7, 14, MAX_TILT_DEG]
/**
 * Beyond MAX_TILT_DEG only as a fallback: where nothing clears with the letter
 * (near) horizontal, even shrunk, it may turn to any angle so its short side lies
 * across a narrow or diagonal stand. That costs less than an inset, and the
 * letter still sits wholly inside its own parcel at the normal clearances.
 */
const FREE_STEPS_DEG = [30, 45, 60, 75, 90]

/**
 * The ink of a bold capital, measured by rendering one: pdfkit's text() puts it at
 * the TOP of the line box it is drawn from, not the middle. It is 0.71 x the font
 * size tall and centred 0.244 x the font size ABOVE the box centre, so a fit that
 * clears the whole 1.2 x line box wastes 40% of a letter's height and clears the
 * wrong area. In `ink` mode the fit works on the real ink box and gives back the
 * draw centre that puts the ink there.
 */
export const INK_HEIGHT = 0.78   // 0.71 ink plus a margin for round caps (C, D, G)
export const INK_UP = 0.244

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
  const hw = w / 2 + edgeClear, hh = h / 2 + edgeClear
  const bdx = beacon.x - cx, bdy = beacon.y - cy
  const lbx = bdx * c - bdy * s, lby = bdx * s + bdy * c
  const nx = Math.max(-w / 2, Math.min(lbx, w / 2))
  const ny = Math.max(-h / 2, Math.min(lby, h / 2))
  if (Math.hypot(lbx - nx, lby - ny) < beaconRadius + circleClear) return false
  // The padded box lies inside a circle of radius R about its centre (rotation
  // keeps it there), so an edge wholly outside the square [cx±R, cy±R] cannot
  // touch it. Most edges of a large parcel are rejected here, unrotated.
  const R = Math.hypot(hw, hh)
  const n = ring.length
  let prev = ring[n - 1]
  const p = { x: 0, y: 0 }, q = { x: 0, y: 0 }
  for (let i = 0; i < n; i++) {
    const a = prev, b = ring[i]
    prev = b
    if ((a.x < cx - R && b.x < cx - R) || (a.x > cx + R && b.x > cx + R) ||
        (a.y < cy - R && b.y < cy - R) || (a.y > cy + R && b.y > cy + R)) continue
    let dx = a.x - cx, dy = a.y - cy
    p.x = dx * c - dy * s; p.y = dx * s + dy * c
    dx = b.x - cx; dy = b.y - cy
    q.x = dx * c - dy * s; q.y = dx * s + dy * c
    if (segHitsBox(p, q, hw, hh)) return false
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
 * @param {number} [o.minScale=0.75]                smallest allowed fraction of fontSize
 * @param {number} [o.lineHeight=1.2]               box height as a multiple of fontSize
 * @returns {{cx:number, cy:number, fontSize:number, rotation:number, fitted:boolean,
 *            tier:number, cramped:boolean}}  `cramped` is true when the letter had to be
 *            shrunk well below its size, or squeezed against / across a boundary: the
 *            caller can then draw this beacon in an inset instead.
 */
export function fitSuffixLabel({
  beaconPos, polygon, widthAt, fontSize, beaconRadius,
  collides = null, minScale = MIN_SCALE, lineHeight = 1.2,
  edgeClear = 0.6, circleClear = 0.8, neighbours = [], relaxed = false, _tier = 0, freeRot = false,
  ink = false, pull = true,
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
  const rotations = [0, ...TILT_STEPS_DEG.flatMap((t) => [t, -t]),
    ...(freeRot ? FREE_STEPS_DEG.flatMap((t) => [t, -t]) : [])]

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
  const rays = perturbs.map((pd) => {
    const a = pd * DEG, ca = Math.cos(a), sa = Math.sin(a)
    return { dx: ix * ca - iy * sa, dy: ix * sa + iy * ca, cost: Math.abs(pd) * 0.03 }
  })
  // At an obtuse corner the room below the circle reads best: a horizontal letter
  // straight under its beacon, the same way down the run. Offered as one more ray,
  // with a small bonus over the bisector, only where it points into the parcel
  // (PDF y-down, so "below" is +y). Every spot on it faces the same clearance and
  // collision tests, so it wins only where it fits.
  let openingDeg = 180
  if (l1 > 1e-3 && l2 > 1e-3) {
    const cosOpen = ((P.x - B.x) * (N.x - B.x) + (P.y - B.y) * (N.y - B.y)) / (l1 * l2)
    const opening = Math.acos(Math.max(-1, Math.min(1, cosOpen))) / DEG
    openingDeg = opening
    const eps = Math.max(0.3, Math.min(l1, l2) * 0.05)
    // Convex only: the interior bisector then runs along the sum of the edge directions.
    const convex = ix * ((P.x - B.x) / l1 + (N.x - B.x) / l2) + iy * ((P.y - B.y) / l1 + (N.y - B.y) / l2) > 0
    // A near-right corner whose bisector leans left would put the letter beside
    // the circle on its left; straight below reads better there too.
    const belowOk = opening > BELOW_MIN_DEG || (opening >= NEAR_RIGHT_MIN_DEG && ix < -0.1)
    if (convex && belowOk && opening < 180 && inRing(B.x, B.y + eps, ring)) {
      rays.push({ dx: 0, dy: 1, cost: opening > BELOW_MIN_DEG ? BELOW_COST : NEAR_RIGHT_COST })
    }
  }
  const dStart = beaconRadius + 0.8
  const dStep = 0.4
  const dMax = beaconRadius + fontSize * lineHeight * 4

  // Per ray (size, rotation, bearing) the first clear spot, and the next one a
  // box-height further out, are kept as candidates.
  const cands = []
  // A ray leaves the ring's bounding box once and never returns, and a centre
  // outside the ring fits nowhere, so each ray stops there rather than walking on.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const v of ring) {
    if (v.x < minX) minX = v.x
    if (v.x > maxX) maxX = v.x
    if (v.y < minY) minY = v.y
    if (v.y > maxY) maxY = v.y
  }
  for (const sc of scales) {
    const fs = fontSize * sc
    const w = widthAt(fs), h = fs * (ink ? INK_HEIGHT : lineHeight)
    const shrink = (1 - sc) * 10
    for (const rot of rotations) {
      const rotCost = Math.abs(rot) * 0.08 // 7 deg ~ 0.6, 20 deg ~ 1.6
      const rr = rot * DEG
      const ew = Math.abs(Math.cos(rr)) * w + Math.abs(Math.sin(rr)) * h
      const eh = Math.abs(Math.sin(rr)) * w + Math.abs(Math.cos(rr)) * h
      for (const ray of rays) {
        const dx = ray.dx, dy = ray.dy
        let kept = 0, firstD = 0
        for (let d = dStart; d <= dMax && kept < 2; d += dStep) {
          if (kept === 1 && d < firstD + h) continue
          const cx = beaconPos.x + dx * d, cy = beaconPos.y + dy * d
          if (cx < minX || cx > maxX || cy < minY || cy > maxY) break
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
            cost: d + shrink + rotCost + ray.cost + penalty(cx, cy, d) + straddled * 1.5,
            cx, cy, fontSize: fs, rotation: rot, fitted: true, box,
          })
        }
      }
    }
  }
  cands.sort((x, y) => x.cost - y.cost)
  let best = cands[0] || null

  // Nothing clears with the letter near horizontal: let it turn freely before the
  // margins are relaxed or the letter is handed to an inset.
  if (!best && !freeRot && !relaxed && _tier === 0) {
    const turned = fitSuffixLabel({
      beaconPos, polygon, widthAt, fontSize, beaconRadius, collides, minScale, lineHeight,
      edgeClear, circleClear, neighbours, freeRot: true, ink,
    })
    if (turned.fitted) return turned
  }

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
          lineHeight, edgeClear, circleClear, ink, pull: false,
          collides: (r) => hit(r, c.box) || (collides ? collides(r) : false),
        })
        total += resp.fitted ? resp.cost : 12
      }
      if (total < bestTotal) { bestTotal = total; best = c }
    }
  }
  // A letter that only fits well away from its beacon reads as belonging to a
  // neighbour. Before accepting it, look again with the boundary margin slackened
  // (the letter may then turn freely too); take that spot only if it is clearly
  // nearer, still full size, and the circle gap is unchanged.
  if (best && pull && !relaxed && _tier === 0 && openingDeg >= PULL_MIN_OPENING_DEG) {
    const away = (c) => Math.hypot(c.cx - beaconPos.x, c.cy - beaconPos.y)
    if (away(best) > beaconRadius + fontSize * FAR_LETTERS) {
      const near = fitSuffixLabel({
        beaconPos, polygon, widthAt, fontSize, beaconRadius, collides, minScale, lineHeight,
        edgeClear: edgeClear * PULL_EDGE_FRACTION, circleClear, neighbours, freeRot: true, ink, pull: false,
      })
      if (near.fitted && !near.cramped && away({ cx: near.inkCx, cy: near.inkCy }) < away(best) - PULL_MIN_GAIN) return near
    }
  }
  if (best) {
    // The search placed the INK; the caller draws a line box, so hand back the box
    // centre that puts the ink there (the ink sits INK_UP above it, along the turn).
    const th = best.rotation * DEG, k = ink ? INK_UP * best.fontSize : 0
    return {
      cost: best.cost, cx: best.cx - k * Math.sin(th), cy: best.cy + k * Math.cos(th),
      inkCx: best.cx, inkCy: best.cy, fontSize: best.fontSize, rotation: best.rotation,
      fitted: true, tier: _tier, free: freeRot, cramped: _tier >= 1 || best.fontSize < fontSize * CRAMPED_SCALE - 1e-9,
    }
  }

  // Nothing clears at the normal margins: retry tighter and smaller before
  // giving up, so a cramped corner still gets a letter beside its own beacon
  // rather than one dropped at the centroid.
  if (edgeClear > 0.15 && !relaxed) {
    return fitSuffixLabel({
      beaconPos, polygon, widthAt, fontSize, beaconRadius, collides, lineHeight, ink,
      neighbours, minScale, edgeClear: edgeClear * 0.25, circleClear: Math.max(circleClear * 0.5, CIRCLE_CLEAR_FLOOR),
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
      beaconPos, polygon, widthAt, fontSize, beaconRadius, collides, lineHeight, ink,
      neighbours, minScale, edgeClear: 0, circleClear: Math.max(circleClear * 0.5, CIRCLE_CLEAR_FLOOR), relaxed: true,
      _tier: 2,
    })
  }
  if (collides) {
    return fitSuffixLabel({
      beaconPos, polygon, widthAt, fontSize, beaconRadius, collides: null, lineHeight, ink,
      neighbours, minScale, edgeClear: 0, circleClear: Math.max(circleClear * 0.5, CIRCLE_CLEAR_FLOOR), relaxed: true,
      _tier: 3,
    })
  }

  // Still nothing: smallest font at the centroid, as before.
  return { cx: centroid.x, cy: centroid.y, fontSize: fontSize * minScale, rotation: 0, fitted: false, tier: 4, cramped: true }
}
