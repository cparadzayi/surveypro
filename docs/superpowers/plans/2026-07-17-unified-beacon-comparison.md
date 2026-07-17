# Unified Beacon Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cadastral Found Beacons step run the same Section 67(5) Helmert + W-test comparison engine and single CSV format as the lite Compare tool, by embedding the Compare surface and adapting its result into the existing Report on Survey data.

**Architecture:** Extract the Compare CSV parser to a shared util; give `CompareView` an `embedded` mode (no `ModuleScaffold` chrome); rewrite `FoundBeaconsView` as a thin workflow host that renders `<CompareView embedded/>`, reads the shared `surveyAdjustmentStore`, and uses a new pure adapter to emit the existing `{ beacons, comparisonConfig }` save payload and persist historical points to the DB. The Helmert/W-test math and the parent's `handleFoundBeaconsSave` are untouched.

**Tech Stack:** Vue 3 SFC + `<script setup>`, Pinia (`surveyAdjustmentStore`), TypeScript, vitest (pure-function tests only — no `@vue/test-utils` in this repo).

## Global Constraints

- **Single CSV format everywhere:** `Beacon,Hist_Y,Hist_X,Survey_Y,Survey_X` where **Y = Westing, X = Southing** (Cape Lo). Header line optional; ≥ 3 data rows required.
- **Canonical engine:** `stores/surveyAdjustmentStore.js` (`compute()` → `iterativeAdjust`, Sec 67(5) Helmert + iterative W-test). **No changes to the math** (`utils/surveyMath.js`, `utils/si727.js`).
- **Preserve the parent emit contract:** `FoundBeaconsView` emits `save` with `{ beacons: FoundBeacon[]; comparisonConfig: BeaconComparisonConfig }`. `CadastralStandardView.handleFoundBeaconsSave` is **not modified**.
- **Preserve the Report on Survey contract:** the report reads `beacons[].beaconId`, `beacons[].originalData.coordinates.{y,x}`, `beacons[].currentCoordinates.{y,x}`, `beacons[].discrepancy.distance`, and `beaconComparison.{method,currentSRNumber,toleranceThreshold,conclusion}`. The adapter must produce exactly these.
- **Keep DB persistence:** still call `importHistoricalSurveyPoints(projectId, rows, fileName)` with the historical pair (`{Point:name, Y:Hist_Y, X:Hist_X}`).
- **Singleton store hygiene:** `FoundBeaconsView` resets the shared store on mount (from `existingBeacons`, or to empty) so lite-tool state cannot bleed into the workflow.
- **Testing reality:** pure logic (CSV parser, adapter) is TDD with vitest. SFC changes (`CompareView` embedded mode, `FoundBeaconsView` rewrite) have **no unit tests** — verify with `npx vue-tsc --noEmit` (note: it bails early on a pre-existing `tsconfig` TS5101 `baseUrl` error; use `npx vue-tsc --noEmit --ignoreDeprecations 6.0` diagnostically to confirm no *new* error in touched files) plus the manual-QA steps in each task.
- **Never stage** the four pre-existing untracked root files: `20260527 beacon-comparison-claude.csv`, `namibian example.txt`, `survey-plan-dxf-sample.dxf`, `verification/`. Use explicit `git add <path>`.
- **Run tests from `app-frontend/`.** Commit messages end with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

> **Deviation from spec (persistence/reload):** the spec named `step_data['found-beacons']` as the reload source of truth. In the actual code, `FoundBeaconsView` emits `save` and the parent stores the payload in `workflowState.reportOnSurvey.beacons` (+ `beaconComparison`), and `reportOnSurvey.beacons` **already carries both coordinate pairs** (`originalData.coordinates` = historical, `currentCoordinates` = survey). This plan therefore reuses that existing path — reload reconstructs the comparison from the `existingBeacons` prop — instead of adding a redundant `step_data` write. Same intent (keep persisting, reloadable, report contract preserved), less duplication.

---

### Task 1: Extract the shared beacon-comparison CSV parser

Pull `parseBeaconCsv` + `CSV_HEADER` out of `CompareView.vue` into a shared, unit-tested util. Remove the superseded interim `hist_y`/`hist_x` alias and its test.

**Files:**
- Create: `app-frontend/src/utils/beaconComparisonCsv.ts`
- Create: `app-frontend/src/utils/__tests__/beaconComparisonCsv.test.ts`
- Modify: `app-frontend/src/views/modules/lite/compare/CompareView.vue` (remove local `parseBeaconCsv`/`CSV_HEADER`, import from the util)
- Modify: `app-frontend/src/services/historicalSurveyPoints.ts` (revert the interim `hist_y`/`hist_x` aliases)
- Delete: `app-frontend/src/services/__tests__/historicalSurveyPoints.test.ts` (interim test, superseded)

**Interfaces:**
- Produces: `CSV_HEADER: string` and `parseBeaconCsv(text: string): BeaconComparisonRow[]` where `interface BeaconComparisonRow { name: string; yH: number; xH: number; yS: number; xS: number }`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/beaconComparisonCsv.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseBeaconCsv, CSV_HEADER } from '../beaconComparisonCsv'

const HEADER = 'Beacon,Hist_Y,Hist_X,Survey_Y,Survey_X'

describe('parseBeaconCsv', () => {
  it('CSV_HEADER is the canonical single format', () => {
    expect(CSV_HEADER).toBe(HEADER)
  })

  it('parses a headered file into name + 4 numbers, tolerating blank rows', () => {
    const text = [HEADER, '86B,-85728.77,2143972.22,-85728.7,2143972.14', '', '87A,-85809.7,2144070.83,-85809.64,2144070.74'].join('\n')
    const rows = parseBeaconCsv(text)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ name: '86B', yH: -85728.77, xH: 2143972.22, yS: -85728.7, xS: 2143972.14 })
  })

  it('treats a headerless numeric first line as data', () => {
    const text = ['1,-85728.77,2143972.22,-85728.7,2143972.14', '2,-85809.7,2144070.83,-85809.64,2144070.74', '3,-85741.48,2143988.66,-85741.41,2143988.59'].join('\n')
    expect(parseBeaconCsv(text)).toHaveLength(3)
  })

  it('throws when fewer than 3 beacons', () => {
    const text = [HEADER, '86B,1,2,1,2'].join('\n')
    expect(() => parseBeaconCsv(text)).toThrow(/at least 3/i)
  })

  it('throws on a non-numeric coordinate', () => {
    const text = [HEADER, '86B,abc,2,1,2', '87A,1,2,1,2', '88F,1,2,1,2'].join('\n')
    expect(() => parseBeaconCsv(text)).toThrow(/not a valid number/i)
  })

  it('throws on a row with too few columns', () => {
    const text = [HEADER, '86B,1,2,1', '87A,1,2,1,2', '88F,1,2,1,2'].join('\n')
    expect(() => parseBeaconCsv(text)).toThrow(/expected 5 columns/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run beaconComparisonCsv`
Expected: FAIL — `Failed to load url ../beaconComparisonCsv` (file does not exist yet).

- [ ] **Step 3: Create the util**

Create `app-frontend/src/utils/beaconComparisonCsv.ts` (ported verbatim from `CompareView.vue`'s current `parseBeaconCsv`, now typed):

```ts
/** The single canonical beacon-comparison CSV format. Y = Westing, X = Southing (Cape Lo). */
export const CSV_HEADER = 'Beacon,Hist_Y,Hist_X,Survey_Y,Survey_X'

export interface BeaconComparisonRow {
  name: string
  yH: number
  xH: number
  yS: number
  xS: number
}

/**
 * Parse a beacon-comparison CSV into rows of { name, yH, xH, yS, xS }.
 * Tolerates an optional header line and blank rows; throws on malformed input.
 */
export function parseBeaconCsv(text: string): BeaconComparisonRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) throw new Error('The file is empty.')

  // Treat the first line as a header unless its numeric columns parse as numbers.
  const firstCols = lines[0].split(',')
  const firstLooksLikeData =
    firstCols.length >= 5 && firstCols.slice(1, 5).every((c) => Number.isFinite(parseFloat(c)))
  const dataLines = firstLooksLikeData ? lines : lines.slice(1)

  const rows = dataLines.map((line, i) => {
    const cols = line.split(',').map((s) => s.trim())
    if (cols.length < 5) {
      throw new Error(`Row ${i + 1}: expected 5 columns (${CSV_HEADER}), found ${cols.length}.`)
    }
    const [name, yH, xH, yS, xS] = cols
    const nums = { yH: Number(yH), xH: Number(xH), yS: Number(yS), xS: Number(xS) }
    for (const [k, v] of Object.entries(nums)) {
      if (!Number.isFinite(v)) {
        throw new Error(`Row ${i + 1} (${name || 'unnamed'}): "${k}" is not a valid number.`)
      }
    }
    return { name: name || `BM ${String(i + 1).padStart(3, '0')}`, ...nums }
  })

  if (rows.length < 3) throw new Error('Need at least 3 beacons to run a comparison.')
  return rows
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-frontend && npx vitest run beaconComparisonCsv`
Expected: PASS (6 tests).

- [ ] **Step 5: Point CompareView at the shared util**

In `app-frontend/src/views/modules/lite/compare/CompareView.vue`:
- Delete the local `const CSV_HEADER = 'Beacon,Hist_Y,Hist_X,Survey_Y,Survey_X'` and the whole local `function parseBeaconCsv(text) { … }`.
- Add to the `<script setup>` imports: `import { parseBeaconCsv, CSV_HEADER } from '@/utils/beaconComparisonCsv'`.
- Leave `downloadTemplate`, `handleUpload`, and everything else unchanged (they already reference `CSV_HEADER` / `parseBeaconCsv`).

- [ ] **Step 6: Revert the interim historical-parser alias and delete its test**

In `app-frontend/src/services/historicalSurveyPoints.ts`, restore the two alias lists to their original (remove `'hist_y'` and `'hist_x'`):

```ts
  const yIdx = findColumn(['Y', 'y_coordinate', 'westing', 'northing']);
  const xIdx = findColumn(['X', 'x_coordinate', 'southing', 'easting']);
```

Also remove the interim comment block just above them (the "Also accept the beacon-comparison format …" lines).
Delete the file `app-frontend/src/services/__tests__/historicalSurveyPoints.test.ts`.

- [ ] **Step 7: Run the parser test + confirm the lite Compare route still typechecks conceptually**

Run: `cd app-frontend && npx vitest run beaconComparisonCsv`
Expected: PASS. (No test exercises the SFC; manual QA of the lite Compare tool happens in Task 2.)

- [ ] **Step 8: Commit**

```bash
git add app-frontend/src/utils/beaconComparisonCsv.ts app-frontend/src/utils/__tests__/beaconComparisonCsv.test.ts app-frontend/src/views/modules/lite/compare/CompareView.vue app-frontend/src/services/historicalSurveyPoints.ts
git rm app-frontend/src/services/__tests__/historicalSurveyPoints.test.ts
git commit -m "refactor(beacon-compare): extract shared parseBeaconCsv util; revert interim historical alias"
```

---

### Task 2: Embedded mode for CompareView

Add an `embedded` prop so the Compare surface can render inside the Found Beacons step without its route-level `ModuleScaffold` header/breadcrumbs. Purely additive; the lite route is unchanged when the prop is absent.

**Files:**
- Modify: `app-frontend/src/views/modules/lite/compare/CompareView.vue`

**Interfaces:**
- Produces: `<CompareView :embedded="boolean" />` — when `embedded` is true, renders the same inner panel with no `ModuleScaffold`. Consumes the shared `useSurveyAdjustmentStore()` (unchanged).

- [ ] **Step 1: Add the prop and a scaffold-props computed**

In `CompareView.vue` `<script setup>`, after the existing imports, add:

```js
import ModuleScaffold from '@/components/scaffold/ModuleScaffold.vue'   // already imported — keep single import
const props = defineProps({ embedded: { type: Boolean, default: false } })

const scaffoldProps = computed(() =>
  props.embedded
    ? {}
    : {
        title: 'Beacon Comparison & Adjustment',
        description:
          'Section 67(5) — Cape Lo P(Y,X), South-oriented. 4-parameter Helmert least-squares with iterative data snooping (W-test, chi-square).',
        breadcrumbs: [
          { label: 'Lite', to: '/modules/lite' },
          { label: 'Transform' },
          { label: 'Beacon Comparison' },
        ],
      },
)
```

(If `ModuleScaffold` is already imported, do not add a second import — only add the `props`/`scaffoldProps`.)

- [ ] **Step 2: Wrap the template so the scaffold is conditional**

Replace the outer `<ModuleScaffold …> … </ModuleScaffold>` wrapper in the `<template>` with a dynamic wrapper. The root becomes:

```html
<template>
  <component :is="embedded ? 'div' : ModuleScaffold" v-bind="scaffoldProps">
    <div class="space-y-4">
      <!-- …all existing inner content, unchanged… -->
    </div>
  </component>
</template>
```

Concretely: change the opening `<ModuleScaffold` … `>` (lines ~6–14) to `<component :is="embedded ? 'div' : ModuleScaffold" v-bind="scaffoldProps">`, and change the closing `</ModuleScaffold>` (line ~682) to `</component>`. The `<div class="space-y-4"> … </div>` body in between is untouched. `ModuleScaffold` must be referenced in `<script setup>` scope (it is, via the import) so `:is` can resolve it.

- [ ] **Step 3: Typecheck the touched file**

Run: `cd app-frontend && npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | findstr /I compare`
Expected: no error lines mentioning `compare/CompareView.vue`. (The full command reports many pre-existing errors in unrelated files; only confirm none are newly introduced in `CompareView.vue`.)

- [ ] **Step 4: Manual QA — lite route unchanged**

Start the frontend (`cd app-frontend && npm run dev`) and open the lite Compare tool (Modules → Lite → Transform → Beacon Comparison). Confirm the header/breadcrumbs still render and Upload CSV / Compute still work with `beacon-comparison-brackenhurst.csv`. (Embedded mode is exercised in Task 4.)

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/lite/compare/CompareView.vue
git commit -m "feat(beacon-compare): add embedded mode to CompareView (no scaffold chrome)"
```

---

### Task 3: Found Beacons comparison adapter (pure)

A pure composable that maps the shared store's `points` + `result` into the existing `FoundBeacon[]` / `BeaconComparisonConfig` shapes, into DB rows, and reconstructs store points from previously-saved beacons. This is the testable heart of the feature.

**Files:**
- Create: `app-frontend/src/composables/useFoundBeaconsComparison.ts`
- Create: `app-frontend/src/composables/__tests__/useFoundBeaconsComparison.test.ts`

**Interfaces:**
- Consumes: `BeaconComparisonRow` from `@/utils/beaconComparisonCsv`; store point shape `{ id:number; name:string; yH:number; xH:number; yS:number; xS:number }`; engine `result` shape `{ pts: Array<{ id:number; name:string; finalStatus:'ACCEPT'|'REJECT' }>, … } | null`; `FoundBeacon`, `BeaconComparisonConfig` from `@/types/cadastral`; `HistoricalPointCSV` from `@/services/historicalSurveyPoints`.
- Produces (all named exports):
  - `buildFoundBeacons(points, result, projectBeacons?): FoundBeacon[]`
  - `buildComparisonConfig(points, result, opts?): BeaconComparisonConfig`
  - `toHistoricalRows(points): HistoricalPointCSV[]`
  - `pointsFromExistingBeacons(existingBeacons): StorePoint[]`
  - types `StorePoint`, `EngineResult`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/composables/__tests__/useFoundBeaconsComparison.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  buildFoundBeacons, buildComparisonConfig, toHistoricalRows, pointsFromExistingBeacons,
} from '../useFoundBeaconsComparison'

const points = [
  { id: 1, name: '86B', yH: -85728.77, xH: 2143972.22, yS: -85728.70, xS: 2143972.14 },
  { id: 2, name: '87A', yH: -85809.70, xH: 2144070.83, yS: -85809.64, xS: 2144070.74 },
]
const result = {
  pts: [
    { id: 1, name: '86B', finalStatus: 'ACCEPT' as const },
    { id: 2, name: '87A', finalStatus: 'REJECT' as const },
  ],
}

describe('buildFoundBeacons', () => {
  it('maps each point to a FoundBeacon with both coordinate pairs and a coordinate-derived discrepancy', () => {
    const beacons = buildFoundBeacons(points, result)
    expect(beacons).toHaveLength(2)
    expect(beacons[0]).toMatchObject({
      beaconId: '86B',
      status: 'found',
      originalData: { coordinates: { y: -85728.77, x: 2143972.22 }, source: 'previous-survey' },
      currentCoordinates: { y: -85728.70, x: 2143972.14 },
      adopted: true,
    })
    // discrepancy distance = hypot(yS-yH, xS-xH)
    expect(beacons[0].discrepancy!.distance).toBeCloseTo(Math.hypot(0.07, -0.08), 6)
    expect(beacons[0].discrepancy!.withinTolerance).toBe(true)
    // Rejected point: adopted false, withinTolerance false
    expect(beacons[1].adopted).toBe(false)
    expect(beacons[1].discrepancy!.withinTolerance).toBe(false)
  })

  it('normalises beaconId to the project beacon casing when a name matches (case-insensitive)', () => {
    const beacons = buildFoundBeacons(points, result, [{ beaconId: '86b' }, { beaconId: 'ZZ' }])
    expect(beacons[0].beaconId).toBe('86b')  // matched project casing
    expect(beacons[1].beaconId).toBe('87A')  // unmatched → keep CSV name
  })
})

describe('buildComparisonConfig', () => {
  it('produces a tabulation config with default tolerance and an all-adopted conclusion', () => {
    const cfg = buildComparisonConfig(points, { pts: [
      { id: 1, name: '86B', finalStatus: 'ACCEPT' as const },
      { id: 2, name: '87A', finalStatus: 'ACCEPT' as const },
    ] })
    expect(cfg.method).toBe('tabulation')
    expect(cfg.toleranceThreshold).toBeCloseTo(0.02, 6)
    expect(cfg.currentSRNumber).toBe('')  // parent overrides
    expect(cfg.conclusion).toMatch(/adopt the positions of all found beacons/i)
  })

  it('lists rejected beacons in the conclusion and honours an explicit tolerance/method', () => {
    const cfg = buildComparisonConfig(points, result, { method: 'both', toleranceThreshold: 0.2 })
    expect(cfg.method).toBe('both')
    expect(cfg.toleranceThreshold).toBe(0.2)
    expect(cfg.conclusion).toMatch(/87A/)
  })
})

describe('toHistoricalRows', () => {
  it('maps to {Point, Y:Hist_Y, X:Hist_X} strings for the DB import', () => {
    expect(toHistoricalRows(points)).toEqual([
      { Point: '86B', Y: '-85728.77', X: '2143972.22' },
      { Point: '87A', Y: '-85809.7', X: '2144070.83' },
    ])
  })
})

describe('pointsFromExistingBeacons', () => {
  it('reconstructs store rows from saved beacons carrying both coordinate pairs', () => {
    const existing = [
      { beaconId: '86B', originalData: { coordinates: { y: -85728.77, x: 2143972.22 } }, currentCoordinates: { y: -85728.70, x: 2143972.14 } },
      { beaconId: 'noHist', currentCoordinates: { y: 1, x: 2 } }, // dropped: no originalData
    ]
    const rows = pointsFromExistingBeacons(existing as any)
    expect(rows).toEqual([{ name: '86B', yH: -85728.77, xH: 2143972.22, yS: -85728.70, xS: 2143972.14 }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run useFoundBeaconsComparison`
Expected: FAIL — cannot resolve `../useFoundBeaconsComparison`.

- [ ] **Step 3: Implement the adapter**

Create `app-frontend/src/composables/useFoundBeaconsComparison.ts`:

```ts
import type { FoundBeacon, BeaconComparisonConfig } from '@/types/cadastral'
import type { HistoricalPointCSV } from '@/services/historicalSurveyPoints'

export interface StorePoint { id: number; name: string; yH: number; xH: number; yS: number; xS: number }
export interface EngineResult { pts: Array<{ id: number; name: string; finalStatus: 'ACCEPT' | 'REJECT' }> }

/** Map comparison points (+ engine result) to the Report on Survey FoundBeacon[] shape. */
export function buildFoundBeacons(
  points: StorePoint[],
  result: EngineResult | null,
  projectBeacons: Array<{ beaconId: string }> = [],
): FoundBeacon[] {
  const byName = new Map(projectBeacons.map((b) => [b.beaconId.toLowerCase(), b.beaconId]))
  return points.map((p) => {
    const rp = result?.pts.find((r) => r.id === p.id || r.name === p.name)
    const withinTolerance = rp ? rp.finalStatus === 'ACCEPT' : undefined
    const dy = p.yS - p.yH
    const dx = p.xS - p.xH
    return {
      beaconId: byName.get(p.name.toLowerCase()) ?? p.name,
      status: 'found',
      originalData: { coordinates: { y: p.yH, x: p.xH }, srNumber: '', source: 'previous-survey' },
      currentCoordinates: { y: p.yS, x: p.xS },
      discrepancy: { dy, dx, distance: Math.hypot(dy, dx), withinTolerance },
      adopted: withinTolerance === true,
    }
  })
}

/** Build the BeaconComparisonConfig the Report on Survey renders. currentSRNumber is set by the parent. */
export function buildComparisonConfig(
  points: StorePoint[],
  result: EngineResult | null,
  opts: { method?: 'tabulation' | 'sketch' | 'both'; toleranceThreshold?: number } = {},
): BeaconComparisonConfig {
  const rejected = (result?.pts ?? []).filter((r) => r.finalStatus === 'REJECT').map((r) => r.name)
  const conclusion = rejected.length === 0
    ? 'From the above comparison, I adopt the positions of all found beacons.'
    : `From the above comparison, I adopt the positions of the found beacons, except ${rejected.join(', ')}, which exceeded tolerance.`
  return {
    method: opts.method ?? 'tabulation',
    currentSRNumber: '',
    toleranceThreshold: opts.toleranceThreshold ?? 0.02,
    conclusion,
  }
}

/** Historical pair for the DB import (importHistoricalSurveyPoints). */
export function toHistoricalRows(points: StorePoint[]): HistoricalPointCSV[] {
  return points.map((p) => ({ Point: p.name, Y: String(p.yH), X: String(p.xH) }))
}

/** Rebuild store rows from previously-saved beacons (reload path). Drops beacons lacking a historical pair. */
export function pointsFromExistingBeacons(
  existingBeacons: FoundBeacon[] | undefined,
): Array<Omit<StorePoint, 'id'>> {
  return (existingBeacons ?? [])
    .filter((b) => b.originalData?.coordinates && b.currentCoordinates)
    .map((b) => ({
      name: b.beaconId,
      yH: b.originalData!.coordinates.y,
      xH: b.originalData!.coordinates.x,
      yS: b.currentCoordinates.y,
      xS: b.currentCoordinates.x,
    }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-frontend && npx vitest run useFoundBeaconsComparison`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/composables/useFoundBeaconsComparison.ts app-frontend/src/composables/__tests__/useFoundBeaconsComparison.test.ts
git commit -m "feat(found-beacons): pure adapter from Compare engine result to Report on Survey shapes"
```

---

### Task 4: Rewrite FoundBeaconsView as a thin workflow host

Replace the bespoke-least-squares view with a host that renders `<CompareView embedded/>`, seeds/reloads the shared store, and on "Save" runs the adapter to emit `{ beacons, comparisonConfig }` and persist historical points. The parent (`CadastralStandardView.handleFoundBeaconsSave`) is unchanged.

**Files:**
- Modify (substantially rewrite): `app-frontend/src/views/modules/cadastral-standard/FoundBeaconsView.vue`
- Modify: `app-frontend/src/services/historicalSurveyPoints.ts` (remove now-unused `parseHistoricalPointsCSV`)

**Interfaces:**
- Consumes: `<CompareView embedded/>` (Task 2); `buildFoundBeacons`, `buildComparisonConfig`, `toHistoricalRows`, `pointsFromExistingBeacons` (Task 3); `useSurveyAdjustmentStore` (shared singleton); `importHistoricalSurveyPoints` (unchanged).
- Produces: unchanged emits — `save` with `{ beacons: FoundBeacon[]; comparisonConfig: BeaconComparisonConfig }`, and `back`. Same props (`fixedPoints`, `existingBeacons`, `projectId`).

- [ ] **Step 1: Replace the `<script setup>`**

Replace the entire `<script setup lang="ts">` block of `FoundBeaconsView.vue` with:

```ts
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import type { FoundBeacon } from '../../../types/cadastral'
import { importHistoricalSurveyPoints } from '../../../services/historicalSurveyPoints'
import { useSurveyAdjustmentStore } from '../../../stores/surveyAdjustmentStore'
import {
  buildFoundBeacons, buildComparisonConfig, toHistoricalRows, pointsFromExistingBeacons,
} from '../../../composables/useFoundBeaconsComparison'
import CompareView from '../lite/compare/CompareView.vue'

interface Props {
  fixedPoints?: Array<{ id: string; original: { y: number; x: number }; description: string }>
  existingBeacons?: FoundBeacon[]
  projectId?: number
}
const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'save', data: { beacons: FoundBeacon[]; comparisonConfig: any }): void
  (e: 'back'): void
}>()

const store = useSurveyAdjustmentStore()
const { points, result } = storeToRefs(store)

const saving = ref(false)
const saveError = ref<string | null>(null)
const canSave = computed(() => !!result.value && points.value.length >= 3)

// Reset the shared singleton store on entry so lite-tool state cannot bleed in:
// reload the prior comparison from saved beacons, else start empty (user uploads a CSV).
onMounted(() => {
  const rows = pointsFromExistingBeacons(props.existingBeacons)
  store.setPoints(rows) // rows may be [] → empty table, awaiting CSV upload
})

async function saveAssessment() {
  if (!canSave.value) return
  saving.value = true
  saveError.value = null
  try {
    const pts = points.value as any
    const res = result.value as any
    const beacons = buildFoundBeacons(pts, res)
    const comparisonConfig = buildComparisonConfig(pts, res)

    if (props.projectId) {
      try {
        await importHistoricalSurveyPoints(props.projectId, toHistoricalRows(pts), 'beacon-comparison.csv')
      } catch (e: any) {
        // Non-fatal: the Report on Survey data (emit below) is the primary output.
        console.warn('[FoundBeacons] historical-points DB import failed:', e?.message)
      }
    }
    emit('save', { beacons, comparisonConfig })
  } catch (e: any) {
    saveError.value = e?.message || 'Failed to save beacon assessment'
  } finally {
    saving.value = false
  }
}
</script>
```

- [ ] **Step 2: Replace the `<template>`**

Replace the entire `<template>` of `FoundBeaconsView.vue` with a thin host:

```html
<template>
  <div class="space-y-6">
    <div class="bg-white shadow rounded-lg p-6">
      <div class="flex items-center justify-between mb-2">
        <div>
          <h2 class="text-xl font-semibold text-gray-900">Found Beacons Assessment</h2>
          <p class="text-sm text-gray-600 mt-1">
            SI 727 Section 67(5) — upload a comparison CSV
            (<code>Beacon, Hist_Y, Hist_X, Survey_Y, Survey_X</code>) and run the Helmert / W-test comparison.
          </p>
        </div>
      </div>
    </div>

    <!-- Shared comparison engine, embedded (no lite scaffold chrome) -->
    <CompareView embedded />

    <div v-if="saveError" class="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
      {{ saveError }}
    </div>

    <div class="flex justify-between pt-2">
      <button
        @click="emit('back')"
        class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
      >
        ← Back
      </button>
      <button
        @click="saveAssessment"
        :disabled="!canSave || saving"
        class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {{ saving ? 'Saving…' : 'Save beacon assessment & continue' }}
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Remove the now-unused historical parser**

In `app-frontend/src/services/historicalSurveyPoints.ts`, delete the entire `export function parseHistoricalPointsCSV(...) { … }` (its only caller was `FoundBeaconsView`, now removed). Leave `importHistoricalSurveyPoints`, `getLeastSquaresAnalysis`, and all types intact.

Verify no other caller remains:
Run: `cd app-frontend && npx vitest run 2>&1 | findstr /I "parseHistoricalPointsCSV"` (expect no matches) and search the source:
Run: `git grep -n parseHistoricalPointsCSV -- app-frontend/src` → expect **no results**.

- [ ] **Step 4: Typecheck the touched files**

Run: `cd app-frontend && npx vue-tsc --noEmit --ignoreDeprecations 6.0 2>&1 | findstr /I "FoundBeaconsView historicalSurveyPoints"`
Expected: no error lines for `FoundBeaconsView.vue` or `historicalSurveyPoints.ts` attributable to this change. (Pre-existing unrelated errors elsewhere are acceptable — compare against a baseline run if unsure.)

- [ ] **Step 5: Run the full pure-test suite (no regressions)**

Run: `cd app-frontend && npx vitest run beaconComparisonCsv useFoundBeaconsComparison reportOnSurvey`
Expected: PASS. (Confirms the adapter + parser green and any existing Report-on-Survey tests still pass — the report contract is unchanged.)

- [ ] **Step 6: Manual QA — end to end in the workflow**

Start both servers (`app-backend`: `npm run dev`; `app-frontend`: `npm run dev`). In a project, go to the **Found Beacons Assessment** step and:
1. Upload `C:\para fbead laptop\Paradzayi\cadastral surveys\brakenhurst\beacon-comparison-brackenhurst.csv` in the embedded panel → the table fills (86B, 87A, …). Click **Compute** → results tabs render (schedule/transformation/reliability), no error.
2. Click **Save beacon assessment & continue** → the workflow advances to Field Book (parent `handleFoundBeaconsSave` auto-advances), no console error; if `projectId` present, the historical-points DB import runs (check network / backend log).
3. Generate the **Report on Survey** and confirm the **Beacon Comparison** section renders: method "Tabulation of Co-ordinates", tolerance line, the table (Beacon / Original Y,X / New Y,X / Δ), and the conclusion sentence.
4. Leave the step and return → the table repopulates from the saved beacons (reload via `existingBeacons`) without re-uploading.
5. Open the lite Compare tool separately → it still renders with its scaffold and works (shared store did not break it).

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/FoundBeaconsView.vue app-frontend/src/services/historicalSurveyPoints.ts
git commit -m "feat(found-beacons): embed Compare engine + adapter; retire bespoke least-squares"
```

---

## Self-Review

**1. Spec coverage**
- Single CSV format everywhere → Task 1 (shared `parseBeaconCsv`), used by CompareView; the workflow uploads through the embedded CompareView. ✅
- Embed CompareView wholesale → Task 2 (`embedded` prop) + Task 4 (host renders `<CompareView embedded/>`). ✅
- Shared Sec 67(5) engine; retire bespoke LSQ → Task 4 (uses `surveyAdjustmentStore`; removes bespoke logic). ✅
- Keep persisting → Task 4 (`importHistoricalSurveyPoints`) + emit `save` → `reportOnSurvey.beacons` (documented deviation: reuse existing path, not a new `step_data` write). ✅
- Reload → Task 3 `pointsFromExistingBeacons` + Task 4 `onMounted`. ✅
- Report contract preserved → Task 3 adapter produces exact `FoundBeacon`/`BeaconComparisonConfig` fields the report reads; Task 4 Step 5 re-runs report tests. ✅
- Report richer W-test stats deferred → not implemented (out of scope). ✅
- Singleton store bleed → Task 4 `onMounted` reset. ✅
- Remove interim `hist_y` alias → Task 1 Step 6. ✅

**2. Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. The only judgement left to the implementer is preserving unrelated inner markup when swapping the CompareView wrapper (Task 2 Step 2) — bounded and explicit.

**3. Type consistency:** `StorePoint`/`BeaconComparisonRow` field names (`name,yH,xH,yS,xS`) match the store's `setPoints` shape and `parseBeaconCsv` output. `FoundBeacon` fields (`beaconId,status,originalData.coordinates.{y,x},currentCoordinates.{y,x},discrepancy.distance,adopted`) match `types/cadastral.ts` and the report reader. `BeaconComparisonConfig` (`method,currentSRNumber,toleranceThreshold,conclusion`) matches. Adapter export names are identical between Task 3 definition and Task 4 imports.

## Execution Handoff

Plan complete. Two execution options — Subagent-Driven (recommended) or Inline. Awaiting choice.
