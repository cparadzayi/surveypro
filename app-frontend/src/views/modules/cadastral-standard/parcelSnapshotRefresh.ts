/**
 * Post-re-import coordinate refresh planner (bnr: "refreshed persisted snapshots").
 *
 * After a CSV re-import (executeMerge) writes new beacon coordinates, the saved
 * parcel snapshots still hold the OLD y/x: metadata.cape_lo_points, the geometry
 * ring, metadata.residuals.edges (which the diagram's outside-figure table reads
 * VERBATIM), and the workflow's step_data adjusted_coordinates. The map looks
 * right because it reads coordinate_points live; every generated plan looks stale
 * because those consumers read the persisted snapshots.
 *
 * This planner is PURE: it derives, per beacon-linked parcel, the fresh vertex
 * ring by NAME lookup in the post-merge registry (renames run first, so ids are
 * already normalised). Position matching is deliberately NOT used — a correction
 * may well move a beacon far enough that position matching loses it, exactly when
 * a refresh matters most.
 */
export interface VertexPoint {
  id: string
  y: number
  x: number
  status?: string
  description?: string
}

export interface SnapshotWrite {
  parcelId: number
  designation: string
  points: VertexPoint[]
}

export interface SnapshotPlan {
  /** Parcels whose ring should be rebuilt from the fresh registry. */
  writes: SnapshotWrite[]
  /** Parcels skipped because they carry no beacon-linked cape_lo_points ring. */
  skipped: string[]
  /**
   * Parcels whose vertex names no longer exist in the registry — left untouched,
   * surfaced so the caller can tell the surveyor.
   */
  blocked: Array<{ designation: string; detail: string }>
}

function registryFields(p: any): { name: string; y: number; x: number } | null {
  if (!p) return null
  const name = p.name ?? p.id
  if (typeof name !== 'string' || !name) return null
  if (typeof p.y !== 'number' || typeof p.x !== 'number') return null
  return { name, y: p.y, x: p.x }
}

function coordsEqual(a: VertexPoint, b: any): boolean {
  return b && typeof b.y === 'number' && typeof b.x === 'number'
    && a.y === b.y && a.x === b.x
}

export function planCoordinateRefresh(dbParcels: any[], dbPoints: any[]): SnapshotPlan {
  const registry = new Map<string, { name: string; y: number; x: number }>()
  for (const p of dbPoints || []) {
    const row = registryFields(p)
    if (!row) continue
    if (!registry.has(row.name)) registry.set(row.name, row)
    else if (row.name === String(p.name ?? p.id)) {
      // Prefer the exact canonical spelling over case-variant duplicates.
      registry.set(row.name, row)
    }
  }

  const writes: SnapshotWrite[] = []
  const skipped: string[] = []
  const blocked: Array<{ designation: string; detail: string }> = []

  for (const parcel of dbParcels || []) {
    const designation = parcel.designation || parcel.stand || String(parcel.id)
    if (parcel.parcel_status === 'orphaned' || parcel.status === 'orphaned') continue

    const existing = parcel.metadata?.cape_lo_points
    // listLandParcels returns the polygon JSON under `geom` (ST_AsGeoJSON);
    // accept `geometry` too for client-built parcels that predate that contract.
    const ring = parcel.geom?.coordinates?.[0] ?? parcel.geometry?.coordinates?.[0]
    if (!Array.isArray(existing) || !Array.isArray(ring)) {
      skipped.push(designation)
      continue
    }
    if (existing.length !== ring.length - 1) {
      skipped.push(designation)
      continue
    }

    const points: VertexPoint[] = []
    let changed = false
    let missing: string | null = null
    for (const v of existing) {
      const found = registry.get(v?.id)
      if (!found) { missing = v?.id ?? '(unnamed)'; break }
      const next: VertexPoint = { id: found.name, y: found.y, x: found.x, status: v.status, description: v.description }
      if (!coordsEqual({ id: found.name, y: v.y, x: v.x }, found)) changed = true
      // registry maps every id → its (already normalised) name; keep the stored
      // id unless it actually differs, so we never "rename" in this pass.
      next.id = v.id
      points.push(next)
    }

    if (missing) {
      blocked.push({ designation, detail: `vertex beacon "${missing}" not found in the fresh point registry` })
      continue
    }
    if (!changed) {
      skipped.push(designation)
      continue
    }
    writes.push({ parcelId: parcel.id, designation, points })
  }

  return { writes, skipped, blocked }
}

/**
 * Pure: the workflow-step copies whose beacon coordinates ride along with the
 * rebuild (bnr). Only step_data['calculations-part1'].adjusted_coordinates
 * carries survey-plan vertex coordinates; csv-import.points is the raw import
 * snapshot and must keep the values the surveyor uploaded.
 */
export function refreshWorkflowCoordinateCopies(
  stepData: Record<string, any> | undefined,
  registryRows: any[]
): Array<{ step: string; metadata: Record<string, any> }> {
  const registry = new Map<string, { y: number; x: number }>()
  for (const p of registryRows || []) {
    const name = p?.name ?? p?.id
    if (typeof name === 'string' && typeof p?.y === 'number' && typeof p?.x === 'number') {
      registry.set(name, { y: p.y, x: p.x })
    }
  }

  const list = stepData?.['calculations-part1']?.adjusted_coordinates
  if (!Array.isArray(list)) return []

  const next = list.map((p: any) => {
    const found = registry.get(p?.id)
    if (!found) return p
    if (p.y === found.y && p.x === found.x) return p
    return { ...p, y: found.y, x: found.x }
  })
  const anyChanged = next.some((p: any, i: number) => p !== list[i])
  if (!anyChanged) return []
  return [{ step: 'calculations-part1', metadata: { adjusted_coordinates: next } }]
}