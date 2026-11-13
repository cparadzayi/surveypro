import { northClockwiseOrder } from '../../../app-shared/figureOrder'

/**
 * Put an Outside Figure's data in the order it is stated in: from the northmost point, clockwise.
 * The rule itself is app-shared/figureOrder.js; this applies it to the shapes the frontend holds.
 */

interface XY { y: number; x: number }

/** Closed-ring GeoJSON vertices ([y, x] pairs, the closing repeat already removed), in order. */
export function orderVerticesNorthClockwise<T extends number[]>(vertices: T[]): T[] {
  const { order } = northClockwiseOrder(vertices.map((v) => ({ y: v[0], x: v[1] })))
  return order.map((i) => vertices[i])
}

/** Stored edge of the Area & Consistency computation: one side, from one vertex to the next. */
export interface StoredEdge {
  from?: XY & Record<string, unknown>
  to?: XY & Record<string, unknown>
  bearingDeg?: number
  distance?: number
  distanceRounded?: number
  directionDMS?: string
  [key: string]: unknown
}

/**
 * The stored edges, rotated to start at the northmost vertex and, if the figure was digitised
 * counter-clockwise, reversed: each side then runs the other way, so its from/to swap, its bearing turns
 * through 180 degrees and its direction is stated again (`dms` writes a bearing as the plan states it).
 * Edges without usable coordinates are returned as they are.
 */
export function orderEdgesNorthClockwise(
  edges: StoredEdge[],
  dms: (bearingDeg: number, distance: number) => string,
): StoredEdge[] {
  if (!Array.isArray(edges) || edges.length < 3) return edges
  const verts = edges.map((e) => e.from)
  if (!verts.every((v) => v && Number.isFinite(Number(v.y)) && Number.isFinite(Number(v.x)))) return edges
  const { order, reversed } = northClockwiseOrder(verts.map((v) => ({ y: Number(v!.y), x: Number(v!.x) })))
  const n = edges.length
  if (!reversed) return order.map((i) => edges[i])

  return order.map((_, k) => {
    // The new side from vertex order[k] to order[k+1] is the old side order[k+1] -> order[k], turned round.
    const e = edges[order[(k + 1) % n]]
    const dy = Number(e.to?.y) - Number(e.from?.y)
    const dx = Number(e.to?.x) - Number(e.from?.x)
    let bearing = Number.isFinite(Number(e.bearingDeg)) ? Number(e.bearingDeg) : (Math.atan2(dy, dx) * 180) / Math.PI
    bearing = (((bearing + 180) % 360) + 360) % 360
    const distance = Number(e.distance ?? Math.hypot(dy, dx))
    return { ...e, from: e.to, to: e.from, bearingDeg: bearing, directionDMS: dms(bearing, distance) }
  })
}
