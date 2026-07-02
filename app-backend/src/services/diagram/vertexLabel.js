/**
 * Place a vertex letter label OUTSIDE the parcel figure: offset along the outward
 * direction (away from the figure centroid), past the beacon circle, stepping
 * further out until the label box no longer crosses any drawn line segment
 * (the subject edges or adjoining-property lines). All coordinates are PDF points
 * {px, py}. Returns the top-left {x, y} for pdfkit's `doc.text`.
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
} = {}) {
  // Outward unit direction (away from the figure centre).
  let ux = vertex.px - centroid.px
  let uy = vertex.py - centroid.py
  const len = Math.hypot(ux, uy) || 1
  ux /= len
  uy /= len
  const half = Math.max(labelW, labelH) / 2

  let fallback = null
  for (let i = 0; i <= maxSteps; i++) {
    const off = beaconR + gap + half + i * step
    const cx = vertex.px + ux * off
    const cy = vertex.py + uy * off
    const rect = { x: cx - labelW / 2, y: cy - labelH / 2, w: labelW, h: labelH }
    if (fallback === null) fallback = rect
    const hit = segments.some(([p, q]) => segIntersectsRect(p, q, rect))
    if (!hit) return { x: rect.x, y: rect.y }
  }
  return { x: fallback.x, y: fallback.y }
}
