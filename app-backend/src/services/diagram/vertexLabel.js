/**
 * Place a vertex letter label OUTSIDE the parcel figure, as close to its beacon
 * as a clear spot allows. All coordinates are PDF points {px, py}; returns the
 * top-left {x, y} for pdfkit's `doc.text`. Both diagram renderers call this, so
 * a letter cannot land differently on the PDF and the DXF.
 *
 * A letter belongs to ONE beacon and has to be read as belonging to it, so the
 * search is distance-first: every bearing at a given distance is tried before
 * any bearing further out, and the first clear box wins. It used to have a
 * single degree of freedom -- straight out from the figure centre, stepping
 * further out on a collision -- which failed at both ends. A letter that found
 * its clear spot late ended up a full 4,4 mm off its beacon, further away than
 * the letter is tall; and one that found none marched through every candidate
 * and then fell back to the FIRST, which is how ten of twenty letters on the
 * Brackenhurst diagrams came to sit on the road shading. Trying bearings before
 * distances fixes both: there is nearly always clear paper beside a beacon, and
 * it is nearer than the clear paper beyond the obstacle.
 *
 * The fan is held to the outward half-plane so a letter never wanders inside
 * the figure, where it would read as belonging to the parcel rather than the
 * corner.
 */

function pointInRect(p, r) {
  return p.px >= r.x && p.px <= r.x + r.w && p.py >= r.y && p.py <= r.y + r.h
}

function segSeg(p1, p2, p3, p4) {
  const d = (p2.px - p1.px) * (p4.py - p3.py) - (p2.py - p1.py) * (p4.px - p3.px)
  if (d === 0) return false
  const t = ((p3.px - p1.px) * (p4.py - p3.py) - (p3.py - p1.py) * (p4.px - p3.px)) / d
  const u = ((p3.px - p1.px) * (p2.py - p1.py) - (p3.py - p1.py) * (p2.px - p1.px)) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}

function segIntersectsRect(a, b, r) {
  if (pointInRect(a, r) || pointInRect(b, r)) return true
  const c1 = { px: r.x, py: r.y }
  const c2 = { px: r.x + r.w, py: r.y }
  const c3 = { px: r.x + r.w, py: r.y + r.h }
  const c4 = { px: r.x, py: r.y + r.h }
  return segSeg(a, b, c1, c2) || segSeg(a, b, c2, c3) ||
    segSeg(a, b, c3, c4) || segSeg(a, b, c4, c1)
}

export function placeVertexLabel(vertex, centroid, {
  beaconR = 2.5, labelW = 6, labelH = 8, gap = 2, step = 3, maxSteps = 8, segments = [],
  fanDeg = 18, fanCount = 5, clearance = 0.75,
} = {}) {
  // Outward bearing: away from the figure centre.
  const ux = vertex.px - centroid.px
  const uy = vertex.py - centroid.py
  const len = Math.hypot(ux, uy) || 1
  const base = Math.atan2(uy / len, ux / len)

  const rectAt = (angle, ring) => {
    const dx = Math.cos(angle), dy = Math.sin(angle)
    // How far the box reaches from its own centre along THIS bearing. Measuring
    // it per bearing rather than taking the worst case for all of them holds
    // every letter the same `gap` off the beacon circle instead of setting each
    // one as far out as the most awkward direction would need.
    const reach = (Math.abs(dx) * labelW + Math.abs(dy) * labelH) / 2
    const off = beaconR + gap + reach + ring * step
    return {
      x: vertex.px + dx * off - labelW / 2,
      y: vertex.py + dy * off - labelH / 2,
      w: labelW,
      h: labelH,
    }
  }
  // Collision is judged on a box grown by `clearance`, so "clear" means there is
  // daylight around the letter rather than merely that nothing crosses it. A
  // letter missing the road shading by 0,13 mm -- which is what stand 404's D
  // did -- is clear by the arithmetic and touching to the eye.
  const hits = (rect) => {
    const t = {
      x: rect.x - clearance,
      y: rect.y - clearance,
      w: rect.w + 2 * clearance,
      h: rect.h + 2 * clearance,
    }
    return segments.reduce((n, [p, q]) => n + (segIntersectsRect(p, q, t) ? 1 : 0), 0)
  }

  // Distance first, bearing second: ring 0 straight out, then fanned either way
  // by fanDeg, before any of it is tried a step further out.
  let best = null
  for (let ring = 0; ring <= maxSteps; ring++) {
    for (let k = 0; k < fanCount; k++) {
      for (const sign of (k === 0 ? [1] : [1, -1])) {
        const rect = rectAt(base + sign * k * fanDeg * (Math.PI / 180), ring)
        const n = hits(rect)
        if (n === 0) return { x: rect.x, y: rect.y }
        // Nothing was clear yet; remember the least-obstructed box seen. Strict
        // `<` keeps the earliest -- which is the closest, given the loop order.
        if (best === null || n < best.n) best = { n, x: rect.x, y: rect.y }
      }
    }
  }
  return { x: best.x, y: best.y }
}
