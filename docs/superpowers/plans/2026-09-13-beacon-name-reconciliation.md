# Beacon Name Reconciliation & Suffix Capitalisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every parcel's saved area/consistency data carry the beacon names that are current in `coordinate_points` (matched by position, not by name), and make a numeric-prefix beacon name's all-lowercase suffix uppercase everywhere by normalising it at every write door.

**Architecture:** The name rule lives in exactly one place, `app-shared/beaconName.js`, imported by both the backend (write doors, label derivation) and the frontend (entry points). Reconciliation is a pure planner, `beaconReconcile.ts`, that derives each vertex's name from its own position against one beacon table and patches names in place without touching a number or `geom`. A thin injected-dependency orchestrator, `beaconRepairFlow.ts`, runs the phases (A1 normalise beacon names in one transaction → A2 workflow copies → B parcel metadata) and the going-forward rename propagation, so the ordering and failure reporting are unit-tested even though the button lives in a `.vue`.

**Tech Stack:** Vue 3 + TypeScript, Vitest (frontend); Fastify 5 + Jest ESM (backend); plain ESM JS in `app-shared`; axios.

**Spec:** `docs/superpowers/specs/2026-09-12-beacon-name-reconciliation-design.md`

## Global Constraints

- **Base branch: `feat/vertex-drag-snap` @ `8d36203`. It is NOT merged to `main`** (checked 2026-09-13: `git merge-base --is-ancestor feat/vertex-drag-snap main` → false). This work reuses `CascadeOutcome`, `describeCascadeOutcome` and `readVertex` from `vertexSnap.ts`, none of which exist on `main` (spec decision 10). `feat/beacon-name-reconciliation` currently sits on `main` @ `94e1b82` with only docs commits, and `94e1b82` is an ancestor of `feat/vertex-drag-snap`, so **before Task 1** run `git rebase feat/vertex-drag-snap` on this branch (docs-only commits; no conflicts expected). Then `git log --oneline -3 feat/vertex-drag-snap..HEAD` must show only this branch's docs commits. Every bare `:NNNN` citation below means `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` **on that base**; `main`'s copy is 664 lines shorter. `feat/vertex-drag-snap` must merge before this branch does.
- **Never push to `origin/main`** — that remote is an unrelated project. Local `main` tracks `origin/nov-alpha`; push only with `git push origin HEAD:nov-alpha`, and only if asked.
- Frontend tests: `cd app-frontend && npx vitest run` (Vitest, `globals: true`, `environment: 'node'`, alias `@` → `./src`). **Record the baseline on the rebased branch before Task 1** (files / tests / failures). Every task leaves the count growing and failures unchanged.
- Backend tests: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>`. **Bare `npx jest` fails** (ESM). Jest matches `**/__tests__/**/*.test.js` only. Record the backend baseline before Task 1 too.
- **Backend tests must never import `app-backend/src/config/db.js`, directly or through a model.** It opens a real pool at import and calls `process.exit(1)` when the connection fails (`config/db.js:18-23`). That is why the testable door logic in Task 3 lives in `utils/beaconNameDoors.js`, which takes the db connection as a parameter and imports nothing db-related.
- **Every task runs the FULL suite of each side it touched before committing**, not just its own file.
- **No `@vue/test-utils` and no `vue-tsc`.** Never write a component-mounting test. `npm run build` compiles `.vue` but does not type-check it. Tasks 4, 5 and 6 touch `.vue` files and each carries a **mandatory manual browser checklist** that is part of the task, not optional.
- **The rule** (spec decision 12, settled): a name matching `^(\d+)([A-Za-z]+)$` whose suffix is **all lowercase** has its suffix uppercased (`2474a` → `2474A`, `15b` → `15B`, `1464an` → `1464AN`). Everything else passes through byte for byte: `1464An`, `2474A`, `A`, `SD4`, `TSM5025`, `2474A1`, `1425`, `''`. Idempotent, total, never throws.
- **`1464An` is a deliberate naming form and is never touched** (Resolved #1). Any code that uppercases a suffix unconditionally is a bug.
- **Reconciliation matches by position, never by name.** Tolerance **0.5 m** (`RECONCILE_TOLERANCE_M`); coincidence guards **1 mm**. Strictly nearest; **a second beacon within 0.5 m makes the vertex ambiguous and blocks its parcel — there is no pick-one dialog** (Resolved #2). Two vertices resolving to one beacon block the parcel.
- **The repair never re-runs `areaCompute` and never sends `geom`** (decisions 3, 4). It is `updateLandParcel(id, { metadata })` only. A patched parcel's metadata differs from its input **only in name strings** — asserted by test.
- **`description` is rewritten only when it equalled the old id** (decision 8, the rule at `:1615`).
- **Manual trigger only** (decision 1). The 🔧 **Repair Beacon Names** button (`:41-49`) stays the sole entry point for retroactive repair. The loader's in-memory re-derivation (`:4255`) is unchanged.
- **Renames auto-propagate to saved parcel metadata going forward** (Resolved #3): after `handlePointRename` and `CoordinateListView.commitRename`, every parcel listing the exact old name gets it patched — metadata-only, no recompute, no `geom`.
- **Partial multi-parcel write failures are reported loudly, not prevented** (Resolved #4). No transactional batch-update endpoint for parcels. A blocking dialog names what was written and what was not. Do not degrade this to a console warning and do not re-open the batch-endpoint question.
- **Case-fold duplicates in one payload (`99a` + `99A`) are a 400 naming the pair, never a merge** (decision 15). Exact duplicates keep today's behaviour (averaged / skipped).
- **Existing data is backfilled per project by the same button, not by a migration** (decision 13). **No migration in this plan.** Measured 2026-09-12: two schemas are substantially affected (`surveyor_surveyor_chitsikef` 1,733 of 6,374; `surveyor_surveyor_mapamulart` 268 of 268), and **no case-fold collision exists in any schema** — the collision path is a safety net.
- **Full-name display sites (~30 print + ~20 template) are NOT touched** (decision 17). An un-backfilled project keeps printing its stored case until the button is run.
- Out of scope, do not touch: `topologyBuilder.extractBeaconSuffix` (#9), `automatedParcelDetector.ts` (#10), `beaconNameMatch.ts` (#11), `AreaComputationView.vue`, the Outside Figure on-load auto-update (`:4428-4498`), `project_control_points`, `public.zim_control_points`, consolidating the five spatial matchers.
- Both servers are assumed running for manual verification: backend `http://127.0.0.1:3050`, frontend `http://localhost:5173`.

## Deviations from the spec

Eight, each deliberate. Everything else in the spec stands as written.

1. **`app-shared/beaconName.js` gains a fifth export, `labelParts(name)`** = `splitBeaconName(normalizeBeaconName(name))`. Every suffix-derivation site in Part 4 needs exactly that composition; exporting it once (and testing it) stops six sites from each re-deriving it. It adds no second regex.
2. **Backend door logic lives in a new db-free `app-backend/src/utils/beaconNameDoors.js`**, and `models/coordinatePoint.js`, `routes/coordinatePoints.js` and `routes/csvImports.js` delegate to it. The spec places the changes in those files directly, but none of them can be imported by a test: the model imports `config/db.js`, which connects and `process.exit(1)`s at import. The rename route's SQL moves into `renameByName(db, …)` in that util for the same reason; the route keeps its 409/404 responses byte for byte.
3. **`batchCreate`'s route returns the error's `statusCode`** (400 for a case-fold pair) instead of its blanket 500 (`routes/coordinatePoints.js:112`). Without it decision 15's 400 is unreachable.
4. **The planner patches every snapshot at a matched vertex, not only vertices whose ring name is stale.** The spec's `matchVertex` reports `unchanged` when the ring name matches, but the reported symptom is precisely a parcel whose `cape_lo_points` were renamed by the old `handlePointRename` (`:1606-1635`) while `residuals.edges` kept the old name. `planParcel` therefore patches all matched indices, writes only when the patched metadata actually differs, and upgrades an `unchanged` vertex to a `rename` outcome (naming the stale snapshot string) when any of its snapshots disagreed. `unchanged` outcomes carry `distanceM` so that upgrade can report it.
5. **`VertexRename` carries the vertex's `y`/`x`**, and `matchVertex` takes the ring index as an optional fourth argument. `patchParcelMetadata` needs the position to rename only the Outside Figure `points[]` entries that coincide (1 mm) with the renamed vertex; the spec's three-argument signature has no position to test.
6. **A sixth block reason, `'unreadable-vertex'`**, for a parcel with no readable vertex list or a vertex with no name/unusable coordinates. Folding it into `'too-few-points'` would tell the surveyor the wrong thing.
7. **The phase orchestration is extracted into `beaconRepairFlow.ts` with injected dependencies** (`executeRepair`, `propagateRename`, `describeRepairResult`, plus the pure A2 helpers `renamePointList` / `renameWorkflowCopies`). The spec draws the flow inside the view; extracting it is this repo's convention and makes the load-bearing A1 → A2 → B ordering and the stop-on-A1-failure rule testable.
8. **A2 is one PATCH per workflow step that changed (at most three), not "one PATCH".** `PATCH /survey-projects/:id/workflow` takes a single `step` (`routes/survey-projects.js:372-434`). The spec left the location of `importedPoints` open; it is **`step_data['csv-import'].points`** (legacy key `import_csv`), restored at `useCadastralWorkflow.ts:333-376`. `adjusted_coordinates` is `step_data['calculations-part1']` (`:1574-1583`). `documents.coordinateList.points` is in-memory only (rebuilt at `useCadastralWorkflow.ts:94`) and is updated in memory, not persisted.

## File Structure

| File | Responsibility |
|---|---|
| `app-shared/beaconName.js` *(new)* | The name rule, the splitter, case-fold detection, the beacon rename plan. Pure ESM JS |
| `app-backend/src/services/__tests__/beaconName-shared.test.js` *(new)* | Jest coverage of the shared module |
| `app-backend/src/utils/beaconNameDoors.js` *(new)* | Db-free door logic: case-fold assertion, batch/merge name normalisation, `renameByName`, `applyNameNormalization` (one transaction) |
| `app-backend/src/utils/__tests__/beaconNameDoors.test.js` *(new)* | Fake-db tests of the doors |
| `app-backend/src/models/coordinatePoint.js` *(modify)* | `create`/`update`/`batchCreate` normalise via the doors |
| `app-backend/src/routes/coordinatePoints.js` *(modify)* | Rename via `renameByName`; batch error status; new `POST /coordinate-points/normalize-names` |
| `app-backend/src/routes/csvImports.js` *(modify)* | analyze-merge and execute-merge normalise names; case-fold → 400 |
| `app-frontend/src/views/modules/cadastral-standard/beaconReconcile.ts` *(new)* | The pure planner: match, ring read, guards, patch, plan, summary, rename-propagation plan |
| `app-frontend/src/views/modules/cadastral-standard/__tests__/beaconReconcile.test.ts` *(new)* | Planner coverage incl. the names-only invariant |
| `app-frontend/src/views/modules/cadastral-standard/beaconRepairFlow.ts` *(new)* | Injected-deps orchestration (phases A1/A2/B, propagation), A2 helpers, outcome wording |
| `app-frontend/src/views/modules/cadastral-standard/__tests__/beaconRepairFlow.test.ts` *(new)* | Ordering, stop-on-A1, loud partial failure, propagation |
| `app-frontend/src/views/modules/cadastral-standard/vertexSnap.ts` *(modify)* | Export `readVertex`; generalise `describeCascadeOutcome` wording |
| `app-frontend/src/utils/cadastral-csv.ts` *(modify)* | Normalise parsed names; reject a case-fold pair in the file |
| `app-frontend/src/services/spatial.ts` *(modify)* | `normalizeCoordinatePointNames` |
| `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` *(modify)* | Entry-point normalisation, rename propagation, rewired 🔧 button + confirm modal, site #6 |
| `app-frontend/src/views/modules/cadastral-standard/CoordinateListView.vue` *(modify)* | Normalise rename, normalised duplicate check, propagation |
| `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` *(modify)* | Sites #1, #2 |
| `app-backend/src/services/dxfGenerator.js` *(modify)* | Site #3, extracted as `fallbackBeaconLabel` |
| `app-backend/src/services/pdfkitGeoPDF.js` *(modify)* | Site #4; delete dead #5 |
| `app-backend/src/routes/surveyPlanPreview.js` *(modify)* | Site #7 |
| `app-shared/block-definitions.js` *(modify)* | Delete dead #8 |

Line numbers are as of `feat/vertex-drag-snap` @ `8d36203` (for `MapLibreAreaView.vue`) and as cited in the spec for everything else. Anchor on the function or quoted text, not the number — earlier tasks shift them.

---

### Task 1: `app-shared/beaconName.js` — the rule, in one place

**Files:**
- Create: `app-shared/beaconName.js`
- Test: `app-backend/src/services/__tests__/beaconName-shared.test.js`

**Interfaces:**
- Consumes: nothing. The module imports nothing.
- Produces (every later task depends on these exact names):
  - `splitBeaconName(name: unknown): { prefix: string; suffix: string } | null`
  - `normalizeBeaconName<T>(name: T): T` — returns non-strings unchanged
  - `labelParts(name: unknown): { prefix: string; suffix: string } | null` — the split of the normalised name
  - `findCaseFoldDuplicates(names: unknown[]): string[][]` — groups of ≥2 distinct raw names sharing one normalised form, first-seen order
  - `planNameNormalization(rows: Array<{ id, name, ... }>): { renames: Array<{ id, from, to }>; collisions: Array<{ from, existing }>; after: rows }`

- [ ] **Step 0: Rebase and record baselines** (once, before any code)

```bash
git rebase feat/vertex-drag-snap
git log --oneline -4 feat/vertex-drag-snap..HEAD
cd app-frontend && npx vitest run
cd ../app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js
```

Expected: the log lists only `docs(...)` commits for this spec/plan. Write the two baseline totals (files, tests, failures) into your task notes; every later "full suite" step compares against them. Any backend failure here is pre-existing — note its name so it is not later blamed on this branch.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/__tests__/beaconName-shared.test.js`:

```js
/**
 * app-shared/beaconName.js — the single source of the beacon name rule.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js beaconName-shared
 */
import { describe, test, expect } from '@jest/globals'
import {
  splitBeaconName,
  normalizeBeaconName,
  labelParts,
  findCaseFoldDuplicates,
  planNameNormalization,
} from '../../../../app-shared/beaconName.js'

describe('splitBeaconName', () => {
  test('splits a numeric prefix from an alphabetic suffix, verbatim', () => {
    expect(splitBeaconName('2474a')).toEqual({ prefix: '2474', suffix: 'a' })
    expect(splitBeaconName('1464An')).toEqual({ prefix: '1464', suffix: 'An' })
    expect(splitBeaconName('2474AB')).toEqual({ prefix: '2474', suffix: 'AB' })
  })

  test('returns null for anything that is not digits-then-letters', () => {
    for (const name of ['SD4', 'TSM5025', 'A', '1425', '2474A1', '', ' 2474a', '2474a ']) {
      expect(splitBeaconName(name)).toBeNull()
    }
  })

  test('returns null for non-strings without throwing', () => {
    for (const name of [null, undefined, 42, {}, []]) {
      expect(splitBeaconName(name)).toBeNull()
    }
  })
})

describe('normalizeBeaconName', () => {
  test('uppercases an ALL-lowercase suffix', () => {
    expect(normalizeBeaconName('2474a')).toBe('2474A')
    expect(normalizeBeaconName('15b')).toBe('15B')
    expect(normalizeBeaconName('1464an')).toBe('1464AN')
  })

  test('passes everything else through byte for byte', () => {
    // 1464An is a deliberate naming form (spec Resolved #1) — never touched.
    for (const name of ['1464An', '2474A', 'A', 'SD4', 'TSM5025', '2474A1', '1425', '']) {
      expect(normalizeBeaconName(name)).toBe(name)
    }
  })

  test('does not trim — callers trim where they already do', () => {
    expect(normalizeBeaconName(' 2474a')).toBe(' 2474a')
  })

  test('is idempotent', () => {
    for (const name of ['2474a', '15b', '1464an', '1464An', 'SD4', '']) {
      const once = normalizeBeaconName(name)
      expect(normalizeBeaconName(once)).toBe(once)
    }
  })

  test('returns non-string input unchanged and never throws', () => {
    expect(normalizeBeaconName(null)).toBeNull()
    expect(normalizeBeaconName(undefined)).toBeUndefined()
    expect(normalizeBeaconName(42)).toBe(42)
  })
})

describe('labelParts', () => {
  test('splits the NORMALISED name', () => {
    expect(labelParts('2474a')).toEqual({ prefix: '2474', suffix: 'A' })
    expect(labelParts('2474A')).toEqual({ prefix: '2474', suffix: 'A' })
    expect(labelParts('2474AB')).toEqual({ prefix: '2474', suffix: 'AB' })
  })

  test('keeps a mixed-case suffix as written', () => {
    expect(labelParts('1464An')).toEqual({ prefix: '1464', suffix: 'An' })
  })

  test('is null for a control beacon', () => {
    expect(labelParts('SD4')).toBeNull()
    expect(labelParts(undefined)).toBeNull()
  })
})

describe('findCaseFoldDuplicates', () => {
  test('reports two raw names that normalise to one', () => {
    expect(findCaseFoldDuplicates(['99a', '12', '99A'])).toEqual([['99a', '99A']])
  })

  test('does not report exact duplicates — those keep today\'s averaging', () => {
    expect(findCaseFoldDuplicates(['15b', '15b', '15B'])).toEqual([['15b', '15B']])
    expect(findCaseFoldDuplicates(['15b', '15b'])).toEqual([])
  })

  test('does not group a mixed-case suffix with its uppercase form', () => {
    // 1464An does not normalise, so it is a different name from 1464AN.
    expect(findCaseFoldDuplicates(['1464An', '1464AN'])).toEqual([])
    expect(findCaseFoldDuplicates(['1464an', '1464AN'])).toEqual([['1464an', '1464AN']])
  })

  test('reports every group and tolerates junk', () => {
    expect(findCaseFoldDuplicates(['1a', null, '1A', 7, '2b', '2B'])).toEqual([['1a', '1A'], ['2b', '2B']])
    expect(findCaseFoldDuplicates(null)).toEqual([])
  })
})

describe('planNameNormalization', () => {
  const rows = [
    { id: 1, name: '2474a', y: 10, x: 20 },
    { id: 2, name: '2475b', y: 30, x: 40 },
    { id: 3, name: '2475B', y: 31, x: 41 },
    { id: 4, name: '1464An', y: 50, x: 60 },
    { id: 5, name: 'SD4', y: 70, x: 80 },
  ]

  test('plans a rename for each lowercase suffix whose target is free', () => {
    expect(planNameNormalization(rows).renames).toEqual([{ id: 1, from: '2474a', to: '2474A' }])
  })

  test('puts a rename whose target already exists in collisions, never in renames', () => {
    expect(planNameNormalization(rows).collisions).toEqual([{ from: '2475b', existing: '2475B' }])
  })

  test('returns the row list with the renames applied, every other field intact', () => {
    const { after } = planNameNormalization(rows)
    expect(after.map(r => r.name)).toEqual(['2474A', '2475b', '2475B', '1464An', 'SD4'])
    expect(after[0]).toEqual({ id: 1, name: '2474A', y: 10, x: 20 })
  })

  test('does not mutate its input', () => {
    const before = JSON.stringify(rows)
    planNameNormalization(rows)
    expect(JSON.stringify(rows)).toBe(before)
  })

  test('plans nothing for clean or empty input', () => {
    expect(planNameNormalization([{ id: 9, name: '2474A' }])).toEqual({
      renames: [], collisions: [], after: [{ id: 9, name: '2474A' }],
    })
    expect(planNameNormalization(null)).toEqual({ renames: [], collisions: [], after: [] })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js beaconName-shared`
Expected: FAIL — `Cannot find module '../../../../app-shared/beaconName.js'`.

- [ ] **Step 3: Write the implementation**

Create `app-shared/beaconName.js`:

```js
/**
 * The beacon name rule — the ONLY place it exists.
 *
 * A name with a numeric prefix and an alphabetic suffix has its suffix uppercased
 * when, and only when, the suffix is ALL lowercase: 2474a → 2474A, 15b → 15B.
 * Everything else passes through byte for byte: a mixed-case suffix (1464An is a
 * deliberate naming form, confirmed with the surveyor 2026-09-12), an uppercase
 * suffix, a letter-only name (SD4, TSM5025), a trailing digit (2474A1).
 *
 * Applied at every WRITE door (backend, defensively) and every ENTRY point
 * (frontend, so the typed string equals the stored string) — never at display
 * sites. See docs/superpowers/specs/2026-09-12-beacon-name-reconciliation-design.md
 * decisions 11, 12 and 14.
 */

const NUMERIC_SUFFIX = /^(\d+)([A-Za-z]+)$/

/** '2474a' → { prefix: '2474', suffix: 'a' }; 'SD4' → null. Verbatim, no casing. */
export function splitBeaconName(name) {
  if (typeof name !== 'string') return null
  const match = NUMERIC_SUFFIX.exec(name)
  return match ? { prefix: match[1], suffix: match[2] } : null
}

/** Decision 12. Total, idempotent, never throws; non-strings are returned unchanged. */
export function normalizeBeaconName(name) {
  const parts = splitBeaconName(name)
  if (!parts || parts.suffix !== parts.suffix.toLowerCase()) return name
  return parts.prefix + parts.suffix.toUpperCase()
}

/**
 * The split every label-derivation site needs: prefix to find the stand, suffix to
 * print. Splitting the NORMALISED name means 2474a prints A while 1464An prints An.
 */
export function labelParts(name) {
  return splitBeaconName(normalizeBeaconName(name))
}

/**
 * Groups of two or more DISTINCT raw names that normalise to one stored name,
 * e.g. [['99a', '99A']]. Exact repeats are not reported (decision 15: they keep
 * today's averaging behaviour). Non-strings are ignored.
 */
export function findCaseFoldDuplicates(names) {
  const groups = new Map()
  for (const raw of Array.isArray(names) ? names : []) {
    if (typeof raw !== 'string') continue
    const key = normalizeBeaconName(raw)
    const group = groups.get(key) ?? []
    if (!group.includes(raw)) group.push(raw)
    groups.set(key, group)
  }
  return Array.from(groups.values()).filter(group => group.length > 1)
}

/**
 * The backfill's beacon half, for one project's coordinate_points rows.
 *
 * A rename whose target name already exists is a COLLISION: it is reported and
 * never applied (decision 15). `after` is the row list with the renames applied —
 * what parcel reconciliation must match against, so parcels are named with the
 * names that will exist once phase A1 has run.
 */
export function planNameNormalization(rows) {
  const list = Array.isArray(rows) ? rows : []
  const existing = new Set(list.map(row => row?.name).filter(name => typeof name === 'string'))
  const renames = []
  const collisions = []
  const renamed = new Map()

  for (const row of list) {
    const from = row?.name
    if (typeof from !== 'string') continue
    const to = normalizeBeaconName(from)
    if (to === from) continue
    if (existing.has(to)) {
      collisions.push({ from, existing: to })
      continue
    }
    renames.push({ id: row.id, from, to })
    renamed.set(row, to)
  }

  const after = list.map(row => (renamed.has(row) ? { ...row, name: renamed.get(row) } : row))
  return { renames, collisions, after }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js beaconName-shared`
Expected: PASS.

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js`
Expected: baseline + the new tests, no new failures.

- [ ] **Step 5: Commit**

```bash
git add app-shared/beaconName.js app-backend/src/services/__tests__/beaconName-shared.test.js
git commit -m "feat(beacon-names): add the shared beacon name rule, splitter and rename planner"
```

---
