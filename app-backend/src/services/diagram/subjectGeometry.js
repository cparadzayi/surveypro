/**
 * Derive the diagram figure geometry for the subject parcel: lettered vertices
 * (A, B, C… in ring order) and lettered sides (AB, BC…) with distance + a
 * SOUTH-ORIENTED bearing (0°=South, clockwise S→W→N→E) — the SG/Cape cadastral
 * convention shared with the General Plan (see zim-geo.js).
 *
 * Coordinates are normalized to canonical [Y=Westing, X=Southing]; the DB may
 * deliver the ring in [Southing, Westing] order (Southing ≈ 2.14M, Westing ≈
 * tens of thousands), so we run each point through normalizeCapeLoYX first.
 */
import { normalizeCapeLoYX } from '../pdfkitGeoPDF/geometry.js'
import { bearingSouthBetween } from '../../utils/zim-geo.js'

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function letterAt(i) {
  // A..Z then AA, AB… (parcels rarely exceed 26 vertices, but be safe)
  if (i < 26) return LETTERS[i]
  return LETTERS[Math.floor(i / 26) - 1] + LETTERS[i % 26]
}

export function deriveSubjectGeometry(subjectFeature) {
  const ring = subjectFeature?.geometry?.coordinates?.[0] ?? []
  // Normalize each point to canonical [Y=Westing, X=Southing].
  const norm = ring.map((p) => normalizeCapeLoYX(p[0], p[1]))
  // Drop the closing duplicate if present.
  const pts = norm.length > 1 &&
    norm[0][0] === norm[norm.length - 1][0] &&
    norm[0][1] === norm[norm.length - 1][1]
      ? norm.slice(0, -1)
      : norm.slice()

  const vertices = pts.map(([y, x], i) => ({ letter: letterAt(i), y, x }))

  const sides = []
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i]
    const b = vertices[(i + 1) % vertices.length]
    const dy = b.y - a.y
    const dx = b.x - a.x
    sides.push({
      side: `${a.letter}${b.letter}`,
      from: a.letter,
      to: b.letter,
      distance: Math.hypot(dy, dx),
      // South-oriented bearing (0=South, clockwise) — matches zim-geo/General Plan.
      bearingDeg: bearingSouthBetween({ y1: a.y, x1: a.x }, { y2: b.y, x2: b.x }),
    })
  }

  const area = Number(subjectFeature?.properties?.area_m2) || 0
  return { vertices, sides, area }
}
