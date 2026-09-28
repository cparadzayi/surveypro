/**
 * ofdClipping.ts
 *
 * Outside-figure geometry helpers shared by the multi-sheet cut path and the
 * map preview layers: the OfdVertex/OfdEdge types and the SI 727 edge-table
 * builder. The Sutherland-Hodgman tile-grid machinery that lived here was
 * retired with the grid-tiling multi-sheet path; a polyline cut (the sheet
 * payloads in sheetPayloads.ts) now divides the master outside figure instead.
 *
 * Cape Lo coordinate convention throughout:
 *   Y = Westing (increases eastward)
 *   X = Southing (increases southward in Zimbabwe)
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface OfdVertex {
  /** Stable id within this polygon's vertex list */
  id: string
  /** Human-readable point name (beacon name or auto-generated) */
  pointId: string
  /** Cape Lo Westing (metres) */
  y: number
  /** Cape Lo Southing (metres) */
  x: number
  /**
   * survey = real survey/coordinate point from the project
   * cut    = created by a figure split, so it carries provenance '-'
   */
  type: 'survey' | 'cut'
}

export interface OfdEdge {
  side: string
  distance: number
  direction: string
  pointId: string
  fromType: 'survey' | 'cut'
  /** End-point Westing (for SI 727 coordinates column) */
  y: number
  /** End-point Southing */
  x: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Edge table builder (SI 727 format)
// ─────────────────────────────────────────────────────────────────────────────

function distanceM(a: OfdVertex, b: OfdVertex): number {
  return Math.sqrt((b.y - a.y) ** 2 + (b.x - a.x) ** 2)
}

function bearingDeg(from: OfdVertex, to: OfdVertex): number {
  // Cape Lo azimuth: 0° = South, increases clockwise
  // atan2(deltaY, deltaX) in standard math → convert to geodetic
  const dy = to.y - from.y
  const dx = to.x - from.x
  let deg = Math.atan2(dy, dx) * (180 / Math.PI)
  if (deg < 0) deg += 360
  return deg
}

function toDMS(deg: number): string {
  const d = Math.floor(deg)
  const mRaw = (deg - d) * 60
  const m = Math.floor(mRaw)
  const s = Math.round((mRaw - m) * 60)
  const sFinal = s >= 60 ? 59 : s
  return `${d}°${m.toString().padStart(2, '0')}'${sFinal.toString().padStart(2, '0')}"`
}

/**
 * Build the SI 727 outside figure edge table from an ordered vertex array.
 * The polygon is treated as closed (last vertex connects back to first).
 */
export function buildEdgeTable(verts: OfdVertex[]): {
  edges: OfdEdge[]
  constants: { pointId: string; y: number; x: number }
} {
  if (verts.length < 2) {
    return { edges: [], constants: { pointId: '', y: 0, x: 0 } }
  }

  const edges: OfdEdge[] = verts.map((from, i) => {
    const to = verts[(i + 1) % verts.length]
    const dist = distanceM(from, to)
    return {
      side: `${from.pointId}-${to.pointId}`,
      distance: Math.round(dist * 100) / 100,
      direction: toDMS(bearingDeg(from, to)),
      pointId: from.pointId,
      fromType: from.type,
      y: to.y,
      x: to.x,
    }
  })

  return {
    edges,
    constants: { pointId: verts[0].pointId, y: verts[0].y, x: verts[0].x },
  }
}