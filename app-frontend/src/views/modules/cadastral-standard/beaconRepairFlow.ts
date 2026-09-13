import {
  planRenamePropagation,
  planReconciliation,
  summarise,
  RECONCILE_TOLERANCE_M,
  type BeaconNamePlan,
  type ReconciliationPlan,
  type ReconcileSummary,
} from './beaconReconcile'
import { planNameNormalization } from '../../../../../app-shared/beaconName'
import { describeCascadeOutcome, type CascadeOutcome } from './vertexSnap'

/** tuple shape of A1: one row per renamed coordinate point. */
export interface BeaconRename {
  id: number | string
  from: string
  to: string
}

/** Pure: re-id every entry whose id === from; returns a NEW list. */
export function renamePointList(points: any[] | undefined, from: string, to: string): any[] {
  if (!Array.isArray(points)) return []
  let changed = false
  const out = points.map(p => {
    if (p?.id === from) { changed = true; return { ...p, id: to } }
    return p
  })
  return changed ? out : points
}

/**
 * Pure: the A2 PATCH payloads, read from the persisted step_data shapes only
 * (spec Part 2). A step is included only when it exists and a rename changed it.
 * ImportedPoints ride at step_data['csv-import'].points (:207-214, :360); adjusted
 * coordinates at step_data['calculations-part1'].adjusted_coordinates (:422). The
 * workflow PATCH merges shallowly (:428-434), so copying only the points key keeps
 * site_calibration / coordinate_count / file_imported_at intact.
 */
export function renameWorkflowCopies(
  stepData: Record<string, any> | undefined,
  renames: BeaconRename[]
): Array<{ step: string; metadata: Record<string, any> }> {
  const out: Array<{ step: string; metadata: Record<string, any> }> = []
  for (const { step, key } of STEP_KEYS) {
    const list = stepData?.[step]?.[key]
    if (!Array.isArray(list)) continue
    let next = list
    let changed = false
    for (const { from, to } of renames || []) {
      const candidate = renamePointList(next, from, to)
      if (candidate !== next) { next = candidate; changed = true }
    }
    if (changed) out.push({ step, metadata: { [key]: next } })
  }
  return out
}

const STEP_KEYS: Array<{ step: string; key: string }> = [
  { step: 'csv-import', key: 'points' },
  { step: 'calculations-part1', key: 'adjusted_coordinates' },
]

export interface RepairDeps {
  /** Phase A1: POST /coordinate-points/normalize-names in the view (Task 3 route). */
  executeA1(renames: BeaconRename[]): Promise<{ ok: boolean; error?: string; renamed?: number }>
  /** Phase A2: PATCH the workflow step copies (persisted) plus in-memory copies. */
  executeA2(renames: BeaconRename[]): Promise<{ ok: boolean; failed: Array<{ step: string; error: string }> }>
  /** Phase B: metadata-only parcel writes, one PUT each. */
  updateParcels(writes: Array<{ parcelId: number; metadata: Record<string, any> }>): Promise<CascadeOutcome>
  /** One refreshParcelsFromDatabase() after B. */
  refresh(): void
}

export interface RepairOutcome {
  phase: 'a1-failed' | 'a2-failed' | 'complete'
  a1Renamed?: number
  a2Failed?: Array<{ step: string; error: string }>
  b?: CascadeOutcome
  blocked: Array<{ designation: string; detail: string }>
  error?: string
}

export interface BeaconRepairPlanData {
  beaconPlan: BeaconNamePlan
  parcelPlan: ReconciliationPlan
  summary: ReconcileSummary
}

/**
 * The shared plan both the 🔧 button and the post-re-import self-heal compute:
 * coordinate points normalised, then parcels reconciled against the names that
 * WILL exist once A1 has run (spec Part 2). Pure and therefore unit-testable.
 */
export function buildBeaconRepairPlan(dbParcels: any[], dbPoints: any[]): BeaconRepairPlanData {
  // Keep y/x through the plan: planReconciliation matches by POSITION and needs
  // the coords that planNameNormalization().after carries forward (dropping them
  // makes every vertex unmatched — the original button's latent no-op).
  const beaconPlan = planNameNormalization(
    (dbPoints || []).map(p => ({ id: p.id ?? p.name, name: p.name, y: p.y, x: p.x }))
  )
  const parcelPlan = planReconciliation(dbParcels, beaconPlan.after, RECONCILE_TOLERANCE_M)
  return { beaconPlan, parcelPlan, summary: summarise(beaconPlan, parcelPlan) }
}

/** Execute a constructed plan through A1 → A2 → B; see executeRepair. */
export function runBeaconRepair(plan: BeaconRepairPlanData, deps: RepairDeps): Promise<RepairOutcome> {
  return executeRepair(plan.beaconPlan, plan.parcelPlan, deps)
}

/**
 * The load-bearing A1 → A2 → B ordering (spec Part 2). A1 comes before B: parcels
 * are never renamed to names that do not exist yet. A re-run after any partial
 * failure is safe — A1 has nothing left to do and B re-derives from positions.
 */
export async function executeRepair(
  beaconPlan: BeaconNamePlan,
  parcelPlan: ReconciliationPlan,
  deps: RepairDeps
): Promise<RepairOutcome> {
  // ReconciliationPlan.blocked entries are ParcelPlan rows (detail nested at .blocked.detail).
  const blocked = (parcelPlan?.blocked ?? []).map(p => ({
    designation: p.designation,
    detail: (p as any).blocked?.detail ?? (p as any).detail ?? 'cannot verify this parcel',
  }))
  const renames = beaconPlan?.renames ?? []
  let a1Renamed = 0

  if (renames.length > 0) {
    const a1 = await deps.executeA1(renames)
    if (!a1.ok) return { phase: 'a1-failed', a1Renamed: 0, blocked, error: a1.error || 'unknown error' }
    a1Renamed = a1.renamed ?? renames.length
    const a2 = await deps.executeA2(renames)
    if (!a2.ok) return { phase: 'a2-failed', a1Renamed, a2Failed: a2.failed, blocked }
  }

  const b = await deps.updateParcels((parcelPlan?.writes ?? []).map(w => ({ parcelId: w.parcelId, metadata: w.metadata })))
  deps.refresh()
  return { phase: 'complete', a1Renamed, b, blocked }
}

/**
 * Going-forward single-rename propagation (Resolved #3). Task 5 wires the callers.
 * A blocked parcel (vertex list unreadable, or edges not matching the ring) is NOT
 * silently skipped — its staleness stays for the 🔧 button, and the caller is told.
 */
export async function propagateRename(
  parcelRows: any[],
  from: string,
  to: string,
  deps: { updateParcel(parcelId: number, patch: { metadata: Record<string, any> }): Promise<void> }
): Promise<{ written: string[]; failed: Array<{ designation: string; message: string }> }> {
  const plan = planRenamePropagation(parcelRows, from, to)
  const written: string[] = []
  const failed: Array<{ designation: string; message: string }> = []

  for (const blocked of plan.blocked) {
    failed.push({ designation: blocked.designation, message: `blocked — ${blocked.detail}` })
  }

  for (const write of plan.writes) {
    try {
      await deps.updateParcel(write.parcelId, { metadata: write.metadata })
      written.push(write.designation)
    } catch (err: any) {
      failed.push({ designation: write.designation, message: err?.response?.data?.error || err?.message || String(err) })
    }
  }
  return { written, failed }
}

/** The blocking dialog for a repair outcome. */
export function describeRepairResult(outcome: RepairOutcome): string {
  switch (outcome.phase) {
    case 'a1-failed':
      return `Beacon names did not change — nothing else was written.\n\n` +
        `${outcome.error}\n\n` +
        `Run 🔧 Repair Beacon Names again.`
    case 'a2-failed': {
      const lines = (outcome.a2Failed ?? []).map(f => `  • ${f.step} — ${f.error}`).join('\n')
      return `PARTIAL UPDATE — beacon names changed but some workflow copies did not.\n\n` +
        `NOT updated:\n${lines}\n\n` +
        `Re-run the same repair to finish it.`
    }
    default: {
      const lines: string[] = []
      if (outcome.a1Renamed) lines.push(`Normalised ${outcome.a1Renamed} beacon name${outcome.a1Renamed === 1 ? '' : 's'}.`)
      if (outcome.blocked?.length) lines.push(`Left untouched (blocked): ${outcome.blocked.map(b => `${b.designation} — ${b.detail}`).join('; ')}.`)
      if (outcome.b) {
        const problem = describeCascadeOutcome(outcome.b, 'the beacon name change is only partially applied')
        if (problem) return lines.concat(problem).join('\n\n')
        lines.push(`Updated ${outcome.b.written.length} parcel(s): ${outcome.b.written.join(', ')}.`)
      }
      if (!outcome.a1Renamed && !outcome.blocked?.length && !outcome.b?.written.length) {
        return `No changes were needed.`
      }
      return lines.join('\n')
    }
  }
}