import { splitFigure, resolveEndpoint, roundPoint } from '../../../app-shared/figureSplit'

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

function previewAt(ring: LoPoint[], p: LoPoint): EndpointPreview {
  const resolved = resolveEndpoint(ring, p)
  if (resolved.kind === 'vertex') {
    return { kind: 'vertex', index: resolved.index, point: resolved.point, snapped: true }
  }
  return { kind: 'edge', index: resolved.index, point: resolved.point, snapped: false }
}

function revalidated(vertices: LoPoint[], ring: LoPoint[], stands: unknown[]): Revalidated {
  if (vertices.length < 2) {
    return { startsAt: null, endsAt: null, verdict: 'incomplete', offenders: [] }
  }
  const startsAt = previewAt(ring, vertices[0])
  const endsAt = previewAt(ring, vertices[vertices.length - 1])
  const outcome = splitFigure({ ring, polyline: vertices, stands })
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
): CutDraft {
  if (draft.vertices.length >= MAX_CUT_VERTICES) return draft
  // Decision 13: the click is rounded exactly once, here, so the Coordinate
  // List, the outside-figure table and the Calculations pages cannot disagree
  // in the last digit. A click that rounds to the previous vertex is a
  // double-click, not a new vertex -- splitFigure would collapse it too.
  const v = roundPoint(p)
  const last = draft.vertices[draft.vertices.length - 1]
  if (last && last.y === v.y && last.x === v.x) return draft
  const vertices = [...draft.vertices, v]
  return { vertices, ...revalidated(vertices, ring, stands) }
}

export function undoVertex(draft: CutDraft, ring: LoPoint[], stands: unknown[]): CutDraft {
  if (draft.vertices.length === 0) return draft
  const vertices = draft.vertices.slice(0, -1)
  return { vertices, ...revalidated(vertices, ring, stands) }
}

export function clearDraft(): CutDraft {
  return newDraft()
}