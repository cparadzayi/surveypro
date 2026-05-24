/**
 * ofdClipping.ts
 *
 * Sutherland-Hodgman clipping of the master outside figure polygon to a
 * tile grid window, with per-sheet override storage and shared-boundary
 * propagation for multi-sheet SI 727 plans.
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
   * clip   = auto-generated at the tile boundary by S-H clipping
   */
  type: 'survey' | 'clip'
}

export interface OfdEdge {
  side: string
  distance: number
  direction: string
  pointId: string
  fromType: 'survey' | 'clip'
  /** End-point Westing (for SI 727 coordinates column) */
  y: number
  /** End-point Southing */
  x: number
}

export interface SheetOfd {
  sheetNumber: number
  /** Ordered, non-closing vertex array for this tile */
  vertices: OfdVertex[]
  /** SI 727 edge table derived from vertices */
  edges: OfdEdge[]
  constants: { pointId: string; y: number; x: number }
  /** true when the user has supplied manual vertex overrides for this sheet */
  isEdited: boolean
}

// Tile descriptor (matches the tiles[] entries in TileGrid from professionalSurveyPlanExporter.ts)
export interface OfdTile {
  sheetNumber: number
  col: number
  row: number
  label: string
  minY: number
  maxY: number
  minX: number
  maxX: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Master polygon extraction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert the outsideFigureData structure (produced by the outsideFigureData
 * computed property in SurveyPlanMapView.vue) into an ordered, non-closing
 * array of OfdVertex ready for clipping.
 *
 * outsideFigureData layout:
 *   constants = first vertex (= edge[0].from)
 *   edges[i].y / edges[i].x = the TO point of edge i
 *   So vertices are: [constants, edges[0].to, edges[1].to, …, edges[n-2].to]
 *   (edges[n-1].to closes back to constants — we don't duplicate it)
 */
export function masterVerticesFromOfd(ofd: {
  edges: Array<{
    side: string
    distance: number
    direction: string
    pointId: string
    y: number
    x: number
  }>
  constants: { pointId: string; y: number; x: number }
}): OfdVertex[] {
  const verts: OfdVertex[] = [
    {
      id: 'v0',
      pointId: ofd.constants.pointId,
      y: ofd.constants.y,
      x: ofd.constants.x,
      type: 'survey',
    },
  ]

  // Each edge[i]'s "to" point is vertex i+1.
  // The last edge closes back to vertex 0, so skip its "to".
  for (let i = 0; i < ofd.edges.length - 1; i++) {
    const e = ofd.edges[i]
    // Extract "to" name from the "FROM-TO" side label
    const dashIdx = e.side.indexOf('-')
    const toName = dashIdx >= 0 ? e.side.slice(dashIdx + 1) : `P${i + 1}`
    verts.push({
      id: `v${i + 1}`,
      pointId: toName,
      y: e.y,
      x: e.x,
      type: 'survey',
    })
  }

  return verts
}

// ─────────────────────────────────────────────────────────────────────────────
// Sutherland-Hodgman polygon clipping (axis-aligned bbox)
// ─────────────────────────────────────────────────────────────────────────────

interface ClipPlane {
  inside: (v: OfdVertex) => boolean
  /** Parameter t ∈ [0,1] at which segment a→b intersects this plane */
  intersectT: (a: OfdVertex, b: OfdVertex) => number
}

function lerpVertex(
  a: OfdVertex,
  b: OfdVertex,
  t: number,
  id: string,
  sheetNum: number,
  planeCode: string,
): OfdVertex {
  return {
    id,
    pointId: `S${sheetNum}-${planeCode}-${id}`,
    y: a.y + t * (b.y - a.y),
    x: a.x + t * (b.x - a.x),
    type: 'clip',
  }
}

function clipByPlane(
  polygon: OfdVertex[],
  plane: ClipPlane,
  sheetNum: number,
  planeCode: string,
): OfdVertex[] {
  if (polygon.length === 0) return []
  const out: OfdVertex[] = []
  let counter = 0

  for (let i = 0; i < polygon.length; i++) {
    const curr = polygon[i]
    const prev = polygon[(i - 1 + polygon.length) % polygon.length]
    const currIn = plane.inside(curr)
    const prevIn = plane.inside(prev)

    if (currIn) {
      if (!prevIn) {
        // Transition outside→inside: insert boundary intersection first
        const t = plane.intersectT(prev, curr)
        if (isFinite(t) && t >= 0 && t <= 1) {
          out.push(lerpVertex(prev, curr, t, `${counter++}`, sheetNum, planeCode))
        }
      }
      out.push(curr)
    } else if (prevIn) {
      // Transition inside→outside: insert boundary intersection
      const t = plane.intersectT(prev, curr)
      if (isFinite(t) && t >= 0 && t <= 1) {
        out.push(lerpVertex(prev, curr, t, `${counter++}`, sheetNum, planeCode))
      }
    }
    // Both outside: skip
  }

  return out
}

/**
 * Clip the master polygon to the given tile window using Sutherland-Hodgman.
 *
 * Returns an ordered, non-closing array of OfdVertex.
 * Vertices auto-generated at tile boundary intersections get type='clip'.
 * Returns [] when the polygon is entirely outside the tile.
 */
export function clipPolygonToTile(masterVerts: OfdVertex[], tile: OfdTile): OfdVertex[] {
  // 4 axis-aligned clip planes for the tile bbox
  const planes: Array<[ClipPlane, string]> = [
    [
      {
        inside: (v) => v.y >= tile.minY,
        intersectT: (a, b) => (tile.minY - a.y) / (b.y - a.y),
      },
      'yMin',
    ],
    [
      {
        inside: (v) => v.y <= tile.maxY,
        intersectT: (a, b) => (tile.maxY - a.y) / (b.y - a.y),
      },
      'yMax',
    ],
    [
      {
        inside: (v) => v.x >= tile.minX,
        intersectT: (a, b) => (tile.minX - a.x) / (b.x - a.x),
      },
      'xMin',
    ],
    [
      {
        inside: (v) => v.x <= tile.maxX,
        intersectT: (a, b) => (tile.maxX - a.x) / (b.x - a.x),
      },
      'xMax',
    ],
  ]

  let poly = [...masterVerts]
  for (const [plane, code] of planes) {
    poly = clipByPlane(poly, plane, tile.sheetNumber, code)
    if (poly.length === 0) return []
  }
  return poly
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

// ─────────────────────────────────────────────────────────────────────────────
// Compute all per-sheet OFDs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * For every tile in the grid, produce a SheetOfd using:
 *   - S-H clipped vertices when no override exists for that sheet
 *   - User-supplied override vertices when present in `overrides`
 *
 * For a single-sheet plan (tiles.length === 1), the full master polygon is used
 * directly (no clipping needed).
 */
export function computeAllSheetOfds(
  masterVerts: OfdVertex[],
  tiles: OfdTile[],
  overrides: Record<number, OfdVertex[]>,
): SheetOfd[] {
  return tiles.map((tile) => {
    const isEdited = tile.sheetNumber in overrides
    const verts =
      isEdited
        ? overrides[tile.sheetNumber]
        : tiles.length === 1
          ? masterVerts
          : clipPolygonToTile(masterVerts, tile)

    const { edges, constants } = buildEdgeTable(verts)
    return { sheetNumber: tile.sheetNumber, vertices: verts, edges, constants, isEdited }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared-boundary propagation
// ─────────────────────────────────────────────────────────────────────────────

/** Snap tolerance (metres) for detecting which vertices lie on a shared boundary */
const BOUNDARY_TOL = 0.5

/**
 * After the user edits the vertices of sheet `editedSheetNum`, propagate any
 * changes that fall on a shared tile boundary to the adjacent tile(s).
 *
 * Returns a new overrides object with adjacent tiles updated in-place.
 *
 * How it works:
 *   1. Find each tile that is geometrically adjacent to the edited tile
 *      (shares a Y or X boundary edge).
 *   2. For each shared boundary, identify the clip vertices in the *edited*
 *      sheet that lie on that boundary.
 *   3. Find the corresponding clip vertex in the *adjacent* sheet (matched by
 *      its coordinate perpendicular to the shared boundary) and update it to
 *      the new position.
 */
export function propagateSharedBoundary(
  editedSheetNum: number,
  editedVerts: OfdVertex[],
  tiles: OfdTile[],
  masterVerts: OfdVertex[],
  overrides: Record<number, OfdVertex[]>,
): Record<number, OfdVertex[]> {
  const editedTile = tiles.find((t) => t.sheetNumber === editedSheetNum)
  if (!editedTile) return overrides

  // Start with a shallow copy that already includes the just-edited sheet
  const next: Record<number, OfdVertex[]> = { ...overrides, [editedSheetNum]: editedVerts }

  for (const other of tiles) {
    if (other.sheetNumber === editedSheetNum) continue

    // Determine which boundary (if any) is shared
    let sharedAxis: 'y' | 'x' | null = null
    let sharedVal = 0

    if (editedTile.row === other.row) {
      // Same row — potential Y-axis boundary
      if (Math.abs(editedTile.maxY - other.minY) < BOUNDARY_TOL) {
        sharedAxis = 'y'
        sharedVal = (editedTile.maxY + other.minY) / 2
      } else if (Math.abs(editedTile.minY - other.maxY) < BOUNDARY_TOL) {
        sharedAxis = 'y'
        sharedVal = (editedTile.minY + other.maxY) / 2
      }
    } else if (editedTile.col === other.col) {
      // Same column — potential X-axis boundary
      if (Math.abs(editedTile.minX - other.maxX) < BOUNDARY_TOL) {
        sharedAxis = 'x'
        sharedVal = (editedTile.minX + other.maxX) / 2
      } else if (Math.abs(editedTile.maxX - other.minX) < BOUNDARY_TOL) {
        sharedAxis = 'x'
        sharedVal = (editedTile.maxX + other.minX) / 2
      }
    }

    if (!sharedAxis) continue

    // Find clip vertices in the edited sheet that sit on this shared boundary
    const onBoundary = editedVerts.filter(
      (v) => v.type === 'clip' && Math.abs((sharedAxis === 'y' ? v.y : v.x) - sharedVal) < BOUNDARY_TOL,
    )
    if (onBoundary.length === 0) continue

    // Get or compute the other tile's current vertex list
    const otherVerts = [
      ...(next[other.sheetNumber] ?? clipPolygonToTile(masterVerts, other)),
    ]

    let changed = false
    for (const ev of onBoundary) {
      // Match by perpendicular coordinate (the axis that IS shared is the same value;
      // distinguish vertices by the other axis)
      const perpCoord = sharedAxis === 'y' ? ev.x : ev.y
      const idx = otherVerts.findIndex(
        (v) =>
          v.type === 'clip' &&
          Math.abs((sharedAxis === 'y' ? v.y : v.x) - sharedVal) < BOUNDARY_TOL &&
          Math.abs((sharedAxis === 'y' ? v.x : v.y) - perpCoord) < BOUNDARY_TOL,
      )
      if (idx >= 0) {
        otherVerts[idx] = { ...otherVerts[idx], y: ev.y, x: ev.x }
        changed = true
      }
    }

    if (changed) {
      next[other.sheetNumber] = otherVerts
    }
  }

  return next
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers for the map preview layer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert an ordered OfdVertex array (Cape Lo) to a WGS84 GeoJSON polygon ring
 * using the provided conversion function.
 */
export function vertsToWGS84Ring(
  verts: OfdVertex[],
  toWGS84: (y: number, x: number) => { lng: number; lat: number },
): number[][] {
  const ring = verts.map((v) => {
    const { lng, lat } = toWGS84(v.y, v.x)
    return [lng, lat]
  })
  if (ring.length > 0) ring.push(ring[0]) // close ring
  return ring
}
