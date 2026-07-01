/**
 * Derive the diagram figure geometry for the subject parcel: lettered vertices
 * (A, B, C… in ring order) and lettered sides (AB, BC…) with distance + north
 * azimuth. Cape Lo coordinates are [Y, X] (Westing, Southing).
 */

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

function letterAt(i) {
  // A..Z then AA, AB… (parcels rarely exceed 26 vertices, but be safe)
  if (i < 26) return LETTERS[i]
  return LETTERS[Math.floor(i / 26) - 1] + LETTERS[i % 26]
}

/** North azimuth (deg, 0..360) of edge (y1,x1)→(y2,x2) in Cape Lo. */
export function edgeBearingDeg(y1, x1, y2, x2) {
  const dy = y2 - y1
  const dx = x2 - x1
  return (Math.atan2(-dy, -dx) * 180 / Math.PI + 360) % 360
}

export function deriveSubjectGeometry(subjectFeature) {
  const ring = subjectFeature?.geometry?.coordinates?.[0] ?? []
  // Drop the closing duplicate if present.
  const pts = ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring.slice()

  const vertices = pts.map((p, i) => ({ letter: letterAt(i), y: p[0], x: p[1] }))

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
      bearingDeg: edgeBearingDeg(a.y, a.x, b.y, b.x),
    })
  }

  const area = Number(subjectFeature?.properties?.area_m2) || 0
  return { vertices, sides, area }
}
