### Task 4: Frontend backfill — orchestration (`beaconRepairFlow.ts`) + rewiring the 🔧 button

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/vertexSnap.ts` — generalise `describeCascadeOutcome` (`:282-304`)
- Create: `app-frontend/src/views/modules/cadastral-standard/beaconRepairFlow.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/beaconRepairFlow.test.ts`
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` — rewired 🔧 button (`:1651-1753`), new confirm modal alongside the affected-parcels modal (`:853-897`), imports

**Interfaces:**
- Consumes: `planNameNormalization` from `app-shared/beaconName.js` (Task 1); `planReconciliation`, `summarise`, `formatSummary`, `planRenamePropagation`, `RECONCILE_TOLERANCE_M`, and the `BeaconNamePlan` / `ReconciliationPlan` / `PropagationPlan` types from `./beaconReconcile` (Task 2); the Task 3 route `POST /coordinate-points/normalize-names` (via `api.post`, `MapLibreAreaView.vue:923`); `CascadeOutcome` and `describeCascadeOutcome` from `./vertexSnap` (`:266`, `:282`).
- Produces (Task 5 consumes `propagateRename`; nothing in Task 4 or 5 reaches into `repairParcelBeaconNames`'s internals):
  - `renamePointList(points, from, to): any[]` — pure; returns a **new** list with every entry whose `id === from` re-id-ed to `to`; identity when nothing changed.
  - `renameWorkflowCopies(stepData, renames): Array<{ step: string; metadata: Record<string, any> }>` — pure; the A2 PATCH payloads. Reads the persisted shapes only (`step_data['csv-import'].points`, `step_data['calculations-part1'].adjusted_coordinates`), includes a step only when it exists and a rename changed something, and emits the exact metadata to PATCH.
  - `interface RepairDeps` — injected by the view: `executeA1(renames): Promise<{ ok: boolean; error?: string; renamed?: number }>`, `executeA2(renames): Promise<{ ok: boolean; failed: Array<{ step: string; error: string }> }>`, `updateParcels(writes: Array<{ parcelId: number; metadata: Record<string, any> }>): Promise<CascadeOutcome>`, `refresh(): void`.
  - `interface RepairOutcome` — `{ phase: 'a1-failed' | 'a2-failed' | 'complete'; a1Renamed?: number; a2Failed?: Array<{ step, error }>; b?: CascadeOutcome; blocked: Array<{ designation: string; detail: string }>; error?: string }`.
  - `executeRepair(beaconPlan, parcelPlan, deps): Promise<RepairOutcome>` — the load-bearing A1 → A2 → B ordering; **stops on A1 failure** (nothing else is written); A2 is best-effort but reported; B is per-parcel and reported loudly (decision 4).
  - `propagateRename(parcelRows, from, to, deps: { updateParcel(parcelId, { metadata }): Promise<void> }): Promise<{ written: string[]; failed: Array<{ designation: string; message: string }> }>` — the going-forward single-rename propagation (Resolved #3), used by Task 5's `handlePointRename` and `CoordinateListView.commitRename`.
  - `describeRepairResult(outcome: RepairOutcome): string` — the blocking-dialog text.
- No Vue, no network, no MapLibre inside `beaconRepairFlow.ts`; `CascadeOutcome` is imported from `./vertexSnap` (also framework-free).

**Spec anchors:** `docs/superpowers/specs/2026-09-12-beacon-name-reconciliation-design.md` Part 2 (`:416-454`), decisions 3, 4, 6, and Resolved #3 action (for `propagateRename` there; its callers land in Task 5). Plan decisions 7 (injected deps) and 4 (`describeCascadeOutcome` reworded, both callers share it).

- [ ] **Step 1: Generalise `describeCascadeOutcome` (and prove the existing suite stays green)**

`MapLibreAreaView.vue:5509` is the only drag caller: `describeCascadeOutcome(outcome)`. The current text at `vertexSnap.ts:282-304` says "The drag could not be applied…" and "Those parcels no longer share the same corner", which would be wrong for a rename. Generalise with an optional **subject** parameter whose default word-for-word preserves every substring the existing tests assert (`/PARTIAL UPDATE/`, `/boundaries are unchanged/`, `/Re-run/i`, the `  • designation — message` bullets).

In `vertexSnap.ts` replace `describeCascadeOutcome` (`:282-304`):

```ts
/**
 * The blocking-dialog text for a cascade that did not fully succeed, or null when it
 * did. Lives here rather than in the view so the wording is tested.
 *
 * Shared by the vertex-drag flow and the beacon-name repair (spec Part 2: a partial
 * phase B is reported in the same blocking terms as the drag). `subject` is the
 * sentence fragment that names the underlying problem, e.g. 'the shared boundary is
 * now inconsistent' (drag) or 'the beacon name change is only partially applied'
 * (repair). Each parcel is its own PUT and there is no cross-parcel transaction.
 */
export function describeCascadeOutcome(
  outcome: CascadeOutcome,
  subject: string = 'the shared boundary is now inconsistent'
): string | null {
  const failed = outcome?.failed ?? []
  if (failed.length === 0) return null

  const written = outcome?.written ?? []
  const lines = failed.map(f => `  • ${f.designation} — ${f.message}`).join('\n')

  if (written.length === 0) {
    return (
      `No parcel was updated.\n\n` +
      `The change could not be applied to:\n${lines}\n\n` +
      `Nothing was written, so the boundaries are unchanged.`
    )
  }

  return (
    `PARTIAL UPDATE — ${subject}.\n\n` +
    `Updated (${written.length}): ${written.join(', ')}\n` +
    `NOT updated (${failed.length}):\n${lines}\n\n` +
    `Those parcels no longer agree. Re-run the same operation to finish it, ` +
    `or fix the parcels above before generating any plan from this record.`
  )
}
```

This keeps `vertexCascade.test.ts:87-126` green without edits (verify: `describeCascadeOutcome({} as any)` → null; `toBeNull()` on clean; all the listed regexes still match). The drag caller at `MapLibreAreaView.vue:5509` needs no change.

- [ ] **Step 2: Write the failing test**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/beaconRepairFlow.test.ts`:

```ts
import { describe, test, expect } from 'vitest'
import {
  renamePointList,
  renameWorkflowCopies,
  executeRepair,
  propagateRename,
  describeRepairResult,
  type RepairDeps,
} from '../beaconRepairFlow'

/** The persisted step_data shapes (spec Part 2; used by A2). */
const CSV_POINTS = [
  { id: '2474a', y: 1, x: 2, status: 'P', description: 'peg', survey_date: '2026-01-01' },
  { id: '1464', y: 3, x: 4, status: 'F', description: 'town', survey_date: '2026-01-01' },
]
const ADJUSTED = [{ id: '2474a', y: 1, x: 2 }, { id: '1464', y: 3, x: 4 }, { id: '99a', y: 5, x: 6 }]

function deps(overrides: Partial<RepairDeps> = {}): RepairDeps {
  const calls: any[] = []
  return {
    executeA1: async renames => { calls.push(['a1', renames]); return { ok: true, renamed: renames.length } },
    executeA2: async renames => { calls.push(['a2', renames]); return { ok: true, failed: [] } },
    updateParcels: async writes => {
      calls.push(['b', writes.map(w => w.parcelId)])
      return { written: writes.map(w => String(w.parcelId)), failed: [] }
    },
    refresh: () => { calls.push(['refresh']) },
    calls,
    ...overrides,
  }
}

describe('renamePointList', () => {
  test('re-ids every matching entry, leaves the rest and the input untouched', () => {
    const input = [{ id: '2474a', y: 1 }, { id: '1464', y: 3 }]
    const out = renamePointList(input, '2474a', '2474A')
    expect(out).toEqual([{ id: '2474A', y: 1 }, { id: '1464', y: 3 }])
    expect(input[0].id).toBe('2474a')
  })
  test('identity when nothing matches; undefined input is safe', () => {
    expect(renamePointList([{ id: '1464' }], '2474a', '2474A')).toEqual([{ id: '1464' }])
    expect(renamePointList(undefined, 'a', 'A')).toEqual([])
  })
})

describe('renameWorkflowCopies', () => {
  test('renames csv-import.points and calculations-part1.adjusted_coordinates', () => {
    const copies = renameWorkflowCopies(
      { 'csv-import': { points: CSV_POINTS }, 'calculations-part1': { adjusted_coordinates: ADJUSTED } },
      [{ from: '2474a', to: '2474A' }, { from: '99a', to: '99A' }]
    )
    expect(copies).toHaveLength(2)
    expect(copies.find(c => c.step === 'csv-import')?.metadata.points[0].id).toBe('2474A')
    const calc = copies.find(c => c.step === 'calculations-part1')!
    expect(calc.metadata.adjusted_coordinates.map((p: any) => p.id)).toEqual(['2474A', '1464', '99A'])
  })
  test('omits a step that did not change', () => {
    const copies = renameWorkflowCopies(
      { 'csv-import': { points: CSV_POINTS } },
      [{ from: 'nonexistent', to: 'NOPE' }]
    )
    expect(copies).toEqual([])
  })
  test('emits only the keys that exist; empty step_data is safe', () => {
    expect(renameWorkflowCopies({}, [{ from: 'a', to: 'A' }])).toEqual([])
    expect(renameWorkflowCopies(undefined, [])).toEqual([])
  })
})

describe('executeRepair', () => {
  const beaconPlan = (renames = [{ id: 7, from: '2474a', to: '2474A' }]) => ({
    renames, collisions: [], after: [], // BeaconNamePlan shape
  })

  test('orders A1 → A2 → B and refreshes once', async () => {
    const d = deps()
    const parcelPlan = { writes: [{ parcelId: 101, designation: 'STAND 1', metadata: { cape_lo_points: [] } }], blocked: [], unchanged: [] }
    const outcome = await executeRepair(beaconPlan() as any, parcelPlan as any, d)
    expect((d as any).calls).toEqual([
      ['a1', [{ id: 7, from: '2474a', to: '2474A' }]],
      ['a2', [{ id: 7, from: '2474a', to: '2474A' }]],
      ['b', [101]],
      ['refresh'],
    ])
    expect(outcome.phase).toBe('complete')
    expect(outcome.a1Renamed).toBe(1)
  })

  test('an A1 failure stops the repair — no A2, no B, no refresh', async () => {
    const d = deps({ executeA1: async () => ({ ok: false, error: 'plan changed — re-run' }) })
    const outcome = await executeRepair(beaconPlan() as any, { writes: [{ parcelId: 101, designation: 'STAND 1', metadata: {} }], blocked: [], unchanged: [] } as any, d)
    expect(outcome.phase).toBe('a1-failed')
    expect((d as any).calls).toEqual([['a1', [{ id: 7, from: '2474a', to: '2474A' }]]])
    expect(outcome.error).toMatch(/re-run/i)
    expect(describeRepairResult(outcome)).toMatch(/nothing else was written/i)
  })

  test('no renames skips A1 and A2, still runs B', async () => {
    const d = deps()
    const outcome = await executeRepair(
      beaconPlan([]) as any,
      { writes: [{ parcelId: 101, designation: 'STAND 1', metadata: {} }], blocked: [], unchanged: [] } as any,
      d
    )
    expect((d as any).calls.filter(c => c[0].startsWith('a'))).toEqual([])
    expect(outcome.phase).toBe('complete')
  })

  test('a partial phase-B failure is reported loudly, not prevented', async () => {
    const d = deps({
      updateParcels: async writes => ({ written: ['STAND 1'], failed: [{ designation: 'STAND 2', message: 'Request failed with status code 500' }] }),
    })
    const outcome = await executeRepair(
      beaconPlan([]) as any,
      { writes: [
        { parcelId: 101, designation: 'STAND 1', metadata: {} },
        { parcelId: 102, designation: 'STAND 2', metadata: {} },
      ], blocked: [], unchanged: [] } as any,
      d
    )
    const text = describeRepairResult(outcome)
    expect(text).toMatch(/PARTIAL UPDATE/)
    expect(text).toMatch(/STAND 1/)
    expect(text).toMatch(/STAND 2 — Request failed with status code 500/)
    expect(text).toMatch(/Re-run/i)
  })
})

describe('propagateRename', () => {
  test('patches every parcel that lists the old name, metadata only (Resolved #3)', async () => {
    const rows = [
      { id: 101, designation: 'STAND 1', metadata: { cape_lo_points: [{ id: '2474a', y: 1, x: 2 }] } },
      { id: 102, designation: 'STAND 2', metadata: { cape_lo_points: [{ id: '1464', y: 9, x: 9 }] } },
    ]
    const updated: any[] = []
    const { written, failed } = await propagateRename(rows, '2474a', '2474A', {
      updateParcel: async (parcelId, patch) => { updated.push([parcelId, patch]) },
    })
    expect(written).toEqual(['STAND 1'])
    expect(failed).toEqual([])
    expect(updated[0][0]).toBe(101)
    expect(updated[0][1].metadata.cape_lo_points[0].id).toBe('2474A')
    expect(updated[0][1].metadata.cape_lo_points[0].y).toBe(1)
  })

  test('a parcel whose edges do not match its ring is reported as blocked, not silently skipped', async () => {
    const rows = [
      { id: 101, designation: 'STAND 1', metadata: { cape_lo_points: [{ id: '2474a', y: 1, x: 2 }], residuals: { edges: [{ from: { id: 'X', y: 9, x: 9 }, to: { id: 'Y', y: 8, x: 8 } }] } } },
    ]
    const { written, failed } = await propagateRename(rows, '2474a', '2474A', {
      updateParcel: async () => { throw new Error('should not be called') },
    })
    expect(written).toEqual([])
    expect(failed).toEqual([{ designation: 'STAND 1', message: 'blocked — consistency data does not match its vertex list — recompute this parcel first' }])
  })
})
```

- [ ] **Step 3: Implement `beaconRepairFlow.ts`**

Create `app-frontend/src/views/modules/cadastral-standard/beaconRepairFlow.ts`:

```ts
import {
  planRenamePropagation,
  type BeaconNamePlan,
  type ReconciliationPlan,
} from './beaconReconcile'
import type { CascadeOutcome } from './vertexSnap'

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
  for (const { from, to } of renames || []) {
    const csvPoints = stepData?.['csv-import']?.points
    if (Array.isArray(csvPoints)) {
      const next = renamePointList(csvPoints, from, to)
      if (next !== csvPoints) out.push({ step: 'csv-import', metadata: { points: next } })
    }
    const adjusted = stepData?.['calculations-part1']?.adjusted_coordinates
    if (Array.isArray(adjusted)) {
      const next = renamePointList(adjusted, from, to)
      if (next !== adjusted) out.push({ step: 'calculations-part1', metadata: { adjusted_coordinates: next } })
    }
  }
  return out
}

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
  const blocked = (parcelPlan?.blocked ?? []).map(p => ({ designation: p.designation, detail: p.detail }))
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

/** Going-forward single-rename propagation (Resolved #3). Task 5 wires the callers. */
export async function propagateRename(
  parcelRows: any[],
  from: string,
  to: string,
  deps: { updateParcel(parcelId: number, patch: { metadata: Record<string, any> }): Promise<void> }
): Promise<{ written: string[]; failed: Array<{ designation: string; message: string }> }> {
  const plan = planRenamePropagation(parcelRows, from, to)
  const written: string[] = []
  const failed: Array<{ designation: string; message: string }> = []

  // A blocked parcel (vertex list unreadable, or edges not matching the ring) is
  // NOT silently skipped — its staleness stays for the 🔧 button, and the caller is
  // told instead of the rename appearing to have converged everywhere.
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
```

with `import { describeCascadeOutcome, type CascadeOutcome } from './vertexSnap'` at the top of `beaconRepairFlow.ts` (static ES imports throughout — no `require`).

- [ ] **Step 4: Rewire the 🔧 button in `MapLibreAreaView.vue`**

Imports (`:945-949` already import `describeCascadeOutcome` / `type CascadeOutcome` from `./vertexSnap`; add):

```ts
import { planNameNormalization } from '../../../../app-shared/beaconName';
import { planReconciliation, summarise, formatSummary, RECONCILE_TOLERANCE_M } from './beaconReconcile';
import { executeRepair, propagateRename, describeRepairResult } from './beaconRepairFlow';
```

(`app-shared` import path from this view resolves to `../../../../app-shared/beaconName`.)

Replace the entire body of `repairParcelBeaconNames` (`:1651-1753`) keeping the name, the `:1658` `isRecomputing` guard, the `:1667-1674` empty-project exits, and the fresh `listLandParcels`/`listCoordinatePoints` fetch (`:1662-1665`):

```ts
async function repairParcelBeaconNames() {
  const projectId = workflowState?.projectInfo?.projectId;
  if (!projectId) { alert('No project loaded. Please select a project first.'); return; }

  isRecomputing.value = true;
  try {
    const [dbParcels, dbPoints] = await Promise.all([
      listLandParcels(Number(projectId)),
      listCoordinatePoints(Number(projectId))
    ]);
    if (dbParcels.length === 0) { alert('No saved parcels found in the database for this project.'); return; }
    if (dbPoints.length === 0) { alert('No coordinate points found in the database. Cannot re-match beacon names.'); return; }

    const beaconPlan = planNameNormalization(dbPoints.map(p => ({ id: p.id ?? p.name, name: p.name })));
    // Parcels match against the names that WILL exist once A1 has run (spec Part 2).
    const parcelPlan = planReconciliation(dbParcels, beaconPlan.after, RECONCILE_TOLERANCE_M);
    const summary = summarise(beaconPlan, parcelPlan);

    if (!summary.hasWork) {
      alert('No beacon name changes needed — every parcel already matches its nearest coordinate point.');
      return;
    }
    await showRepairConfirm(summary, formatSummary(summary)); // reject → return, nothing written

    const outcome = await executeRepair(beaconPlan, parcelPlan, {
      executeA1: async renames => {
        try {
          const r = await api.post('/coordinate-points/normalize-names', { project_id: String(projectId), renames });
          return { ok: true, renamed: r.data?.data?.renamed ?? renames.length };
        } catch (e: any) {
          return { ok: false, error: e?.response?.data?.error || e?.message || String(e) };
        }
      },
      executeA2: async renames => {
        // Fresh copy: operate on the persisted shapes, not the possibly-stale
        // in-memory workflowState.
        const loaded = (await api.get(`/survey-projects/${projectId}/workflow`)).data?.workflow_state;
        const copies = renameWorkflowCopies(loaded?.step_data ?? {}, renames);
        const failed: Array<{ step: string; error: string }> = [];
        for (const copy of copies) {
          try {
            await api.patch(`/survey-projects/${projectId}/workflow`, {
              step: copy.step, action: 'update', metadata: copy.metadata
            });
          } catch (e: any) {
            failed.push({ step: copy.step, error: e?.response?.data?.error || e?.message || String(e) });
          }
        }
        if (failed.length === 0) {
          // In-memory copies (never persisted — rebuilt from importedPoints).
          for (const { from, to } of renames) {
            workflowState.importedPoints = renamePointList(workflowState.importedPoints, from, to);
            workflowState.adjustedCoordinates = renamePointList(workflowState.adjustedCoordinates, from, to);
          }
          workflowState.documents.coordinateList = undefined; // rebuilt on next generate (useCadastralWorkflow :94-119)
        }
        return { ok: failed.length === 0, failed };
      },
      updateParcels: async writes => {
        const outcome: CascadeOutcome = { written: [], failed: [] };
        for (const w of writes) {
          try {
            await updateLandParcel(w.parcelId, { metadata: w.metadata });
            outcome.written.push(String(w.parcelId));
          } catch (e: any) {
            const designation = parcelPlan.writes.find(pw => pw.parcelId === w.parcelId)?.designation ?? String(w.parcelId);
            outcome.failed.push({ designation, message: e?.response?.data?.error || e?.message || String(e) });
          }
        }
        return outcome;
      },
      refresh: () => { refreshParcelsFromDatabase(); },
    });

    alert(describeRepairResult(outcome));
    console.log('[RepairBeacons]', describeRepairResult(outcome));
  } catch (e: any) {
    console.error('[RepairBeacons] ❌ Error:', e);
    alert(`Repair failed: ${e?.message || 'Unknown error'}`);
  } finally {
    isRecomputing.value = false;
  }
}
```

Delete the old in-memory cache sync (`:1722-1731`): `refreshParcelsFromDatabase` replaces it, and it keyed `savedParcels` by `stand || designation` (`:1691`) against the loader's `designation || stand` (`:4416`) — that mismatch is exactly why the spec says it is deleted (Part 2, `:451-454`).

**The new confirm modal** follows the resolve/reject pattern of `showAffectedParcelsConfirm` (`:1312-1321`) but for a multi-rename plan. Add a ref near the other modal refs:

```ts
const repairConfirm = ref<{
  summary: string;
  sections: Array<{ heading: string; lines: string[] }>;
  resolve: () => void;
  reject: (reason: Error) => void;
} | null>(null);

async function showRepairConfirm(summary: any, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    repairConfirm.value = { summary: text, sections: summary.sections, resolve, reject };
  });
}
function resolveRepairConfirm() {
  const m = repairConfirm.value;
  repairConfirm.value = null;
  m?.resolve();
}
function rejectRepairConfirm() {
  const m = repairConfirm.value;
  repairConfirm.value = null;
  m?.reject(new Error('cancelled'));
}
```

Template, next to the affected-parcels modal (after `:897`), with the same Teleport/Transition pattern (`:853-897`) but a scrollable list:

```html
    <Teleport to="body">
    <Transition name="map-rename-modal">
      <div v-if="repairConfirm" class="fixed inset-0 flex items-center justify-center"
        style="z-index: 999999;" tabindex="-1"
        @click.self="rejectRepairConfirm" @keydown.escape="rejectRepairConfirm">
        <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
        <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
          <div class="px-5 py-4 bg-teal-600">
            <h3 class="text-white font-semibold text-base">🔧 Repair Beacon Names</h3>
            <p class="text-teal-200 text-xs mt-0.5">Preview — nothing is written until you proceed</p>
          </div>
          <div class="px-5 py-3 max-h-80 overflow-y-auto bg-gray-50 text-xs text-gray-700 font-mono">
            <template v-for="(section, si) in repairConfirm.sections" :key="si">
              <p class="font-bold text-gray-900 mt-2 first:mt-0">{{ section.heading }}</p>
              <p v-for="(line, li) in section.lines" :key="li" class="whitespace-pre-wrap">{{ line }}</p>
            </template>
          </div>
          <div class="px-5 py-3 text-xs text-gray-600 bg-teal-50 border-t border-teal-100">
            Proceeding will normalise beacon names, update every workflow copy, and
            patch each affected parcel's stored names (metadata only — no recompute,
            no geometry change).
          </div>
          <div class="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
            <button @click="rejectRepairConfirm"
              class="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            <button @click="resolveRepairConfirm"
              class="px-4 py-2 text-sm text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors">Proceed</button>
          </div>
        </div>
      </div>
    </Transition>
    </Teleport>
```

`summarise(beaconPlan, parcelPlan)` from Task 2 already groups into `sections` (`heading` + `lines`) with the confirmable content: beacon case renames, collisions (read-only), parcel renames with distances, and blocked parcels.

- [ ] **Step 5: Verify**

```bash
cd app-frontend && npm test
```

Expected: baseline + `beaconRepairFlow.test.ts` + existing `beaconReconcile.test.ts` / `vertexCascade.test.ts` green. `describeCascadeOutcome` keeps its old default wording, so **`vertexCascade.test.ts` is unchanged and stays green**.

Build (compiles the `.vue` changes but does not type-check them — the browser checklist below is the type test):

```bash
cd app-frontend && npm run build
```

Expected: BUILD SUCCESSFUL.

**Manual browser checklist (mandatory, Task 4):** on a project whose parcels were digitized before a beacon rename:

1. Generate the Area/Consistency PDF and note a stale From/To pair (e.g. a parcel listing `2474a` while `coordinate_points` holds `2474A`).
2. Click **🔧 Repair Beacon Names** → the confirm modal lists the beacon case renames, any collisions, and the parcel renames with distances. **Cancel** → reload the page → nothing changed (parcel still shows the old name).
3. Re-run and **Proceed** → the outcome dialog reports `Normalised N beacon name(s)` and the updated parcels. No failure dialog.
4. Regenerate the same PDF → the stale From/To names are current, and every area, distance, direction and dy/dx is identical to step 1.
5. Coordinate list, field book, plan PDF/DXF and diagram all show `2474A`.
6. Break phase B on purpose (stop the backend, or rename a parcel to a foreign stand in the DB between planning and proceed) → the outcome dialog is the **PARTIAL UPDATE** wording naming which parcels wrote and which did not; a re-run completes cleanly.
7. Reload the page → the repair persists (names and parcels were written to the DB; the workflow copies restored from `step_data` show the new names).

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/vertexSnap.ts app-frontend/src/views/modules/cadastral-standard/beaconRepairFlow.ts app-frontend/src/views/modules/cadastral-standard/__tests__/beaconRepairFlow.test.ts app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "feat(beacon-names): orchestrate the backfill repair and rewire the repair button"
```