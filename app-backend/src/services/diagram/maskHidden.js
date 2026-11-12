/**
 * What a white fill hides in the PDF, taken out of the drawing instead of covered.
 *
 * The PDF masks with paint: a white fill behind each stand (and a white disc in each beacon) is drawn over
 * whatever was drawn earlier, so the neighbouring stands' edges and the circles of beacons that lie inside the
 * stand never show. A DXF written without those fills (they are picked ahead of the line under them) would draw
 * all of it. This removes exactly the part of each earlier line and circle that a LATER white fill covers, so
 * the CAD drawing shows what the PDF shows with nothing to select but the lines themselves.
 *
 * Works on recorded ops (page points). Returns a new list; fills are left in place (the caller skips them).
 */
const isWhite = (hex) => /^#?f{6}$/i.test(String(hex ?? ''))

const ringBox = (ring) => {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity
  for (const [x, y] of ring) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y }
  return [a, b, c, d]
}

const inRing = (x, y, ring) => {
  let ins = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins
  }
  return ins
}

// A point within EDGE_EPS page points of a fill's edge is on the edge, not under the fill: a stand's side shared with
// a neighbour lies exactly on the neighbour's fill, and the PDF shows it (the stand's own stroke is drawn after).
const EDGE_EPS = 0.05

const distToRing = (x, y, ring) => {
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0], ay = ring[j][1], bx = ring[i][0], by = ring[i][1]
    const dx = bx - ax, dy = by - ay
    const l2 = dx * dx + dy * dy
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0
    const d = Math.hypot(x - (ax + t * dx), y - (ay + t * dy))
    if (d < best) best = d
  }
  return best
}

export function maskHiddenByWhiteFills(ops) {
  const fills = []
  ops.forEach((o, i) => {
    if (o.type === 'fill' && isWhite(o.color) && o.layer !== 'PAPER') {
      const rings = o.rings.filter((r) => r.length > 2)
      if (rings.length) fills.push({ i, rings, boxes: rings.map(ringBox) })
    } else if (o.type === 'discFill' && isWhite(o.color)) {
      fills.push({ i, disc: { cx: o.cx, cy: o.cy, r: o.r }, boxes: [[o.cx - o.r, o.cy - o.r, o.cx + o.r, o.cy + o.r]] })
    }
  })
  if (!fills.length) return ops

  const covers = (f, x, y) => {
    if (f.disc) return Math.hypot(x - f.disc.cx, y - f.disc.cy) < f.disc.r - EDGE_EPS
    let n = 0
    f.rings.forEach((r, k) => {
      const b = f.boxes[k]
      if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && inRing(x, y, r)) n++
    })
    if (n % 2 !== 1) return false
    return !f.rings.some((r) => distToRing(x, y, r) < EDGE_EPS)
  }
  const covered = (x, y, after) => fills.some((f) => f.i > after && covers(f, x, y))

  // Parameters t (0..1) along p->q where the segment crosses the edge of a later fill.
  const cuts = (p, q, after) => {
    const ts = []
    const minx = Math.min(p[0], q[0]), maxx = Math.max(p[0], q[0]), miny = Math.min(p[1], q[1]), maxy = Math.max(p[1], q[1])
    const dx = q[0] - p[0], dy = q[1] - p[1]
    for (const f of fills) {
      if (f.i <= after) continue
      if (!f.boxes.some((b) => b[0] <= maxx && b[2] >= minx && b[1] <= maxy && b[3] >= miny)) continue
      if (f.disc) {
        const fx = p[0] - f.disc.cx, fy = p[1] - f.disc.cy
        const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - f.disc.r * f.disc.r
        const disc = B * B - 4 * A * C
        if (A > 0 && disc > 0) for (const t of [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)]) if (t > 0 && t < 1) ts.push(t)
        continue
      }
      for (const r of f.rings) {
        for (let k = 0, m = r.length - 1; k < r.length; m = k++) {
          const ex = r[k][0] - r[m][0], ey = r[k][1] - r[m][1]
          const den = dx * ey - dy * ex
          if (Math.abs(den) < 1e-12) continue
          const t = ((r[m][0] - p[0]) * ey - (r[m][1] - p[1]) * ex) / den
          const u = ((r[m][0] - p[0]) * dy - (r[m][1] - p[1]) * dx) / den
          if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t)
        }
      }
    }
    return ts.sort((a, b) => a - b)
  }

  const out = []
  ops.forEach((o, i) => {
    if (o.type === 'circle') {
      if (!covered(o.cx, o.cy, i)) out.push(o)
      return
    }
    if (o.type !== 'stroke') { out.push(o); return }
    const pts = o.closed ? [...o.pts, o.pts[0]] : o.pts
    let run = null
    let any = false
    const flush = () => { if (run && run.length > 1) out.push({ ...o, pts: run, closed: false }); run = null }
    for (let k = 0; k + 1 < pts.length; k++) {
      const p = pts[k], q = pts[k + 1]
      const ts = [0, ...cuts(p, q, i), 1]
      for (let s = 0; s + 1 < ts.length; s++) {
        const t0 = ts[s], t1 = ts[s + 1]
        if (t1 - t0 < 1e-9) continue
        const tm = (t0 + t1) / 2
        const hidden = covered(p[0] + (q[0] - p[0]) * tm, p[1] + (q[1] - p[1]) * tm, i)
        if (hidden) { any = true; flush(); continue }
        const a = [p[0] + (q[0] - p[0]) * t0, p[1] + (q[1] - p[1]) * t0]
        const b = [p[0] + (q[0] - p[0]) * t1, p[1] + (q[1] - p[1]) * t1]
        if (!run) run = [a]
        else { const l = run[run.length - 1]; if (Math.hypot(l[0] - a[0], l[1] - a[1]) > 1e-6) { flush(); run = [a] } }
        run.push(b)
      }
    }
    if (!any) { out.push(o); return }
    flush()
  })
  return out
}
