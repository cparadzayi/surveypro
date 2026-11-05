/**
 * Geometry for the stand diagram's detail inset: a magnified circle drawn in free space for a sharp
 * corner of the figure, where the neighbours' names and the vertex letter cannot all stand clear of
 * each other at the sheet's scale.
 *
 * Pure functions over page points ([x, y] arrays); the renderer decides what to draw with them. The
 * inset is drawn from segments clipped to the circle here, not with a PDF clipping path, so the PDF and
 * the DXF replica (whose recorder only understands rectangular clips) show the same thing.
 */

/** A corner sharper than this (degrees, interior) gets a detail inset when it is crowded. */
export const DETAIL_ANGLE_DEG = 30

/** Diameter of the inset circle on the sheet, in points. */
export const DETAIL_DIAMETER_PT = 104

/** Round denominators an inset is drawn at, ascending. */
const NICE_DENOMINATORS = [50, 100, 200, 250, 500, 1000, 1500, 2000, 2500, 5000]

/** Signed area of a ring of [x, y] points (shoelace); the sign gives the winding. */
function signedArea(ring) {
  let s = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length]
    s += x1 * y2 - x2 * y1
  }
  return s / 2
}

/** Interior angle (degrees, 0-360) of a ring at vertex `i`; a reflex corner reads above 180. */
export function interiorAngleDeg(ring, i) {
  const n = ring.length
  const prev = ring[(i - 1 + n) % n], p = ring[i], next = ring[(i + 1) % n]
  const ux = prev[0] - p[0], uy = prev[1] - p[1]
  const vx = next[0] - p[0], vy = next[1] - p[1]
  const between = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)) * 180 / Math.PI
  // Convex at this vertex when the turn has the same sense as the ring's winding.
  const turn = (p[0] - prev[0]) * (next[1] - p[1]) - (p[1] - prev[1]) * (next[0] - p[0])
  const convex = turn * signedArea(ring) > 0
  return convex ? between : 360 - between
}

/** Indices of the ring's vertices whose interior angle is below `limitDeg`. */
export function sharpVertices(ring, limitDeg = DETAIL_ANGLE_DEG) {
  const out = []
  for (let i = 0; i < ring.length; i++) if (interiorAngleDeg(ring, i) < limitDeg) out.push(i)
  return out
}

/**
 * The part of segment a-b inside the circle (centre c, radius r), or null when none of it is.
 * Solves |a + t(b-a) - c|^2 = r^2 and keeps t within [0, 1].
 */
export function clipSegmentToCircle(a, b, c, r) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const fx = a[0] - c[0], fy = a[1] - c[1]
  const A = dx * dx + dy * dy
  if (A === 0) return Math.hypot(fx, fy) <= r ? [a, b] : null
  const B = 2 * (fx * dx + fy * dy)
  const C = fx * fx + fy * fy - r * r
  const disc = B * B - 4 * A * C
  if (disc < 0) return null
  const root = Math.sqrt(disc)
  const t0 = Math.max(0, (-B - root) / (2 * A))
  const t1 = Math.min(1, (-B + root) / (2 * A))
  if (t0 > t1) return null
  return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]]
}

/** Distance from point p to segment a-b. */
export function pointSegmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

/** Even-odd point-in-polygon. */
export function pointInPolygon(p, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/**
 * The inset's denominator: the largest round figure that magnifies the sheet's by at least three, so
 * the corner opens up enough to read, or null when there is none (a plan already drawn that large).
 */
export function insetDenominator(denom) {
  let pick = null
  for (const d of NICE_DENOMINATORS) if (d <= denom / 3) pick = d
  return pick
}

/** Whether segment a-b crosses or lies inside `box` ({x, y, w, h}) grown by `pad` (Liang-Barsky). */
export function segmentHitsBox(a, b, box, pad = 0) {
  const x0 = box.x - pad, y0 = box.y - pad, x1 = box.x + box.w + pad, y1 = box.y + box.h + pad
  const dx = b[0] - a[0], dy = b[1] - a[1]
  let t0 = 0, t1 = 1
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
    if (p === 0) { if (q < 0) return false; continue }
    const t = q / p
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t } else { if (t < t0) return false; if (t < t1) t1 = t }
  }
  return true
}

/** Whether two boxes overlap, each grown by `pad`. */
export function boxesOverlap(a, b, pad = 0) {
  return a.x - pad < b.x + b.w && a.x + a.w + pad > b.x && a.y - pad < b.y + b.h && a.y + a.h + pad > b.y
}

/**
 * Seats a w x h label on the first of `candidates` (centres, in order of preference) where its box lies
 * inside the circle and touches no segment and no placed box. When none is clean the one with the fewest
 * collisions is returned, marked `clean: false`, so the caller can decide to drop it.
 */
export function placeLabel({ w, h, candidates, circle, segments, boxes, pad = 1 }) {
  let best = null
  for (const [cx, cy] of candidates) {
    const box = { x: cx - w / 2, y: cy - h / 2, w, h }
    const corners = [[box.x, box.y], [box.x + w, box.y], [box.x, box.y + h], [box.x + w, box.y + h]]
    if (corners.some(([x, y]) => Math.hypot(x - circle.c[0], y - circle.c[1]) > circle.r)) continue
    let hits = 0
    for (const [a, b] of segments) if (segmentHitsBox(a, b, box, pad)) hits++
    for (const o of boxes) if (boxesOverlap(box, o, pad)) hits++
    if (hits === 0) return { ...box, clean: true }
    if (!best || hits < best.hits) best = { ...box, clean: false, hits }
  }
  return best
}

/**
 * Lays out one detail inset for the sharp corner `i` of `ring` (the figure, page points), or returns
 * null when it is not warranted or there is no room. Nothing is drawn here: the result is the geometry
 * to paint and the space it takes, so the caller can plan every inset BEFORE the main figure's letters
 * are placed and have them keep clear of the ring and the leader.
 *
 * `nbs` are the neighbours as { key, stand, ring } in page points; `obstacles` are segments already on
 * the sheet; `widthOf(text)` measures text at the label size `fs`. The corner is magnified about the
 * middle of the corner and the neighbours' corners round it, at `denom / insetDenom`.
 */
export function planDetailInset({ ring, i, nbs, denom, insetDenom, bounds, obstacles, fs, widthOf, letters, number }) {
  const k = denom / insetDenom
  const R = DETAIL_DIAMETER_PT / 2
  const ringR = R / k
  const p = ring[i]
  // The neighbours with a corner inside the area to be magnified: those are the ones whose names crowd
  // this beacon (a neighbour that only runs along a side keeps its label there).
  const near = nbs.filter((x) => x.ring.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= ringR))
  if (near.length < 2) return null
  const cluster = [p, ...near.flatMap((x) => x.ring.filter((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) <= ringR))]
  const f = [cluster.reduce((s, q) => s + q[0], 0) / cluster.length, cluster.reduce((s, q) => s + q[1], 0) / cluster.length]

  // Room for the circle with its title above and caption below, nearest the corner but clear of it.
  const c = findInsetCentre({
    target: f, r: R, bounds, margin: fs + 8, clear: 8, minFromTarget: R + 18, segments: obstacles,
  })
  if (!c) return null
  const to = (q) => [c[0] + (q[0] - f[0]) * k, c[1] + (q[1] - f[1]) * k]
  const circle = { c, r: R }

  // What is drawn inside the circle: segments cut to it, the neighbours' dashed and the figure's solid.
  const cut = (pts, closed) => {
    const out = [], n = pts.length
    for (let j = 0; j < (closed ? n : n - 1); j++) {
      const seg = clipSegmentToCircle(pts[j], pts[(j + 1) % n], c, R)
      if (seg) out.push(seg)
    }
    return out
  }
  const mapped = nbs.map((x) => ({ ...x, m: x.ring.map(to) }))
  const subjM = ring.map(to)
  const nbSegs = mapped.flatMap((x) => cut(x.m, false))
  const subjSegs = cut(subjM, true)
  const drawn = [...nbSegs, ...subjSegs]

  // Beacons inside the circle: the figure's own and the neighbours' shared corners, once each.
  const BEACON_R = 2.2
  const seen = new Set(), beacons = []
  for (const q of [...subjM, ...mapped.flatMap((x) => x.m)]) {
    if (Math.hypot(q[0] - c[0], q[1] - c[1]) > R - 3) continue
    const key = `${Math.round(q[0] * 10)}:${Math.round(q[1] * 10)}`
    if (seen.has(key)) continue
    seen.add(key); beacons.push(q)
  }
  const boxes = beacons.map((q) => ({ x: q[0] - BEACON_R, y: q[1] - BEACON_R, w: 2 * BEACON_R, h: 2 * BEACON_R }))

  // Lettering, set one label at a time on a spot clear of every line, beacon and label placed before it:
  // the figure's vertex letters first (they belong beside their beacons), then the neighbours' names.
  const labels = []
  const sc = [subjM.reduce((s, q) => s + q[0], 0) / subjM.length, subjM.reduce((s, q) => s + q[1], 0) / subjM.length]
  letters.forEach((letter, j) => {
    const q = subjM[j]
    if (Math.hypot(q[0] - c[0], q[1] - c[1]) > R - 8) return
    const away = Math.atan2(q[1] - sc[1], q[0] - sc[0])
    const candidates = []
    for (const radius of [7, 9, 12]) {
      for (const turn of [0.6, -0.6, 0, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5, Math.PI]) {
        candidates.push([q[0] + radius * Math.cos(away + turn), q[1] + radius * Math.sin(away + turn)])
      }
    }
    const w = widthOf(letter)
    const at = placeLabel({ w, h: fs, candidates, circle, segments: drawn, boxes })
    if (at) { labels.push({ text: letter, x: at.x, y: at.y, kind: 'vertex' }); boxes.push(at) }
  })
  const taken = new Set()
  const grid = 21
  for (const x of mapped) {
    if (!x.stand) continue
    const w = widthOf(x.stand)
    // Inside its own parcel, the clearest places first.
    const spots = []
    for (let a = 0; a < grid; a++) {
      for (let b = 0; b < grid; b++) {
        const s = [c[0] - R + (2 * R * (a + 0.5)) / grid, c[1] - R + (2 * R * (b + 0.5)) / grid]
        if (Math.hypot(s[0] - c[0], s[1] - c[1]) > R * 0.8 || !pointInPolygon(s, x.m)) continue
        let clear = Infinity
        for (const [u, v] of drawn) clear = Math.min(clear, pointSegmentDistance(s, u, v))
        spots.push({ s, clear })
      }
    }
    spots.sort((u, v) => v.clear - u.clear)
    const at = placeLabel({ w, h: fs, candidates: spots.map((u) => u.s), circle, segments: drawn, boxes })
    if (!at || !at.clean) continue
    labels.push({ text: x.stand, x: at.x, y: at.y, kind: 'name' })
    boxes.push(at)
    if (near.some((y) => y.key === x.key)) taken.add(x.key)
  }

  // The leader runs from the ring round the corner to the rim of the circle.
  const dx = c[0] - f[0], dy = c[1] - f[1], dl = Math.hypot(dx, dy) || 1
  const leader = [[f[0] + (dx / dl) * ringR, f[1] + (dy / dl) * ringR], [c[0] - (dx / dl) * R, c[1] - (dy / dl) * R]]
  const title = `Inset ${number}`
  const caption = `Scale 1 : ${insetDenom}`
  const tw = widthOf(title), cw = widthOf(caption)
  const titleBox = { x: c[0] - tw / 2, y: c[1] - R - fs - 3, w: tw, h: fs }
  const captionBox = { x: c[0] - cw / 2, y: c[1] + R + 3, w: cw, h: fs }
  const polygon = (centre, r) => Array.from({ length: 12 }, (_, j) => [
    [centre[0] + r * Math.cos((j * Math.PI) / 6), centre[1] + r * Math.sin((j * Math.PI) / 6)],
    [centre[0] + r * Math.cos(((j + 1) * Math.PI) / 6), centre[1] + r * Math.sin(((j + 1) * Math.PI) / 6)],
  ])
  const boxSegs = (b) => [
    [[b.x, b.y], [b.x + b.w, b.y]], [[b.x + b.w, b.y], [b.x + b.w, b.y + b.h]],
    [[b.x + b.w, b.y + b.h], [b.x, b.y + b.h]], [[b.x, b.y + b.h], [b.x, b.y]],
  ]

  return {
    c, f, R, ringR, k, nbSegs, subjSegs, beacons, beaconR: BEACON_R, labels, taken,
    title, caption, titleBox, captionBox, leader,
    // The space the inset takes on the sheet, as segments for the main figure's labels to keep clear of.
    blocks: [...polygon(c, R + 2), ...polygon(f, ringR + 2), ...boxSegs(titleBox), ...boxSegs(captionBox), leader],
  }
}

/**
 * The centre for an inset circle of radius `r`: the free spot nearest `target` (the corner), at least
 * `minFromTarget` from it so the circle does not sit on top of what it magnifies, whose rim stays
 * `clear` away from every obstacle segment and which lies inside `bounds` with `margin` to spare.
 * Searched on a grid; null when the sheet has no room.
 */
export function findInsetCentre({ target, r, bounds, margin, clear, minFromTarget, segments, step = 6 }) {
  let best = null, bestD = Infinity
  const x0 = bounds.x + margin + r, x1 = bounds.x + bounds.width - margin - r
  const y0 = bounds.y + margin + r, y1 = bounds.y + bounds.height - margin - r
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const d = Math.hypot(x - target[0], y - target[1])
      if (d < minFromTarget || d >= bestD) continue
      let ok = true
      for (const [a, b] of segments) {
        if (pointSegmentDistance([x, y], a, b) < r + clear) { ok = false; break }
      }
      if (ok) { best = [x, y]; bestD = d }
    }
  }
  return best
}
