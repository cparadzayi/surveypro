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

export interface WorkingPlanBeacon {
  name: string
  X: number
  Y: number
  symbol: 'peg' | 'rm' | 'trig'
  label: 'auto'
}

export interface WorkingPlanParcel {
  label: string
  ring: string[]
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
export function beaconSymbol(description: string | null | undefined): 'peg' | 'rm' | 'trig' {
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
  const name = String(config?.surveyorName ?? '').trim()
  const raw = config?.surveyDate
  const when = raw ? new Date(raw) : null
  // timeZone: 'UTC' -- `new Date('2026-07-01')` parses as UTC midnight, so
  // without pinning the render zone too, any negative-offset local timezone
  // renders it as the last day of the PREVIOUS month.
  const month = when && !Number.isNaN(when.getTime())
    ? when.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    : ''
  return {
    line1: month ? `Surveyed in ${month} by me,` : 'Surveyed by me,',
    line2: name ? `${name}, Land Surveyor` : 'Land Surveyor',
  }
}

export function buildWorkingPlanSpec(
  ctx: WorkingPlanSpecContext,
): WorkingPlanSpecResult {
  const byName = new Map<string, { X: number; Y: number; description: string }>()
  for (const f of ctx.beacons?.features ?? []) {
    if (f.geometry?.type !== 'Point') continue
    const props = (f.properties ?? {}) as Record<string, unknown>
    const name = String(props.name ?? '').trim()
    if (!name || byName.has(name)) continue
    const [Y, X] = (f.geometry as GeoJSON.Point).coordinates as [number, number]
    if (!Number.isFinite(X) || !Number.isFinite(Y)) continue
    byName.set(name, { X, Y, description: String(props.description ?? '') })
  }

  const parcels: WorkingPlanParcel[] = []
  const skippedParcels: string[] = []
  const missingBeacons: string[] = []
  const missingSeen = new Set<string>()
  const parcelsWithoutNamedRing: string[] = []
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
  }

  const beacons: WorkingPlanBeacon[] = used.map(name => {
    const b = byName.get(name)!
    return { name, X: b.X, Y: b.Y, symbol: beaconSymbol(b.description), label: 'auto' as const }
  })

  const inset = buildInset(ctx.calibration, beacons)

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
