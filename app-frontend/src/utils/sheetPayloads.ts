/**
 * One assembled payload per sheet of a multi-part general plan.
 *
 * This is the single place that combines figureSplit (the geometry),
 * sheetDerivation (what each sheet states about itself) and cutPointNames
 * (designations for the points a cut creates) into what a renderer needs.
 * Both the PDF and DXF renderers are meant to read a SheetPayload rather than
 * deriving any of this themselves -- that is the whole point of this module:
 * where two renderers derive one fact separately, they drift.
 *
 * Every point here is { y, x } in Lo metres -- y easting, x southing.
 *
 * See docs/superpowers/specs/2026-09-26-multi-sheet-outside-figure-split-design.md
 */
import { splitFigure, roundPoint } from '../../../app-shared/figureSplit'
import {
  orderSheets,
  assignStands,
  figureLabel,
  otherSheetsPhrase,
  standRange,
} from '../../../app-shared/sheetDerivation'
import { nameCutPoints } from '../../../app-shared/cutPointNames'
import { sheetOutsideFigureVertices } from './sheetOutsideFigure'
import { buildEdgeTable } from './ofdClipping'
import type { OfdVertex, OfdEdge } from './ofdClipping'

export interface LoPoint {
  y: number
  x: number
}

export interface StandInput {
  name: string
  ring?: LoPoint[]
  isPublicPlace?: boolean
}

/**
 * A row of the General Plan party-wall servitude statement. Structurally the
 * same shape as `PartyWallStatementRow` in
 * `views/modules/cadastral-standard/servitudes.ts`. Redeclared rather than
 * imported: `utils/` must never import from `views/`, and that module is
 * where the real type lives.
 */
export interface PartyWallStatementRow {
  stands: string
  boundary: string
}

export interface SheetPayload {
  sheetNumber: number
  totalSheets: number
  /** 'Outside Figure Sheet 2', or 'Outside Figure' for a single sheet. */
  figureLabel: string
  /** '' for a single sheet -- see the module-level note on otherSheetsPhrase. */
  otherSheets: string
  /** This sheet's part, open. */
  ring: LoPoint[]
  /** This sheet's stands, ascending. */
  stands: string[]
  /** Lettered from A, 'cut' or 'survey'. */
  vertices: OfdVertex[]
  edges: OfdEdge[]
  constants: { pointId: string; y: number; x: number }
  servitudeRows: PartyWallStatementRow[]
  /** The WHOLE plan's stand range -- identical on every sheet. */
  standRange: string
  /** The WHOLE plan's stand count -- identical on every sheet. */
  totalStandCount: number
  newPoints: Array<{ y: number; x: number; name: string; status: string }>
}

export interface BuildSheetPayloadsInput {
  /** The outside figure's own ring -- open or closed, either is accepted. */
  ring: LoPoint[]
  /** The surveyor's cut. Fewer than two points means "no cut": one sheet. */
  polyline: LoPoint[]
  stands: StandInput[]
  /**
   * The plan's party-wall statement rows, ALREADY built via
   * `buildPartyWallStatementRows(servitudes, standForParcel)` by the caller.
   *
   * That function, and the per-sheet filter `statementRowsForSheet`, both live
   * in `views/modules/cadastral-standard/servitudes.ts` -- a view module this
   * `utils/` file must never import. So the whole-plan rows are taken as an
   * input instead of being built here, and the per-sheet filter is a local
   * copy of `statementRowsForSheet`'s own algorithm (see
   * `filterServitudeRowsForSheet` below) since that function is equally
   * unimportable. Optional; defaults to no rows.
   */
  servitudeRows?: PartyWallStatementRow[]
  /** Names already in use on the plan, so a created point avoids them. */
  takenNames?: string[]
  tolerance?: number
}

export type BuildSheetPayloadsResult =
  | { ok: true; sheets: SheetPayload[] }
  | { ok: false; error: string; stands?: string[]; at?: LoPoint }

/**
 * A GeoJSON ring is always closed (RFC 7946 repeats the first position), and
 * the outside figure is stored as GeoJSON, so a closed ring is the default
 * shape a caller has in hand. `splitFigure` normalises its own `ring` input,
 * but nothing else here does, and the vertices this module hands back --
 * `sheetOutsideFigureVertices`, `buildEdgeTable` -- must not carry the
 * duplicated closing vertex. So the ring is normalised once, at the door.
 *
 * Mirrors `splitFigure`'s own (unexported) `openRing`: round both ends to the
 * same 2 dp before comparing, using `roundPoint`, which IS exported, rather
 * than a bespoke epsilon -- so "closed" means the same thing here as it does
 * inside `splitFigure`, and the two cannot drift on the rounding constant.
 */
function openRing(ring: LoPoint[]): LoPoint[] {
  if (!Array.isArray(ring) || ring.length < 2) return ring
  const first = roundPoint(ring[0])
  const last = roundPoint(ring[ring.length - 1])
  const eps = 1e-6
  if (Math.abs(first.y - last.y) < eps && Math.abs(first.x - last.x) < eps) {
    return ring.slice(0, -1)
  }
  return ring
}

/**
 * The party-wall statement rows a given sheet must carry (spec Decision 8).
 *
 * A duplicate of `statementRowsForSheet` in
 * `views/modules/cadastral-standard/servitudes.ts` -- see the note on
 * `servitudeRows` above for why it is copied rather than imported. Filters
 * the ROWS, not the servitudes: a row's `stands` already merges the two
 * stands a wall joins, so a wall between stands on different sheets belongs
 * on both statements.
 */
function filterServitudeRowsForSheet(
  rows: PartyWallStatementRow[],
  sheetStands: string[],
): PartyWallStatementRow[] {
  const wanted = new Set(sheetStands.map((s) => String(s).trim()))
  return rows.filter((row) =>
    String(row.stands)
      .split(/\s+and\s+|,\s*/)
      .map((name) => name.trim())
      .some((name) => wanted.has(name)),
  )
}

/** Ascending, numeric-aware -- matches the ordering `standRange` itself uses. */
function compareStands(a: string, b: string): number {
  const na = parseInt(a, 10)
  const nb = parseInt(b, 10)
  if (Number.isNaN(na) || Number.isNaN(nb)) return a.localeCompare(b)
  return na !== nb ? na - nb : a.localeCompare(b)
}

export function buildSheetPayloads(input: BuildSheetPayloadsInput): BuildSheetPayloadsResult {
  const stands = input.stands ?? []
  const servitudeRows = input.servitudeRows ?? []
  const takenNames = input.takenNames ?? []
  const tolerance = input.tolerance

  // Every stand named on the plan, excluding the outside figure itself and
  // public places (assignStands already exempts public places; excluding the
  // figure here is what keeps a whole-plan split from being refused as if the
  // figure were a stand spanning the cut).
  const namedStands = stands.filter((s) => s && s.isPublicPlace !== true).map((s) => s.name)

  // Step 1: fewer than two polyline points means no cut -- one sheet, the
  // figure itself. Do not call splitFigure with nothing to split.
  if (!Array.isArray(input.polyline) || input.polyline.length < 2) {
    const ring = openRing(input.ring)
    const vertices = sheetOutsideFigureVertices(ring, [])
    const { edges, constants } = buildEdgeTable(vertices)
    const sheetStands = [...namedStands].sort(compareStands)
    const payload: SheetPayload = {
      sheetNumber: 1,
      totalSheets: 1,
      figureLabel: figureLabel(1, 1),
      otherSheets: otherSheetsPhrase(1, 1),
      ring,
      stands: sheetStands,
      vertices,
      edges,
      constants,
      servitudeRows: filterServitudeRowsForSheet(servitudeRows, sheetStands),
      standRange: standRange(namedStands),
      totalStandCount: namedStands.length,
      newPoints: [],
    }
    return { ok: true, sheets: [payload] }
  }

  // Step 2: split. On refusal, pass it through verbatim.
  const split = splitFigure({
    ring: openRing(input.ring),
    polyline: input.polyline,
    stands,
    ...(tolerance !== undefined ? { tolerance } : {}),
  })
  if (!split.ok) {
    return { ok: false, error: split.error, ...(split.stands ? { stands: split.stands } : {}), ...(split.at ? { at: split.at } : {}) }
  }

  // Step 3: name the cut's created points ONCE for the whole plan, so both
  // sheets describe the same physical point identically. `namedNewPoints`
  // holds NEW objects (nameCutPoints returns fresh {y,x,name,status} records,
  // not the originals) -- for the payload's own `newPoints` field. Identity
  // matching against a part ring must still use the RAW `split.newPoints`
  // objects, which are the ones actually aliased into the part rings.
  const namedNewPoints = nameCutPoints(split.newPoints, takenNames)

  // Step 4: assign every stand to exactly one part. On refusal, pass it
  // through verbatim.
  const assigned = assignStands(split.parts, stands)
  if (!assigned.ok) {
    return { ok: false, error: assigned.error, ...(assigned.stands ? { stands: assigned.stands } : {}) }
  }

  // Step 5: the sheet number for each part, geographically.
  const sheetOf = orderSheets(split.parts)
  const totalSheets = split.parts.length

  // Step 6/7: per part, everything else -- and the whole-plan totals, which
  // are NOT the sheet's own. Every other field on the payload IS per sheet,
  // which is exactly what makes standRange/totalStandCount easy to get wrong.
  const wholePlanStandRange = standRange(namedStands)
  const wholePlanStandCount = namedStands.length

  const payloads: SheetPayload[] = split.parts.map((part, partIndex) => {
    const sheetNumber = sheetOf[partIndex]
    const vertices = sheetOutsideFigureVertices(part, split.newPoints)
    const { edges, constants } = buildEdgeTable(vertices)
    const sheetStands = [...assigned.bySheet[partIndex]].sort(compareStands)

    return {
      sheetNumber,
      totalSheets,
      figureLabel: figureLabel(sheetNumber, totalSheets),
      otherSheets: otherSheetsPhrase(sheetNumber, totalSheets),
      ring: part,
      stands: sheetStands,
      vertices,
      edges,
      constants,
      servitudeRows: filterServitudeRowsForSheet(servitudeRows, sheetStands),
      standRange: wholePlanStandRange,
      totalStandCount: wholePlanStandCount,
      newPoints: namedNewPoints,
    }
  })

  // Step 8: sorted by sheet number.
  payloads.sort((a, b) => a.sheetNumber - b.sheetNumber)

  return { ok: true, sheets: payloads }
}
