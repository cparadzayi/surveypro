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

export interface WorkingPlanSpec {
  scale: 'auto'
  beacons: WorkingPlanBeacon[]
  parcels: WorkingPlanParcel[]
  title: string[]
  certificate: { line1: string; line2: string }
  approvalBox: boolean
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
}

/** A ring shorter than this is not a polygon. */
const MIN_RING = 3

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
): { spec: WorkingPlanSpec; skippedParcels: string[] } {
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
    if (ring.length === 0 || ring.some(n => !byName.has(n))) {
      skippedParcels.push(label)
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

  return {
    spec: {
      scale: 'auto',
      beacons,
      parcels,
      title: workingPlanTitle(ctx.projectInfo),
      certificate: certificateFrom(ctx.config),
      approvalBox: true,
    },
    skippedParcels,
  }
}
