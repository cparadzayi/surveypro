/**
 * Triangulate a polygon with holes (an outline and the rings cut out of it), for turning an
 * even-odd PDF fill -- a band between a boundary and its inward offset -- into the SOLID triangles a
 * Release 12 DXF can hold.
 *
 * Each hole is joined to the outline by a bridge between a pair of vertices that see each other,
 * making one weakly simple polygon, which is then ear-clipped.
 */

const area2 = (p) => p.reduce((a, q, i) => { const r = p[(i + 1) % p.length]; return a + (q[0] * r[1] - r[0] * q[1]) }, 0)
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9

function segmentsCross(a, b, c, d) {
  // Proper crossing only: sharing an endpoint, or touching at one, does not count.
  const d1 = cross(a, b, c), d2 = cross(a, b, d), d3 = cross(c, d, a), d4 = cross(c, d, b)
  return ((d1 > 1e-12 && d2 < -1e-12) || (d1 < -1e-12 && d2 > 1e-12)) &&
         ((d3 > 1e-12 && d4 < -1e-12) || (d3 < -1e-12 && d4 > 1e-12))
}

const orient = (ring, ccw) => ((area2(ring) >= 0) === ccw ? ring.slice() : ring.slice().reverse())

/** @param {number[][]} outer  @param {number[][][]} holes  @returns {number[][][]} triangles */
export function triangulateWithHoles(outer, holes = []) {
  let poly = orient(outer, true)
  const hs = holes.map((h) => orient(h, false))
  for (const hole of hs) {
    let best = null
    for (let i = 0; i < poly.length; i++) {
      for (let j = 0; j < hole.length; j++) {
        const d = Math.hypot(poly[i][0] - hole[j][0], poly[i][1] - hole[j][1])
        if (best && d >= best.d) continue
        // The bridge must not cross the outline, the merged polygon so far, or this hole.
        const a = poly[i], b = hole[j]
        let ok = true
        for (let k = 0; ok && k < poly.length; k++) if (segmentsCross(a, b, poly[k], poly[(k + 1) % poly.length])) ok = false
        for (let k = 0; ok && k < hole.length; k++) if (segmentsCross(a, b, hole[k], hole[(k + 1) % hole.length])) ok = false
        if (ok) best = { i, j, d }
      }
    }
    if (!best) continue // no clear bridge: leave this hole out rather than fill across it wrongly
    const { i, j } = best
    const rotated = [...hole.slice(j), ...hole.slice(0, j)]
    poly = [...poly.slice(0, i + 1), ...rotated, rotated[0], poly[i], ...poly.slice(i + 1)]
  }
  return earClip(poly)
}

function earClip(poly) {
  const tris = []
  const idx = poly.map((_, i) => i)
  const inTri = (p, a, b, c) =>
    !same(p, a) && !same(p, b) && !same(p, c) &&
    cross(a, b, p) >= -1e-12 && cross(b, c, p) >= -1e-12 && cross(c, a, p) >= -1e-12
  let guard = poly.length * poly.length + 10
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false
    for (let k = 0; k < idx.length; k++) {
      const ia = idx[(k + idx.length - 1) % idx.length], ib = idx[k], ic = idx[(k + 1) % idx.length]
      const a = poly[ia], b = poly[ib], c = poly[ic]
      const cr = cross(a, b, c)
      if (Math.abs(cr) < 1e-12) { idx.splice(k, 1); clipped = true; break } // a collinear / duplicate vertex
      if (cr < 0) continue
      if (idx.some((j) => j !== ia && j !== ib && j !== ic && inTri(poly[j], a, b, c))) continue
      tris.push([a, b, c])
      idx.splice(k, 1)
      clipped = true
      break
    }
    if (!clipped) break
  }
  if (idx.length === 3) {
    const [a, b, c] = idx.map((i) => poly[i])
    if (Math.abs(cross(a, b, c)) > 1e-12) tris.push([a, b, c])
  }
  return tris
}

export const triangleArea = (t) => Math.abs(cross(t[0], t[1], t[2])) / 2
