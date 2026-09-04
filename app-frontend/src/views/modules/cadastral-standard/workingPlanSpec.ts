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
  symbol: 'trig' | 'rm'
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
  /** Roads and servitudes, lettered along the side they abut. */
  roads?: WorkingPlanRoad[]
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
  sideAnnotations?: Record<string, Array<{ side?: string; role?: string; label?: string; widthM?: number }>>
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

  const site: WorkingPlanInsetBeacon = {
    name: 'SITE',
    X: figure.reduce((t, b) => t + b.X, 0) / figure.length,
    Y: figure.reduce((t, b) => t + b.Y, 0) / figure.length,
    symbol: 'rm',
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

/** Up to the four heading lines the module accepts. */
export function workingPlanTitle(projectInfo: any): string[] {
  const lines = ['Survey of']
  const designation = String(projectInfo?.designation ?? '').trim()
  const parent = String(projectInfo?.parentProperty ?? '').trim()
  const district = String(projectInfo?.district ?? '').trim()
  if (designation) lines.push(designation)
  if (parent) lines.push(`of ${parent}`)
  if (district) lines.push(`${district} District`)
  return lines.slice(0, 4)
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
function sideFeatures(
  ring: Array<{ name: string; X: number; Y: number }>,
  annotations: Array<{ side?: string; role?: string; label?: string; widthM?: number }> | undefined,
): { notes: NoteCandidate[]; roads: RoadCandidate[] } {
  const notes: NoteCandidate[] = []
  const roads: RoadCandidate[] = []
  const tagged = (annotations ?? []).filter(a => String(a?.label ?? '').trim() !== '')
  if (tagged.length === 0 || ring.length < MIN_RING) return { notes, roads }

  const sides = subjectSides(ring.map(p => [p.X, p.Y] as [number, number]))
  if (sides.length === 0) return { notes, roads }

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
      notes.push({ text: label, X: mx + ux * offset, Y: my + uy * offset, length: sideLength(sides[i]) })
    } else if (role === 'road' || role === 'servitude') {
      const w = Number(a.widthM)
      const name = Number.isFinite(w) && w > 0 ? `${label} ${formatWidthSI(w)}m` : label
      roads.push({ name, from: ring[i].name, to: ring[(i + 1) % ring.length].name, length: sideLength(sides[i]) })
    }
  }
  return { notes, roads }
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
  const used: string[] = []
  const seen = new Set<string>()

  for (const p of ctx.parcels ?? []) {
    // The Outside Figure is excluded by design, not by failure -- it must not
    // land in skippedParcels, which is a warning surfaced to the surveyor as
    // "Not drawn (no named boundary points)". Reporting it there would train
    // surveyors to ignore a real warning.
    if (ctx.outsideFigureId !== undefined && ctx.outsideFigureId !== null && p?.id === ctx.outsideFigureId) {
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
    const feats = sideFeatures(
      ring.map(n => ({ name: n, ...byName.get(n)! })),
      ctx.sideAnnotations?.[String(p?.id ?? '')],
    )
    notes.push(...feats.notes)
    roads.push(...feats.roads)
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
