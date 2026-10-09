import { splitFigure, splitFigureMultiple, resolveEndpoint, resolveEndpointToward, roundPoint } from '../../../app-shared/figureSplit'

/**
 * The drawing state machine for a figure cut. Pure, testable, owns every rule;
 * the map view owns only pointer events and painting. Every change runs the SAME
 * splitFigure the renderers run, so the verdict on screen is the verdict that
 * will be computed again when the cut is stored and drawn.
 */

export const MAX_CUT_VERTICES = 64

export type Verdict =
  | 'incomplete'
  | 'ok'
  | 'degenerate'
  | 'self-intersecting'
  | 'straddles-stands'
  | 'interior-outside'

export interface LoPoint {
  y: number
  x: number
}

export interface EndpointPreview {
  kind: 'vertex' | 'edge'
  index: number
  point: LoPoint
  /** True when the endpoint landed within snap tolerance of that vertex. */
  snapped: boolean
  /**
   * True only when the landing was found by shooting the cut's own ray
   * through the click and meeting the figure -- i.e. the click ran past
   * the boundary and the landing is where the line itself crosses it.
   * A perpendicular projection of a click still inside the figure is NOT
   * a crossing: that click is a real vertex of the traced cut, and the
   * draft must keep it exactly where the surveyor put it. Only a crossing
   * may replace the clicked vertex, which is how a guide pair of clicks
   * (one outside, one inside) falls away to the single boundary point.
   */
  viaCrossing?: boolean
}

export interface CutDraft {
  vertices: LoPoint[]
  startsAt: EndpointPreview | null
  endsAt: EndpointPreview | null
  verdict: Verdict
  /** Names of stands the cut would slice; [] when verdict !== 'straddles-stands'. */
  offenders: string[]
}

/** A cut can be closed (finished) when it is legal and both ends snapped to the boundary. */
export const selfClose = (d: CutDraft): boolean =>
  d.verdict === 'ok' && d.startsAt?.snapped === true && d.endsAt?.snapped === true

export function newDraft(): CutDraft {
  return {
    vertices: [],
    startsAt: null,
    endsAt: null,
    verdict: 'incomplete',
    offenders: [],
  }
}

interface Revalidated {
  startsAt: EndpointPreview | null
  endsAt: EndpointPreview | null
  verdict: Verdict
  offenders: string[]
}

function previewAt(ring: LoPoint[], p: LoPoint, neighbour?: LoPoint): EndpointPreview {
  const resolved = neighbour ? resolveEndpointToward(ring, p, neighbour) : resolveEndpoint(ring, p)
  if (resolved.kind === 'vertex') {
    return { kind: 'vertex', index: resolved.index, point: resolved.point, snapped: true, viaCrossing: false }
  }
  return { kind: 'edge', index: resolved.index, point: resolved.point, snapped: false, viaCrossing: resolved.viaCrossing === true }
}

function revalidated(vertices: LoPoint[], ring: LoPoint[], stands: unknown[], existingCuts: LoPoint[][] = []): Revalidated {
  if (vertices.length < 2) {
    return { startsAt: null, endsAt: null, verdict: 'incomplete', offenders: [] }
  }
  const startsAt = previewAt(ring, vertices[0], vertices[1])
  const endsAt = previewAt(ring, vertices[vertices.length - 1], vertices[vertices.length - 2])
  const polylines = [...existingCuts, vertices]
  const outcome = splitFigureMultiple({ ring, polylines, stands })
  if (outcome.ok) {
    return { startsAt, endsAt, verdict: 'ok', offenders: [] }
  }
  return { startsAt, endsAt, verdict: outcome.error, offenders: outcome.stands ?? [] }
}

export function addVertex(
  draft: CutDraft,
  ring: LoPoint[],
  stands: unknown[],
  p: LoPoint,
  existingCuts: LoPoint[][] = [],
): CutDraft {
  if (draft.vertices.length >= MAX_CUT_VERTICES) return draft
  // Decision 13: the click is rounded exactly once, here, so the Coordinate
  // List, the outside-figure table and the Calculations pages cannot disagree
  // in the last digit. A click that rounds to the previous vertex is a
  // double-click, not a new vertex -- splitFigure would collapse it too.
  const v = roundPoint(p)
  const last = draft.vertices[draft.vertices.length - 1]
  if (last && last.y === v.y && last.x === v.x) return draft
  let vertices = [...draft.vertices, v]
  // Re-validate with direction awareness, then let a genuine crossing
  // replace the clicked vertex. `viaCrossing` is only set when the click
  // ran past the boundary and the ray toward its neighbour met the figure:
  // the two guide clicks (one outside, one inside) fall away to the single
  // point where the split line crosses the outside figure. A projection of
  // a click still inside the figure is NOT a crossing -- that click is a
  // real vertex of the traced cut and stays where the surveyor put it.
  const preview = revalidated(vertices, ring, stands, existingCuts)
  if (vertices.length >= 2 && preview.startsAt?.viaCrossing) {
    const s = preview.startsAt.point
    if (!(vertices[0].y === s.y && vertices[0].x === s.x)) {
      vertices = [s, ...vertices.slice(1)]
    }
  }
  if (vertices.length >= 2 && preview.endsAt?.viaCrossing) {
    const e = preview.endsAt.point
    const last = vertices[vertices.length - 1]
    if (!(last.y === e.y && last.x === e.x)) {
      vertices = [...vertices.slice(0, -1), e]
    }
  }
  return { vertices, ...revalidated(vertices, ring, stands, existingCuts) }
}

export function undoVertex(draft: CutDraft, ring: LoPoint[], stands: unknown[], existingCuts: LoPoint[][] = []): CutDraft {
  if (draft.vertices.length === 0) return draft
  const vertices = draft.vertices.slice(0, -1)
  return { vertices, ...revalidated(vertices, ring, stands, existingCuts) }
}

export function clearDraft(): CutDraft {
  return newDraft()
}