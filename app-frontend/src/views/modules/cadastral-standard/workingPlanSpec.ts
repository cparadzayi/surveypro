import { subjectSides } from './sideAnnotations'
/**
 * Builds the Working Plan module's `spec` from what SurveyPlanMapView already
 * holds: the final coordinate list (as the beacons FeatureCollection, which has
 * already had the swapped-coordinate correction applied) and each parcel's
 * NAMED ring from metadata.cape_lo_points.
 *
 * Sourcing rings from cape_lo_points is what lets this avoid proximity matching
 * (planPayload.ts's beaconsForParcel, VERTEX_TOL = 0.05 m). Snapping ring
 * vertices to the nearest beacon fails by drawing a plausible WRONG plan; a
 * named ring either resolves or it doesn't.
 */

/**
 * SI 727 Fifth Schedule conventional signs (pp. 3306-3307).
 *
 *   placed          beacon placed                        open circle
 *   found           beacon found and adopted             concentric circles
 *   foundNotAdopted beacon found and not adopted         concentric circles, struck
 *   rm              reference mark                       circle with a cross
 *   ws              survey station, marked               circle with a filled centre
 *   wsu             survey station, unmarked             filled dot
 *   trig            trigonometrical beacon / TSM         black triangle in a circle
 *   ocp             official control point               inverted black triangle in a circle
 *
 * 'peg' is retained as an alias of 'placed' for the description-based fallback,
 * which predates these codes; the renderer draws both as a beacon placed.
 */
export type WorkingPlanSymbol =
  | 'placed' | 'peg' | 'found' | 'foundNotAdopted'
  | 'rm' | 'ws' | 'wsu' | 'trig' | 'ocp'

export interface WorkingPlanBeacon {
  name: string
  X: number
  Y: number
  symbol: WorkingPlanSymbol
  label: 'auto'
}

export interface WorkingPlanParcel {
  label: string
  ring: string[]
}

/** Free text placed at a ground coordinate -- a neighbouring property's name. */
export interface WorkingPlanNote {
  text: string
  X: number
  Y: number
}

/**
 * The examination docket asks the Working Plan for "14. Area of property",
 * singular. Per-stand areas are a GENERAL PLAN check ("10. Area of stands
 * checked"), so the working plan states one figure rather than a table.
 *
 * That figure is the parent's REGISTERED area when it has been captured -- on a
 * subdivision the property is the land being subdivided, and its registered
 * area is the authority. Falling back to the computed total of the surveyed
 * parcels keeps the item satisfied when no registered area is to hand, but it
 * is our arithmetic rather than the title's.
 */
/** A name lettered along a side: the renderer rotates it and places it clear of
 *  the figure. Used for roads and servitudes alike -- both are adjoining
 *  features named along the boundary they abut. */
export interface WorkingPlanRoad {
  name: string
  from: string
  to: string
}

export interface WorkingPlanInsetBeacon {
  name: string
  X: number
  Y: number
  /** The station's own conventional sign. The inset renderer draws the whole
   *  Fifth Schedule set, so a working station appears as a working station. */
  symbol: WorkingPlanSymbol
}

export interface WorkingPlanInset {
  /** Explicit denominator: the module takes a number here, never 'auto'. */
  scale: number
  beacons: WorkingPlanInsetBeacon[]
}

export interface WorkingPlanSpec {
  scale: 'auto'
  beacons: WorkingPlanBeacon[]
  parcels: WorkingPlanParcel[]
  title: string[]
  certificate: { line1: string; line2: string }
  approvalBox: boolean
  /** Locality diagram. Omitted entirely when no calibration was imported. */
  inset?: WorkingPlanInset
  /** Surrounding properties. Omitted when no contiguous side was tagged. */
  notes?: WorkingPlanNote[]
  /**
   * Abutting neighbours, marked with outward stubs at the terminals they
   * touch -- the same mark the diagram draws, from the same helpers. Not
   * de-duplicated the way the NAMES are: each tagged side is a real abutment,
   * and dropping one would understate what adjoins the land.
   */
  contiguous?: Array<{ from: string; to: string; end?: 'from' | 'to' | 'both' }>
  /** Roads and servitudes, lettered along the side they abut. */
  roads?: WorkingPlanRoad[]
  /** Survey Record number, already prefixed for printing. */
  srNumber?: string
}

export interface WorkingPlanSpecResult {
  spec: WorkingPlanSpec
  /** Parcels that could not be drawn, surfaced to the surveyor as a warning. */
  skippedParcels: string[]
  /** How many beacons the coordinate list supplied. Zero is its own diagnosis. */
  beaconCount: number
  /** Ring names no beacon matched, deduped, in first-seen order. */
  missingBeacons: string[]
  /** Parcels that stored no named ring at all. */
  parcelsWithoutNamedRing: string[]
}

export interface WorkingPlanSpecContext {
  /** From exportBeaconsAsGeoJSON() — point coordinates are [Y, X] in Cape Lo. */
  beacons: GeoJSON.FeatureCollection
  /** parcels.value, each carrying metadata.cape_lo_points. */
  parcels: any[]
  projectInfo: any
  config: any
  /**
   * The Outside Figure parcel's id, from getOutsideFigureParcel(). It is the
   * remainder-of-parent figure General Plans draw around, not a stand on this
   * sheet — the SI 727 path excludes it the same way, tagging it
   * `isOutsideFigure` so the backend suppresses its label. Left undefined,
   * behaviour is unchanged: the parcel draws like any other.
   */
  outsideFigureId?: unknown
  /**
   * The imported GNSS site calibration, from siteCalibrationFrom(). Its pairs
   * are the national control the survey was actually tied to, which is what a
   * locality inset is for -- deliberately not a proximity search of the control
   * registry, which would show trigs this survey never observed.
   */
  calibration?: { pairs?: Array<{ pointId?: string; controlNorthing?: number; controlEasting?: number }> }
  /**
   * Side annotations per parcel id, from sideAnnotationsBySubject. Sides tagged
   * `contiguous` name the neighbouring property along that side -- the only
   * place the data model records a surrounding property's designation.
   */
  sideAnnotations?: Record<string, Array<{
    side?: string; role?: string; label?: string; widthM?: number
    end?: 'from' | 'to' | 'both'
    /** Where the road leads at each end of the side (docket item 10). */
    destinationFrom?: string; destinationTo?: string
  }>>
}

/** A ring shorter than this is not a polygon. */
const MIN_RING = 3

/**
 * The inset box, in sheet millimetres, mirroring LAYOUT.inset.box in the
 * renderer (working-plan.js). Duplicated rather than imported because that
 * module is backend-only; if the box is ever resized there, the scale computed
 * here goes stale and the inset over- or under-fills.
 */
const INSET_BOX_MM = { w: 291.97 - 162.9, h: 196.13 - 109.69 }

/**
 * 1.15 is the renderer's own figure padding, reused so the inset is framed like
 * the main figure. It also reproduces the 1:200000 the reference sheet used for
 * this survey's control.
 */
const INSET_PADDING = 1.15

/** Round scales a surveyor expects to read on a locality diagram. */
const INSET_SCALES = [5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000, 2000000]

/**
 * Trigonometrical station or reference mark, from the Zimbabwe control
 * designation: Primary, Secondary, Tertiary and Quaternary monuments are all
 * trig stations and carry the triangle. Anything else -- BASE, RM7, a TSM --
 * is a reference mark and carries the double circle.
 */
export function insetSymbolFor(pointId: string | null | undefined): 'trig' | 'rm' {
  return /\/[PSTQ]$/i.test(String(pointId ?? '').trim()) ? 'trig' : 'rm'
}

function insetScaleFor(points: Array<{ X: number; Y: number }>): number {
  // Ground east/north, matching the renderer: e = -Y, n = -X.
  const e = points.map(p => -p.Y)
  const n = points.map(p => -p.X)
  const spanE = Math.max(...e) - Math.min(...e)
  const spanN = Math.max(...n) - Math.min(...n)
  const need = Math.max(spanE / INSET_BOX_MM.w, spanN / INSET_BOX_MM.h) * 1000 * INSET_PADDING
  return INSET_SCALES.find(sc => sc >= need) ?? INSET_SCALES[INSET_SCALES.length - 1]
}

/**
 * The locality inset: the control the survey was tied to, plus the survey
 * itself. Without that last marker the inset shows four trig stations and no
 * indication of where the job is, which is the one thing a locality diagram
 * has to convey.
 */
function buildInset(
  calibration: WorkingPlanSpecContext['calibration'],
  figure: WorkingPlanBeacon[],
): WorkingPlanInset | undefined {
  const control: WorkingPlanInsetBeacon[] = []
  for (const pair of calibration?.pairs ?? []) {
    const name = String(pair?.pointId ?? '').trim()
    const X = Number(pair?.controlNorthing)
    const Y = Number(pair?.controlEasting)
    if (!name || !Number.isFinite(X) || !Number.isFinite(Y)) continue
    if (control.some(c => c.name === name)) continue
    control.push({ name, X, Y, symbol: insetSymbolFor(name) })
  }
  if (control.length === 0 || figure.length === 0) return undefined

  // A real station inside the site, drawn with its own conventional sign --
  // the reference sheet marks the site with BASE, a working station, not with a
  // synthetic point. Preference runs marked station, unmarked station, then
  // reference mark; failing all three, the boundary beacon nearest the middle
  // of the figure, which is still a real beacon with a real name.
  const cx = figure.reduce((t, b) => t + b.X, 0) / figure.length
  const cy = figure.reduce((t, b) => t + b.Y, 0) / figure.length
  const preferred = ['ws', 'wsu', 'rm']
  const chosen =
    preferred.map(s => figure.find(b => b.symbol === s)).find(Boolean) ??
    figure.reduce((best, b) =>
      Math.hypot(b.X - cx, b.Y - cy) < Math.hypot(best.X - cx, best.Y - cy) ? b : best)
  const site: WorkingPlanInsetBeacon = {
    name: chosen.name,
    X: chosen.X,
    Y: chosen.Y,
    symbol: chosen.symbol,
  }
  const beacons = [...control, site]
  return { scale: insetScaleFor(beacons), beacons }
}

/**
 * Beacon kind, read from the description.
 *
 * Deliberately NOT from `status`: that records whether the beacon was found (F)
 * or placed (P), which says nothing about whether it is a peg, a reference mark
 * or a trig station. An unrecognised description draws a peg rather than
 * promoting the beacon on a guess.
 */
/**
 * Beacon kind from the CSV status code, where the surveyor gave one that says
 * what the beacon IS. Returns undefined for codes that do not.
 *
 * F (found) and P (placed) predate these codes and are deliberately not mapped
 * here. SI 727's Fifth Schedule does distinguish them -- a placed beacon is an
 * open circle, a beacon found and adopted is concentric circles -- but the
 * renderer cannot yet draw that distinction, and re-mapping them now would
 * alter every plan already produced. Pending the Fifth Schedule symbol work.
 *
 * WS (working station) currently draws as a reference mark, which is how the
 * reference sheet treats BASE. Whether SI 727's Fifth Schedule prescribes a
 * distinct symbol for a working station is NOT settled -- this maps to the
 * nearest honest existing symbol rather than inventing one.
 */
function statusSymbol(status: string | null | undefined): WorkingPlanSymbol | undefined {
  switch (String(status ?? '').trim().toUpperCase()) {
    case 'P':    return 'placed'
    case 'F':    return 'found'
    case 'FN':   return 'foundNotAdopted'
    case 'RM':   return 'rm'
    case 'WS':   return 'ws'
    case 'WSU':  return 'wsu'
    case 'TRIG': return 'trig'
    case 'OCP':  return 'ocp'
    default:     return undefined
  }
}

export function beaconSymbol(
  description: string | null | undefined,
  status?: string | null,
): WorkingPlanSymbol {
  // An explicit status beats the description: RM15 is a reference mark because
  // the surveyor coded it RM, not because of what the notes happen to say.
  const fromStatus = statusSymbol(status)
  if (fromStatus) return fromStatus

  const d = (description ?? '').toLowerCase()
  if (/\btrig\b|\btrigonometrical\b/.test(d)) return 'trig'
  if (/\breference mark\b|\brm\b|\brm\d/.test(d)) return 'rm'
  return 'peg'
}

/**
 * The parcel's boundary as beacon names, in ring order. Empty when the parcel
 * cannot supply one — a QGIS import with no cape_lo_points, an unnamed vertex,
 * or a ring too short to close.
 */
export function ringNames(parcel: any): string[] {
  const pts = parcel?.metadata?.cape_lo_points
  if (!Array.isArray(pts) || pts.length < MIN_RING) return []

  const names = pts.map((p: any) => String(p?.id ?? '').trim())
  if (names.some((n: string) => n === '')) return []

  // geom repeats the first vertex to close the ring; cape_lo_points normally
  // does not. If one has crept in, drop it so the first leg isn't drawn twice.
  // >= (not >) so a degenerate ring like ['A','B','A'] -- two distinct points
  // with a closing duplicate -- pops to ['A','B'] and correctly fails the
  // length check below, instead of being accepted as a two-point "polygon".
  if (names.length >= MIN_RING && names[0] === names[names.length - 1]) names.pop()

  return names.length >= MIN_RING ? names : []
}

/** Up to the four heading lines the module accepts. The first names the
 *  document -- the renderer sets it larger than the rest. */
export function workingPlanTitle(projectInfo: any): string[] {
  const lines = ['WORKING PLAN OF']
  const designation = String(projectInfo?.designation ?? '').trim()
  const parent = String(projectInfo?.parentProperty ?? '').trim()
  const district = String(projectInfo?.district ?? '').trim()
  if (designation) lines.push(designation)
  if (parent) lines.push(`of ${parent}`)
  if (district) lines.push(`${district} District`)
  return lines.slice(0, 4)
}

/**
 * The Survey Record number as it should print.
 *
 * Captured values vary -- "12345", "SR 12345", "S.R. No. 12345" -- so the
 * prefix is added only when the surveyor has not already written one.
 * Prefixing blindly would put "SR SR 12345" on the sheet.
 */
function srNumberFrom(projectInfo: any): string | undefined {
  const raw = String(projectInfo?.srNo ?? '').trim()
  if (!raw) return undefined
  return /^s\.?\s*r\.?/i.test(raw) ? raw : `S.R. No. ${raw}`
}

function certificateFrom(config: any): { line1: string; line2: string } {
  const raw = config?.surveyDate
  const when = raw ? new Date(raw) : null
  // timeZone: 'UTC' -- `new Date('2026-07-01')` parses as UTC midnight, so
  // without pinning the render zone too, any negative-offset local timezone
  // renders it as the last day of the PREVIOUS month.
  const month = when && !Number.isNaN(when.getTime())
    ? when.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : ''
  // No surveyor name: the diagram renderer signs "Land Surveyor" unqualified and
  // the working plan matches it. The name belongs on the certificate the
  // surveyor signs, not pre-printed by us.
  return {
    line1: month ? `Surveyed in ${month} by me,` : 'Surveyed by me,',
    line2: 'Land Surveyor',
  }
}

/** Words that name a feature TYPE. A part containing one is a complete name;
 *  a part containing none is a fragment of the name on the next side. */
/** Words that name a feature TYPE. A part containing one is a complete name;
 *  a part with none is a fragment of the name continued on the next side. */
const FEATURE_WORDS = [
  'ROAD', 'STREET', 'LANE', 'AVENUE', 'DRIVE', 'WAY',
  'SERVITUDE', 'RIVER', 'STREAM', 'RAILWAY',
]

/** Whitespace-insensitive, so 'R  O  A  D' reads the same as 'ROAD' -- surveyors
 *  letter these spaced out, and the spacing is deliberate. */
function namesAFeature(label: string): boolean {
  const squashed = label.replace(/\s+/g, '').toUpperCase()
  return FEATURE_WORDS.some(w => squashed.includes(w))
}

/** Is a point inside a ring? Ray casting; the ring is open (no closing vertex). */
function insideRing(X: number, Y: number, ring: Array<{ X: number; Y: number }>): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].X, yi = ring[i].Y, xj = ring[j].X, yj = ring[j].Y
    if ((yi > Y) !== (yj > Y) && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

type NoteCandidate = WorkingPlanNote & { length: number }
type RoadCandidate = WorkingPlanRoad & { length: number }

const sideLength = (sd: { a: [number, number]; b: [number, number] }) =>
  Math.hypot(sd.b[0] - sd.a[0], sd.b[1] - sd.a[1])

/**
 * One name, one label.
 *
 * Adjoining features are tagged per side per parcel, so three stands abutting a
 * single remainder each tag it and the sheet letters that remainder three
 * times, millimetres apart. Real output showed exactly that.
 *
 * The key collapses whitespace, because the same neighbour gets typed with
 * different letter-spacing on different sides ('R  E  M.  /' and 'R E M. /' are
 * one remainder). The winner is the candidate on the LONGEST side: the most
 * legible place to letter it, and stable as parcels are re-digitised.
 *
 * Grouping is by name, never by proximity or role-blind merging. A name
 * deliberately lettered across consecutive sides -- 'MAIN' then 'ROAD' around a
 * corner -- is two different names and survives untouched.
 */
function longestPerName<T extends { length: number }>(items: T[], nameOf: (x: T) => string): T[] {
  const best = new Map<string, T>()
  for (const it of items) {
    const key = nameOf(it).replace(/\s+/g, ' ').trim().toUpperCase()
    const held = best.get(key)
    if (!held || it.length > held.length) best.set(key, it)
  }
  return [...best.values()]
}

/** How far outside the boundary a neighbour's name sits, as a fraction of the
 *  parcel's own size -- so it scales with the figure instead of assuming a
 *  drawing scale the adapter does not know. */
const NOTE_OFFSET_FRACTION = 0.14

/**
 * SI number format: comma decimal, space thousands. Mirrors formatSI() in
 * app-backend/src/services/diagram/numberFormat.js, which is the original and
 * is backend-only -- so a road width reads identically on the diagram and on
 * the working plan.
 */
function formatWidthSI(value: number, decimals = 2): string {
  const fixed = Math.abs(Number(value) || 0).toFixed(decimals)
  const [intPart, dec] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  return dec != null ? `${grouped},${dec}` : grouped
}

/**
 * What the surveyor tagged on each side, turned into sheet features.
 *
 * The three roles are drawn differently because they are different things:
 * `contiguous` names the neighbouring PROPERTY and is placed outside that side,
 * while `road` and `servitude` are adjoining FEATURES and are lettered along
 * the side, which is how the diagram renderer treats them too.
 *
 * A road's width is appended to its name, matching the diagram. A servitude's
 * width is appended as well -- the diagram carries it in the width of the strip
 * it draws, and the working plan draws no strip, so leaving it off would
 * understate what burdens the land.
 */
/**
 * Step a name outward until it is clear of every parcel drawn, not just the one
 * whose side it was tagged on. The offset is a fraction of the parcel's own
 * size, so on a plan of several stands a name can otherwise land inside the
 * next stand along and read as if it belonged there.
 */
function pushClearOfFigure(
  X: number, Y: number, ux: number, uy: number, step: number,
  rings: Array<Array<{ X: number; Y: number }>>,
): { X: number; Y: number } {
  // Enough steps to cross a neighbouring parcel of similar size: a name tagged
  // on a shared edge starts INSIDE the parcel on the other side of it, and a
  // short walk only moves it deeper in.
  let x = X, y = Y
  for (let k = 0; k < 24; k++) {
    if (!rings.some(r => insideRing(x, y, r))) return { X: x, Y: y }
    x += ux * step
    y += uy * step
  }
  return { X: x, Y: y }
}

/** Is this side also a side of another parcel drawn on the plan? */
function sharedWithDrawnParcel(
  from: string, to: string, otherRings: string[][],
): boolean {
  return otherRings.some(r => {
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length]
      if ((a === from && b === to) || (a === to && b === from)) return true
    }
    return false
  })
}

function sideFeatures(
  ring: Array<{ name: string; X: number; Y: number }>,
  annotations: Array<{ side?: string; role?: string; label?: string; widthM?: number }> | undefined,
  allRings: Array<Array<{ X: number; Y: number }>> = [],
  otherRings: string[][] = [],
): { notes: NoteCandidate[]; roads: RoadCandidate[]; contiguous: WorkingPlanSpec['contiguous'] } {
  const notes: NoteCandidate[] = []
  const roads: RoadCandidate[] = []
  const contiguous: NonNullable<WorkingPlanSpec['contiguous']> = []
  const linear: Array<{ i: number; label: string; widthM: number; role: string; destFrom: string; destTo: string }> = []
  const tagged = (annotations ?? []).filter(a => String(a?.label ?? '').trim() !== '')
  if (tagged.length === 0 || ring.length < MIN_RING) return { notes, roads, contiguous }

  const sides = subjectSides(ring.map(p => [p.X, p.Y] as [number, number]))
  if (sides.length === 0) return { notes, roads, contiguous }

  const cx = ring.reduce((t, p) => t + p.X, 0) / ring.length
  const cy = ring.reduce((t, p) => t + p.Y, 0) / ring.length
  const spanX = Math.max(...ring.map(p => p.X)) - Math.min(...ring.map(p => p.X))
  const spanY = Math.max(...ring.map(p => p.Y)) - Math.min(...ring.map(p => p.Y))
  const offset = Math.hypot(spanX, spanY) * NOTE_OFFSET_FRACTION

  for (const a of tagged) {
    const wanted = String(a.side ?? '').trim().toUpperCase()
    // A stale side id survives a re-digitise. Skipping beats placing a label at
    // NaN, which would corrupt every coordinate in the sheet.
    const i = sides.findIndex(sd => sd.side === wanted)
    if (i < 0) continue
    const label = String(a.label).trim()
    const role = String(a.role ?? '')

    if (role === 'contiguous') {
      const side = sides[i]
      const mx = (side.a[0] + side.b[0]) / 2
      const my = (side.a[1] + side.b[1]) / 2
      const dx = mx - cx, dy = my - cy
      const len = Math.hypot(dx, dy)
      const ux = len > 0 ? dx / len : 0
      const uy = len > 0 ? dy / len : 0
      const at = pushClearOfFigure(
        mx + ux * offset, my + uy * offset, ux, uy, offset, allRings,
      )
      notes.push({ text: label, X: at.X, Y: at.Y, length: sideLength(sides[i]) })
      // Every abutment is marked, even where several sides share one name --
      // EXCEPT where the neighbour is another parcel on this plan. There the
      // shared boundary is already drawn, and a stub would mark a line the
      // reader can already see.
      const from = ring[i].name
      const to = ring[(i + 1) % ring.length].name
      if (!sharedWithDrawnParcel(from, to, otherRings)) {
        contiguous.push({ from, to, end: (a as any).end ?? 'both' })
      }
    } else if (role === 'road' || role === 'servitude') {
      linear.push({
        i, label, widthM: Number(a.widthM), role,
        destFrom: String(a.destinationFrom ?? '').trim(),
        destTo: String(a.destinationTo ?? '').trim(),
      })
    }
  }
  // A linear feature lettered around a corner -- 'M A I N' then 'R O A D' -- is
  // one name across consecutive sides. Merge such a run, but ONLY when at most
  // one part names a feature type: 'Main Road' beside 'Klein Road' is two roads
  // and merging them would invent a third.
  linear.sort((a, b) => a.i - b.i)
  let k = 0
  while (k < linear.length) {
    let end = k
    while (
      end + 1 < linear.length &&
      linear[end + 1].i === linear[end].i + 1 &&
      linear[end + 1].role === linear[end].role
    ) end++
    let run = linear.slice(k, end + 1)
    if (run.length > 1 && run.filter(x => namesAFeature(x.label)).length > 1) run = [linear[k]]

    const parts = run.map(x => x.label)
    const width = run.map(x => x.widthM).find(w => Number.isFinite(w) && w > 0)
    const base = parts.join(' ')
    const withWidth = width ? `${base} ${formatWidthSI(width)}m` : base
    // Destinations, lettered ASCII: the Fifth Schedule uses arrowheads, which
    // an ANSI_1252 R12 file cannot carry as text. Drawing them as geometry is
    // the faithful form and is still to do.
    const df = run.map(x => x.destFrom).find(Boolean)
    const dt = run.map(x => x.destTo).find(Boolean)
    const dest = [df ? `<- ${df}` : '', dt ? `${dt} ->` : ''].filter(Boolean).join('   ')
    const name = dest ? `${withWidth} ${dest}` : withWidth
    // Letter it on the longest side of the run.
    const best = run.reduce((a, b) => (sideLength(sides[b.i]) > sideLength(sides[a.i]) ? b : a))
    roads.push({
      name,
      from: ring[best.i].name,
      to: ring[(best.i + 1) % ring.length].name,
      length: run.reduce((t, x) => t + sideLength(sides[x.i]), 0),
    })
    k += run.length
  }

  return { notes, roads, contiguous }
}

export function buildWorkingPlanSpec(
  ctx: WorkingPlanSpecContext,
): WorkingPlanSpecResult {
  const byName = new Map<string, { X: number; Y: number; description: string; status: string }>()
  for (const f of ctx.beacons?.features ?? []) {
    if (f.geometry?.type !== 'Point') continue
    const props = (f.properties ?? {}) as Record<string, unknown>
    const name = String(props.name ?? '').trim()
    if (!name || byName.has(name)) continue
    const [Y, X] = (f.geometry as GeoJSON.Point).coordinates as [number, number]
    if (!Number.isFinite(X) || !Number.isFinite(Y)) continue
    byName.set(name, {
      X, Y,
      description: String(props.description ?? ''),
      status: String(props.status ?? ''),
    })
  }

  const parcels: WorkingPlanParcel[] = []
  const skippedParcels: string[] = []
  const missingBeacons: string[] = []
  const missingSeen = new Set<string>()
  const parcelsWithoutNamedRing: string[] = []
  const notes: NoteCandidate[] = []
  const roads: RoadCandidate[] = []
  const contiguous: NonNullable<WorkingPlanSpec['contiguous']> = []
  const mutationAreas: Array<{ label: string; area: number }> = []
  let remainderArea: { label: string; area: number } | null = null
  const used: string[] = []
  const seen = new Set<string>()

  // Every drawn ring, so a label can be kept out of ALL of them, and the same
  // rings by beacon NAME so a side shared with another parcel can be spotted.
  const allRings: Array<Array<{ X: number; Y: number }>> = []
  const namedRings: Array<{ id: string; names: string[] }> = []
  for (const p of ctx.parcels ?? []) {
    const rr = ringNames(p)
    if (rr.length && rr.every(n => byName.has(n))) {
      allRings.push(rr.map(n => ({ X: byName.get(n)!.X, Y: byName.get(n)!.Y })))
      namedRings.push({ id: String(p?.id ?? ''), names: rr })
    }
  }

  for (const p of ctx.parcels ?? []) {
    // The Outside Figure is excluded by design, not by failure -- it must not
    // land in skippedParcels, which is a warning surfaced to the surveyor as
    // "Not drawn (no named boundary points)". Reporting it there would train
    // surveyors to ignore a real warning.
    if (ctx.outsideFigureId !== undefined && ctx.outsideFigureId !== null && p?.id === ctx.outsideFigureId) {
      // Not drawn as a stand, but it IS the remaining extent and its area is
      // the whole point of the check.
      const ofArea = Number(p?.area_m2)
      if (Number.isFinite(ofArea) && ofArea > 0) {
        remainderArea = { label: 'Remaining Extent', area: ofArea }
      }
      continue
    }
    const label = String(p?.stand ?? p?.designation ?? p?.id ?? '').trim() || '(unnamed)'
    const ring = ringNames(p)
    // Two different failures, deliberately kept apart: a parcel that stores no
    // named ring is a Compute Area & Consistency problem, while a ring naming a
    // point the coordinate list lacks is an import problem. Collapsing them is
    // what let the guard send a surveyor to recompute areas that were fine.
    if (ring.length === 0) {
      skippedParcels.push(label)
      parcelsWithoutNamedRing.push(label)
      continue
    }
    const missing = ring.filter(n => !byName.has(n))
    if (missing.length > 0) {
      skippedParcels.push(label)
      for (const n of missing) {
        if (!missingSeen.has(n)) { missingSeen.add(n); missingBeacons.push(n) }
      }
      continue
    }
    for (const n of ring) {
      if (!seen.has(n)) { seen.add(n); used.push(n) }
    }
    parcels.push({ label, ring })
    const area = Number(p?.area_m2)
    if (Number.isFinite(area) && area > 0) mutationAreas.push({ label, area })

    const feats = sideFeatures(
      ring.map(n => ({ name: n, ...byName.get(n)! })),
      ctx.sideAnnotations?.[String(p?.id ?? '')],
      allRings,
      namedRings.filter(r => r.id !== String(p?.id ?? '')).map(r => r.names),
    )
    notes.push(...feats.notes)
    roads.push(...feats.roads)
    contiguous.push(...(feats.contiguous ?? []))
  }

  // The working plan shows the WHOLE final coordinate list -- reference marks,
  // working stations and control included -- not just the parcel corners. The
  // renderer takes the figure extent from ring vertices alone, so these extra
  // points cannot shrink the figure. Ring vertices come first so the drawing
  // order stays stable as the coordinate list grows.
  const emitted = [...used, ...[...byName.keys()].filter(n => !seen.has(n))]
  const beacons: WorkingPlanBeacon[] = emitted.map(name => {
    const b = byName.get(name)!
    return { name, X: b.X, Y: b.Y, symbol: beaconSymbol(b.description, b.status), label: 'auto' as const }
  })

  // The inset's site marker is the FIGURE centre, so it must come from the ring
  // vertices -- averaging the whole coordinate list would drag it toward
  // whatever distant control happens to be listed.
  const figureBeacons = beacons.filter(b => seen.has(b.name))

  // De-duplicate before emitting: same name, one label, on its longest side.
  const finalNotes: WorkingPlanNote[] = longestPerName(notes, n => n.text)
    .map(({ text, X, Y }) => ({ text, X, Y }))
  const finalRoads: WorkingPlanRoad[] = longestPerName(roads, r => r.name)
    .map(({ name, from, to }) => ({ name, from, to }))


  const srNumber = srNumberFrom(ctx.projectInfo)

  const inset = buildInset(ctx.calibration, figureBeacons)

  return {
    spec: {
      scale: 'auto',
      beacons,
      parcels,
      title: workingPlanTitle(ctx.projectInfo),
      certificate: certificateFrom(ctx.config),
      approvalBox: true,
      // Omitted, not empty: an empty inset box would assert there was no
      // control rather than that none was imported.
      ...(inset ? { inset } : {}),
      ...(finalNotes.length > 0 ? { notes: finalNotes } : {}),
      ...(finalRoads.length > 0 ? { roads: finalRoads } : {}),
      ...(contiguous.length > 0 ? { contiguous } : {}),
      ...(srNumber ? { srNumber } : {}),
    },
    skippedParcels,
    beaconCount: byName.size,
    missingBeacons,
    parcelsWithoutNamedRing,
  }
}

/** Most names to list in one alert before summarising the rest. */
const MAX_NAMED_BEACONS = 8

/**
 * Why nothing could be drawn, in terms the surveyor can act on.
 *
 * This exists because the guard's single fixed message was wrong the first time
 * it fired in anger: it told a surveyor to run Compute Area & Consistency when
 * all three parcels already stored correct beacon names and the real problem was
 * an empty coordinate list. The adapter can tell these cases apart, so it does.
 */
export function workingPlanEmptyReason(result: WorkingPlanSpecResult): string {
  const { beaconCount, missingBeacons, parcelsWithoutNamedRing, skippedParcels } = result

  if (beaconCount === 0) {
    return 'The coordinate list for this project is empty, so no boundary point can be '
      + 'matched. Import the coordinate list in Step 2 (CSV Import), then generate the '
      + 'Working Plan again.'
  }

  if (missingBeacons.length > 0) {
    const shown = missingBeacons.slice(0, MAX_NAMED_BEACONS).join(', ')
    const rest = missingBeacons.length - MAX_NAMED_BEACONS
    return `These boundary points are not in the coordinate list: ${shown}`
      + (rest > 0 ? `, and ${rest} more` : '')
      + '. Import or rename them in Step 2 (CSV Import), then generate the Working Plan again.'
  }

  if (parcelsWithoutNamedRing.length > 0) {
    return 'No parcel stores its beacon names. Run Compute Area & Consistency so each parcel '
      + 'records the names of its boundary points, then generate the Working Plan again.'
  }

  if (skippedParcels.length === 0) {
    return 'There is no stand to draw — the only parcel in this project is the Outside Figure, '
      + 'which a Working Plan does not draw.'
  }

  return 'No parcel could be drawn on the Working Plan.'
}
