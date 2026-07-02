import ClipperLib from 'clipper-lib'
import { normalizeCapeLoYX } from '../pdfkitGeoPDF/geometry.js'

export const BUFFER_M = 10
const SCALE = 1000                 // metres → integer (mm) for Clipper
const ARC_TOLERANCE = 0.5 * SCALE  // 0.5 m smoothness on round joins

// [y,x] metres → Clipper integer point. Clipper's field names are arbitrary axes:
// Clipper.X ← Westing (y), Clipper.Y ← Southing (x). unpt reverses it.
function pt(y, x) { return { X: Math.round(y * SCALE), Y: Math.round(x * SCALE) } }
function unpt(p) { return [p.X / SCALE, p.Y / SCALE] }

function dropClose(pts) {
  if (pts.length > 1) {
    const a = pts[0], b = pts[pts.length - 1]
    if (a[0] === b[0] && a[1] === b[1]) return pts.slice(0, -1)
  }
  return pts
}

// Raw GeoJSON ring → Clipper path in canonical [Y=Westing, X=Southing].
function geoToPath(ring) {
  const norm = dropClose((ring ?? []).map((p) => normalizeCapeLoYX(p[0], p[1])))
  return norm.map(([y, x]) => pt(y, x))
}
// [y,x] ring (already normalized) → Clipper path.
function yxToPath(ring) {
  return dropClose(ring ?? []).map(([y, x]) => pt(y, x))
}
function pathToYX(path) { return path.map(unpt) }

export function polygonArea(ring) {
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [y1, x1] = ring[i]
    const [y2, x2] = ring[(i + 1) % ring.length]
    a += y1 * x2 - y2 * x1
  }
  return Math.abs(a) / 2
}

function offsetOnce(path, deltaScaled) {
  const co = new ClipperLib.ClipperOffset(2, ARC_TOLERANCE)
  co.AddPath(path, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const sol = new ClipperLib.Paths()
  co.Execute(sol, deltaScaled)
  return sol
}

/** 10 m outward offset of a raw subject ring → array of [y,x] rings. */
export function bufferRing(ring, distanceM = BUFFER_M) {
  const path = geoToPath(ring)
  if (path.length < 3) return []
  const delta = distanceM * SCALE
  let sol = offsetOnce(path, delta)
  // Guarantee OUTWARD growth regardless of the ring's winding: the offset area
  // must exceed the input area; if not, the orientation made +delta shrink — retry
  // with the path reversed.
  const inArea = Math.abs(ClipperLib.Clipper.Area(path))
  const outArea = sol.reduce((s, p) => s + Math.abs(ClipperLib.Clipper.Area(p)), 0)
  if (!sol.length || outArea <= inArea) {
    sol = offsetOnce(path.slice().reverse(), delta)
  }
  return sol.map(pathToYX)
}

/**
 * Intersect a raw neighbour ring with the buffer ([y,x] rings). Returns clipped
 * [y,x] rings, largest-area first; [] when the neighbour doesn't reach the buffer.
 */
export function clipRingToPolygon(neighbourRing, bufferPolys) {
  const subj = geoToPath(neighbourRing)
  if (subj.length < 3 || !bufferPolys?.length) return []
  const clip = bufferPolys.map(yxToPath).filter((p) => p.length >= 3)
  if (!clip.length) return []
  const c = new ClipperLib.Clipper()
  c.AddPath(subj, ClipperLib.PolyType.ptSubject, true)
  c.AddPaths(clip, ClipperLib.PolyType.ptClip, true)
  const sol = new ClipperLib.Paths()
  c.Execute(
    ClipperLib.ClipType.ctIntersection, sol,
    ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero,
  )
  const rings = sol.map(pathToYX).filter((r) => r.length >= 3)
  rings.sort((a, b) => polygonArea(b) - polygonArea(a))
  return rings
}

export function ringExtent(polys) {
  let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity
  for (const ring of polys) {
    for (const [y, x] of ring) {
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
    }
  }
  return { minY, maxY, minX, maxX, widthM: maxY - minY, heightM: maxX - minX }
}

function distPointToSeg([py, px], [ay, ax], [by, bx]) {
  const dy = by - ay, dx = bx - ax
  const len2 = dy * dy + dx * dx
  let t = len2 ? ((py - ay) * dy + (px - ax) * dx) / len2 : 0
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(py - (ay + t * dy), px - (ax + t * dx))
}

function distPointToRing(p, ring) {
  let m = Infinity
  for (let i = 0; i < ring.length; i++) {
    const d = distPointToSeg(p, ring[i], ring[(i + 1) % ring.length])
    if (d < m) m = d
  }
  return m
}

/**
 * Edges of a clipped strip that lie on the ORIGINAL neighbour boundary — the real
 * cadastral edges — excluding the buffer clip line (the artificial outer edge of
 * the clip polygon). `stripRing` is a normalized [y,x] ring (clip output);
 * `neighbourRing` is the raw neighbour ring. Returns segments `[[y1,x1],[y2,x2]]`.
 */
export function neighbourBoundaryEdges(stripRing, neighbourRing, tol = 0.05) {
  const nb = dropClose((neighbourRing ?? []).map((p) => normalizeCapeLoYX(p[0], p[1])))
  if (!stripRing || stripRing.length < 2 || nb.length < 2) return []
  const edges = []
  for (let i = 0; i < stripRing.length; i++) {
    const a = stripRing[i]
    const b = stripRing[(i + 1) % stripRing.length]
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    if (distPointToRing(mid, nb) <= tol) edges.push([a, b])
  }
  return edges
}

export function isOutsideFigureFeature(feature) {
  const p = feature?.properties ?? {}
  const has = (v) => typeof v === 'string' && (
    v.toLowerCase().includes('outside figure') ||
    v.toLowerCase().includes('outside_figure') ||
    v.toLowerCase().includes('outsidefigure'))
  return (
    has(p.designation) || has(p.stand) || has(p.description) ||
    (typeof p.stand === 'string' && p.stand.toLowerCase() === 'of') ||
    p.is_outside_figure === true ||
    p.metadata?.is_outside_figure === true ||
    p.metadata?.isOutsideFigure === true
  )
}
