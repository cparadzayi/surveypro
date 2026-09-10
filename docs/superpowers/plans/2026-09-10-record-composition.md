# Record Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the surveyor declare whether a survey record encloses Diagrams, General Plans, or both, persist that with the project, and use it to drive the lodgement letter, the plan-type choosers, and a two-way check of the output folders.

**Architecture:** A pure util (`recordComposition.ts`) owns the model and every decision function. A composable caches it in memory and persists confirmed values into the existing `workflow_state.step_data` jsonb — no migration, no new endpoint. Two Vue views read it to gate their plan-type choosers; the lodgement letter reads it to build its enclosed-documents list.

**Tech Stack:** Vue 3 + TypeScript, Vitest (frontend), Fastify + Jest (backend), axios, jsPDF.

**Spec:** `docs/superpowers/specs/2026-09-10-record-composition-design.md`

## Global Constraints

- Branch: `feat/record-composition`. **Never push to `origin/main`** — that remote is an unrelated project. Push with `git push origin HEAD:nov-alpha` only if explicitly asked.
- Frontend tests: `cd app-frontend && npm test` (Vitest). Config `app-frontend/vitest.config.ts` sets `globals: true`, `environment: 'node'`, alias `@` → `./src`. `describe`/`it`/`expect` are global; importing them from `vitest` is also fine — both styles exist in this repo.
- Backend tests: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>`. **Bare `npx jest` fails** with "Cannot use import statement outside a module" — the backend is ESM.
- **There is no `@vue/test-utils` in this repo and nothing mounts components.** Never add a component-mounting test. All logic that needs testing goes in a plain `.ts` module beside the `.vue`; the `.vue` stays declarative. Precedent: `components/inputs/ParcelSelect.vue` + `parcelSelect.ts`.
- Dependency direction is one-way: `utils/` must never import from `views/`. `views/` imports from `utils/`.
- Gating applies **only** to a composition with `source: 'confirmed'`. An inferred or absent composition never blocks anything.
- Both servers are already running for manual verification: backend `http://127.0.0.1:3050`, frontend `http://localhost:5173`.

## Decisions that supersede the spec

The spec left two questions open and flagged both as unverified. Both are now answered, and **this plan supersedes those two spec sections**. Everything else in the spec stands.

### 1. The letter DOES show counts (supersedes spec §4b, "no count")

Counts are derived live from the output manifest at letter-generation time — never typed by the surveyor:

| Row | Count |
|---|---|
| Diagrams | `filesIn('output/diagrams').length * 3` — **three copies of each diagram are lodged**, so the enclosed count is the file count times three |
| General Plan | `filesIn('output/general-plans').length` — one copy per plan, no multiplier |

Rendering as *"Diagrams (9)"* for 3 diagram files, *"General Plan (2)"* for 2.

The spec's objection — "a count goes stale the moment a plan is superseded" — does not hold: the count is re-derived from the manifest on every render, exactly as presence already is. There is nothing to go stale that is not already recomputed.

### 2. The inference threshold is THREE, not two (supersedes spec §Decisions 4)

Grounded in **SI 727 §61(1)(a)**: a General Plan is required where a parcel is divided into **three or more** adjoining parcels and the immediate parent property is plotted at too small a scale to show the portions clearly.

| Parcel count (excluding Outside Figure) | Inferred composition |
|---|---|
| `0` | neither — not a valid confirmed state |
| `1` or `2` | Diagrams |
| `>= 3` | General Plans |

"Both" is still never guessed. This is a pre-fill only, so a record split into 2 parcels that still needs a General Plan (the small-scale-parent clause of §61(1)(a)) is defaulted differently, never blocked. `inferComposition`'s doc comment cites §61(1)(a) so the threshold is not later mistaken for an arbitrary number.

**One deliberate deviation from the spec:** the spec placed `verifyAgainstManifest` in `recordComposition.ts`. It goes in `lodgementDocuments.ts` instead (Task 4), because it needs the `ManifestFile` type that `lodgementDocuments.ts` owns, and `lodgementDocuments.ts` already imports from `recordComposition.ts`. Putting it in `recordComposition.ts` would create a circular import between the two.

## File Structure

| File | Responsibility |
|---|---|
| `app-frontend/src/utils/recordComposition.ts` *(new)* | The model and every pure decision: infer, normalize, describe, allow |
| `app-frontend/src/utils/lodgementDocuments.ts` *(modify)* | Composition-aware enclosed list; the Diagram rule; folder verification |
| `app-frontend/src/composables/useRecordComposition.ts` *(new)* | In-memory cache + persistence to `workflow_state.step_data` |
| `app-frontend/src/composables/useLodgementCheck.ts` *(modify)* | Threads composition into the document check; returns verification |
| `app-frontend/src/views/modules/cadastral-standard/planTypes.ts` *(modify)* | Adds `family` to `PlanTypeMeta` |
| `app-frontend/src/views/modules/cadastral-standard/planTypeOptions.ts` *(new)* | `planTypeOptionsFor` / `normalizePlanTypeSelection` — the dropdown's logic, extracted so it is testable |
| `app-frontend/src/views/modules/cadastral-standard/SurveyPlanViewNew.vue` *(modify)* | Confirm banner + card gating |
| `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` *(modify)* | Dropdown from `PLAN_TYPE_META` + gating; passes composition to the record check |
| `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` *(modify)* | Passes composition to the record check |
| `app-frontend/src/services/parcelValidation.ts` *(modify)* | Export `isOutsideFigureParcelName` |
| `app-frontend/src/services/documentStorage.ts` *(modify)* | `mtimeMs` in the manifest type |
| `app-backend/src/utils/outputManifest.js` *(modify)* | `mtimeMs` per file |

---

### Task 1: The record-composition model — ✅ ALREADY DONE

**Status: complete.** Shipped in commit `6bb3055` on this branch, 27 passing tests.
Do not re-implement. Read `app-frontend/src/utils/recordComposition.ts` before starting
Task 2 — later tasks consume the exact signatures below.

**Files (as shipped):**
- `app-frontend/src/utils/recordComposition.ts`
- `app-frontend/src/utils/__tests__/recordComposition.test.ts`

**Interfaces actually produced** — later tasks MUST match these, not the spec's earlier draft:

```ts
export type PlanFamily = 'diagram' | 'general' | 'working'

export interface RecordComposition {
  includesDiagrams: boolean
  includesGeneralPlans: boolean
  source: 'inferred' | 'confirmed'
  confirmedAt?: string
}

/** describeComposition returns an OBJECT, not a string. */
export interface CompositionDescription {
  /** Short noun phrase for banners, e.g. "General Plans only" / "Not yet confirmed". */
  label: string
  /** Why a plan type is blocked, or null when nothing is blocked. */
  reason: string | null
}

export function inferComposition(parcelCount: number): RecordComposition
export function normalizeComposition(raw: unknown): RecordComposition | null
export function allowsFamily(c: RecordComposition | null | undefined, family: PlanFamily): boolean
export function describeComposition(c: RecordComposition | null | undefined): CompositionDescription
```

**Three behaviours later tasks depend on:**

1. `inferComposition` uses the **SI 727 §61(1)(a) threshold of three**: `0` ⇒ neither, `1`–`2` ⇒ Diagrams, `>= 3` ⇒ General Plans.
2. `normalizeComposition` keeps a value whose `source` is unrecognised, **demoting it to `'inferred'`** rather than rejecting it. Because gating only acts on `'confirmed'`, malformed jsonb can never block a plan type — it just fails to gate.
3. `describeComposition` owns **both** the banner label and the blocked-plan reason. Do not write a second `blockedReason()` helper in the views — read `.reason` from this, so the wording has one source.

- [x] **Complete** — verify with:

```bash
cd app-frontend && npx vitest run src/utils/__tests__/recordComposition.test.ts
```

Expected: PASS — 27 tests.

---

### Task 2: Plan families and the dropdown's logic

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/planTypes.ts`
- Create: `app-frontend/src/views/modules/cadastral-standard/planTypeOptions.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/planTypeOptions.test.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/planTypes.test.ts` (extend)

**Interfaces:**
- Consumes: `allowsFamily`, `RecordComposition`, `PlanFamily` from Task 1.
- Produces: `PlanTypeMeta.family: PlanFamily`; `interface PlanTypeOption { value: PlanType; label: string; enabled: boolean }`; `planTypeOptionsFor(c: RecordComposition | null): PlanTypeOption[]`; `normalizePlanTypeSelection(current: string, c: RecordComposition | null): PlanType`.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/views/modules/cadastral-standard/__tests__/planTypeOptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { planTypeOptionsFor, normalizePlanTypeSelection } from '../planTypeOptions';
import type { RecordComposition } from '@/utils/recordComposition';

const confirmed = (d: boolean, g: boolean): RecordComposition => ({
  includesDiagrams: d,
  includesGeneralPlans: g,
  source: 'confirmed',
});

const enabledValues = (c: RecordComposition | null) =>
  planTypeOptionsFor(c).filter(o => o.enabled).map(o => o.value).sort();

describe('planTypeOptionsFor', () => {
  it('always returns all four plan types, in PLAN_TYPE_META order', () => {
    expect(planTypeOptionsFor(null).map(o => o.value)).toEqual([
      'general-undeveloped',
      'general-developed',
      'diagram',
      'working-plan',
    ]);
  });

  it('carries the user-facing label through', () => {
    const diagram = planTypeOptionsFor(null).find(o => o.value === 'diagram');
    expect(diagram?.label).toBe('Diagram');
  });

  it('disables diagrams for a general-plans-only record', () => {
    expect(enabledValues(confirmed(false, true))).toEqual([
      'general-developed',
      'general-undeveloped',
      'working-plan',
    ]);
  });

  it('disables general plans for a diagrams-only record', () => {
    expect(enabledValues(confirmed(true, false))).toEqual(['diagram', 'working-plan']);
  });

  it('enables everything for a both record', () => {
    expect(enabledValues(confirmed(true, true))).toEqual([
      'diagram',
      'general-developed',
      'general-undeveloped',
      'working-plan',
    ]);
  });

  it('enables everything when nothing is confirmed', () => {
    expect(enabledValues(null)).toEqual([
      'diagram',
      'general-developed',
      'general-undeveloped',
      'working-plan',
    ]);
  });
});

describe('normalizePlanTypeSelection', () => {
  it('keeps the current selection when it is still allowed', () => {
    expect(normalizePlanTypeSelection('diagram', confirmed(true, false))).toBe('diagram');
    expect(normalizePlanTypeSelection('working-plan', confirmed(false, true))).toBe('working-plan');
  });

  it('moves off a selection the composition has just disallowed', () => {
    // This is the bug the two hardcoded lists hid: config.planType is independent
    // state, so without this the <select> would sit on a disabled option.
    expect(normalizePlanTypeSelection('diagram', confirmed(false, true))).toBe('general-undeveloped');
  });

  it('falls back to the first enabled option for an unknown value', () => {
    expect(normalizePlanTypeSelection('nonsense', confirmed(true, false))).toBe('diagram');
  });

  it('leaves any selection alone when nothing is confirmed', () => {
    expect(normalizePlanTypeSelection('diagram', null)).toBe('diagram');
  });
});
```

Append to `app-frontend/src/views/modules/cadastral-standard/__tests__/planTypes.test.ts`:

```ts
describe('PLAN_TYPE_META families', () => {
  it('assigns each plan type to its product family', () => {
    expect(PLAN_TYPE_META['diagram'].family).toBe('diagram')
    expect(PLAN_TYPE_META['general-developed'].family).toBe('general')
    expect(PLAN_TYPE_META['general-undeveloped'].family).toBe('general')
    expect(PLAN_TYPE_META['working-plan'].family).toBe('working')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/views/modules/cadastral-standard/__tests__/planTypeOptions.test.ts src/views/modules/cadastral-standard/__tests__/planTypes.test.ts`
Expected: FAIL — "Failed to resolve import ../planTypeOptions", and `family` undefined.

- [ ] **Step 3: Write minimal implementation**

In `app-frontend/src/views/modules/cadastral-standard/planTypes.ts`, add the import at the top of the file:

```ts
import type { PlanFamily } from '@/utils/recordComposition'
```

Add the field to the `PlanTypeMeta` interface, after `includesSummary`:

```ts
  /** Product family, for record-composition gating. Working plans are never gated. */
  family: PlanFamily
```

Add `family` to each of the four entries in `PLAN_TYPE_META`:
- `'general-undeveloped'` → `family: 'general',`
- `'general-developed'` → `family: 'general',`
- `diagram` → `family: 'diagram',`
- `'working-plan'` → `family: 'working',`

Create `app-frontend/src/views/modules/cadastral-standard/planTypeOptions.ts`:

```ts
/**
 * The plan-type chooser's logic, extracted from the views so it can be unit-tested
 * (this repo has no component-mounting harness). Both the card picker in
 * SurveyPlanViewNew and the <select> in SurveyPlanMapView render from these.
 */
import { PLAN_TYPE_META, type PlanType } from './planTypes'
import { allowsFamily, type RecordComposition } from '@/utils/recordComposition'

export interface PlanTypeOption {
  value: PlanType
  label: string
  enabled: boolean
}

/** All four plan types in declaration order, each flagged enabled or not. */
export function planTypeOptionsFor(composition: RecordComposition | null): PlanTypeOption[] {
  return (Object.keys(PLAN_TYPE_META) as PlanType[]).map((value) => ({
    value,
    label: PLAN_TYPE_META[value].label,
    enabled: allowsFamily(composition, PLAN_TYPE_META[value].family),
  }))
}

/**
 * Keep a plan-type selection legal.
 *
 * `config.planType` is state independent of the composition, so confirming a
 * general-plans-only record while 'diagram' is selected would otherwise leave the
 * <select> sitting on a disabled option.
 */
export function normalizePlanTypeSelection(
  current: string,
  composition: RecordComposition | null
): PlanType {
  const options = planTypeOptionsFor(composition)
  const stillLegal = options.find((o) => o.value === current && o.enabled)
  if (stillLegal) return stillLegal.value
  const firstEnabled = options.find((o) => o.enabled)
  return firstEnabled ? firstEnabled.value : 'general-undeveloped'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-frontend && npx vitest run src/views/modules/cadastral-standard/__tests__/planTypeOptions.test.ts src/views/modules/cadastral-standard/__tests__/planTypes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/planTypes.ts app-frontend/src/views/modules/cadastral-standard/planTypeOptions.ts app-frontend/src/views/modules/cadastral-standard/__tests__/planTypeOptions.test.ts app-frontend/src/views/modules/cadastral-standard/__tests__/planTypes.test.ts
git commit -m "feat(plans): give each plan type a family and extract the chooser logic"
```

---

### Task 3: The Diagram row in the lodgement letter

**Files:**
- Modify: `app-frontend/src/utils/lodgementDocuments.ts`
- Test: `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts` (extend + fix one existing assertion)

**Interfaces:**
- Consumes: `RecordComposition` from Task 1.
- Produces: `lodgementDocumentsFor(c?: RecordComposition | null): string[]`; `resolveLodgementDocuments(files: ManifestFile[], c?: RecordComposition | null)` — the second parameter is new and optional.

**Note:** the existing test `'lists the 11 canonical items in order'` asserts an exact 11-item array. Adding the Diagram row makes it 12. That assertion must be updated — it is the point of this task, not a regression.

**CORRECTION APPLIED DURING EXECUTION (commit `f0fe6b6`).** As first written, this task folded
the count into `label` — which broke `useLodgementCheck.test.ts:19`, because `label` is an
IDENTITY that four consumers match on (`useLodgementCheck.ts:18` builds `missing[]` from it,
`lodgementDocuments.ts` exact-matches it in `markRecordSectionsPresent`, and `cover-page.ts`
renders it in two places). The shipped design separates them: `LodgementDocumentStatus` carries
BOTH `label` (canonical, never counted) and `displayLabel` (what the letter prints, with the
count). `cover-page.ts` renders `doc.displayLabel ?? doc.label` — so the claim below that
cover-page needs no change is wrong; it needed a two-line change.

**Counts, per Decision 1 above:** the two plan rows carry a live count — Diagrams at three lodged copies per file, General Plan at one. This supersedes the spec's §4b "no count".

- [ ] **Step 1: Write the failing test**

In `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts`, replace the whole opening `describe('LODGEMENT_DOCUMENTS', ...)` block with:

```ts
describe('LODGEMENT_DOCUMENTS', () => {
  it('lists the 12 canonical items in order, with Diagram before General Plan', () => {
    expect(LODGEMENT_DOCUMENTS).toEqual([
      'Field book',
      'Coordinate List and Calculations',
      'Diagram',
      'General Plan',
      'Working Plan',
      'Report on Survey',
      'Dispensation Certificate',
      'Checklist',
      'DSG Certificate (1/96)',
      'Permit/Instruction and layout',
      'Beacon receipt',
      'Searches',
    ]);
  });
});
```

Update the import line at the top of the same file to pull in the new function:

```ts
import { LODGEMENT_DOCUMENTS, lodgementDocumentsFor, resolveLodgementDocuments, markRecordSectionsPresent, type ManifestFile } from '../lodgementDocuments';
import type { RecordComposition } from '../recordComposition';
```

Append these blocks to the end of the file:

```ts
const confirmedComposition = (d: boolean, g: boolean): RecordComposition => ({
  includesDiagrams: d,
  includesGeneralPlans: g,
  source: 'confirmed',
});

describe('lodgementDocumentsFor', () => {
  it('drops General Plan from a diagrams-only record', () => {
    const labels = lodgementDocumentsFor(confirmedComposition(true, false));
    expect(labels).toContain('Diagram');
    expect(labels).not.toContain('General Plan');
    expect(labels).toContain('Working Plan');
  });

  it('drops Diagram from a general-plans-only record', () => {
    const labels = lodgementDocumentsFor(confirmedComposition(false, true));
    expect(labels).not.toContain('Diagram');
    expect(labels).toContain('General Plan');
  });

  it('keeps both for a both record', () => {
    const labels = lodgementDocumentsFor(confirmedComposition(true, true));
    expect(labels).toContain('Diagram');
    expect(labels).toContain('General Plan');
  });

  it('keeps both when nothing is confirmed, so an unconfigured project never regresses', () => {
    expect(lodgementDocumentsFor(null)).toEqual(LODGEMENT_DOCUMENTS);
    expect(lodgementDocumentsFor(undefined)).toEqual(LODGEMENT_DOCUMENTS);
  });

  it('never touches the nine non-plan items', () => {
    const labels = lodgementDocumentsFor(confirmedComposition(true, false));
    expect(labels).toEqual([
      'Field book',
      'Coordinate List and Calculations',
      'Diagram',
      'Working Plan',
      'Report on Survey',
      'Dispensation Certificate',
      'Checklist',
      'DSG Certificate (1/96)',
      'Permit/Instruction and layout',
      'Beacon receipt',
      'Searches',
    ]);
  });
});

describe('resolveLodgementDocuments — the Diagram rule', () => {
  it('ticks Diagram from a plan-type-slug filename in output/diagrams', () => {
    const files = [f('diagram-STAND_2283_MAGLAS.pdf', 'output/diagrams')];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Diagram']).toBe(true);
  });

  it('does NOT tick Diagram for a diagram-named file in the wrong folder', () => {
    // The parent diagram number appears in general plan filenames; folder-gating
    // is what stops it ticking the Diagram row.
    const files = [f('general-plan-parent-diagram-4471.pdf', 'output/general-plans')];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Diagram']).toBe(false);
  });

  it('counts three lodged copies for each diagram file', () => {
    // Three copies of every diagram are lodged, so the enclosed count is the file
    // count times three -- not the file count.
    const files = [
      f('diagram-STAND_207.pdf', 'output/diagrams'),
      f('diagram-STAND_208.pdf', 'output/diagrams'),
      f('diagram-STAND_209.pdf', 'output/diagrams'),
    ];
    const labels = resolveLodgementDocuments(files).map(r => r.label);
    expect(labels).toContain('Diagrams (9)');
  });

  it('keeps the singular noun for one diagram file, still counting its three copies', () => {
    const files = [f('diagram-STAND_207.pdf', 'output/diagrams')];
    const labels = resolveLodgementDocuments(files).map(r => r.label);
    expect(labels).toContain('Diagram (3)');
  });

  it('counts general plans one copy per file, with no multiplier', () => {
    const files = [
      f('general-undeveloped-MAGLAS.pdf', 'output/general-plans'),
      f('general-developed-MAGLAS.pdf', 'output/general-plans'),
    ];
    const labels = resolveLodgementDocuments(files).map(r => r.label);
    expect(labels).toContain('General Plan (2)');
  });

  it('leaves an absent row uncounted and unadorned', () => {
    const labels = resolveLodgementDocuments([]).map(r => r.label);
    expect(labels).toContain('Diagram');
    expect(labels).toContain('General Plan');
  });

  it('never counts the nine non-plan rows', () => {
    const files = [f('MAG1_FieldBook.pdf', 'output/field-book')];
    const labels = resolveLodgementDocuments(files).map(r => r.label);
    expect(labels).toContain('Field book');
  });

  it('honours the composition when building the list', () => {
    const files = [f('diagram-STAND_207.pdf', 'output/diagrams')];
    const labels = resolveLodgementDocuments(files, confirmedComposition(false, true)).map(r => r.label);
    // Counted rows render as "Diagram (3)", so match on the prefix rather than exact text.
    expect(labels.some(l => l.startsWith('Diagram'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/lodgementDocuments.test.ts`
Expected: FAIL — `lodgementDocumentsFor` is not exported; `LODGEMENT_DOCUMENTS` still has 11 items.

- [ ] **Step 3: Write minimal implementation**

In `app-frontend/src/utils/lodgementDocuments.ts`:

Add the import at the top, below the file's doc comment:

```ts
import type { RecordComposition } from './recordComposition';
```

Replace the `export const LODGEMENT_DOCUMENTS` declaration with the full list plus the filter function:

```ts
/** Every enclosed-document label, both plan families included. */
const ALL_LODGEMENT_DOCUMENTS: string[] = [
  'Field book',
  'Coordinate List and Calculations',
  'Diagram',
  'General Plan',
  'Working Plan',
  'Report on Survey',
  'Dispensation Certificate',
  'Checklist',
  'DSG Certificate (1/96)',
  'Permit/Instruction and layout',
  'Beacon receipt',
  'Searches',
];

/**
 * The enclosed-document labels for a given record composition.
 *
 * An unconfirmed or absent composition yields the both-inclusive list, so a
 * project that never set one behaves as it always did (plus the Diagram row).
 */
export function lodgementDocumentsFor(composition?: RecordComposition | null): string[] {
  const gated = composition && composition.source === 'confirmed';
  const wantDiagrams = !gated || composition!.includesDiagrams;
  const wantGeneralPlans = !gated || composition!.includesGeneralPlans;
  return ALL_LODGEMENT_DOCUMENTS.filter((label) => {
    if (label === 'Diagram') return wantDiagrams;
    if (label === 'General Plan') return wantGeneralPlans;
    return true;
  });
}

/** Both-inclusive default, used where no composition is available. */
export const LODGEMENT_DOCUMENTS: string[] = lodgementDocumentsFor(null);
```

Add the copy-count helper above `resolveLodgementDocuments`:

```ts
/**
 * Copies of each file that are physically lodged. Three copies of every diagram go to
 * the SG; general plans go one per plan. Anything not listed is not counted at all.
 */
const COPIES_PER_FILE: Record<string, number> = {
  'Diagram': 3,
  'General Plan': 1,
};

/**
 * Render an enclosed-document label, with a live count for the two plan rows.
 *
 * The count is derived from the manifest on every render, exactly as presence is, so
 * it cannot drift from what is on disk — superseding a plan re-derives both.
 */
function enclosedLabel(label: string, fileCount: number): string {
  const copies = COPIES_PER_FILE[label];
  if (copies === undefined || fileCount === 0) return label;
  const noun = label === 'Diagram' && fileCount > 1 ? 'Diagrams' : label;
  return `${noun} (${fileCount * copies})`;
}
```

Add the Diagram rule to `DOCUMENT_RULES`, immediately above the `'General Plan'` entry:

```ts
  // Diagrams are saved as `diagram-<designation>.pdf` into output/diagrams. Folder-gated,
  // so a general plan that names its parent diagram number cannot tick this row.
  'Diagram': { kind: 'generated', folders: ['diagrams'], keyword: /diagram/i },
```

Replace `resolveLodgementDocuments` with:

```ts
export function resolveLodgementDocuments(
  files: ManifestFile[],
  composition?: RecordComposition | null
): LodgementDocumentStatus[] {
  const list = files || [];
  return lodgementDocumentsFor(composition).map((label) => {
    const rule = DOCUMENT_RULES[label];
    const matches = list.filter((file) => {
      if (!rule || !rule.keyword.test(file.name)) return false;
      const segments = (file.relDir || '').split('/').filter(Boolean);
      if (rule.kind === 'external') return segments[0] === 'input';
      return segments.some((seg) => rule.folders.includes(seg));
    });
    return { label: enclosedLabel(label, matches.length), present: matches.length > 0 };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/lodgementDocuments.test.ts`
Expected: PASS — all existing tests plus the new blocks.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/lodgementDocuments.ts app-frontend/src/utils/__tests__/lodgementDocuments.test.ts
git commit -m "feat(letter): list diagrams in the lodgement letter, gated by composition"
```

---

### Task 4: Verify the composition against the output folders

**Files:**
- Modify: `app-frontend/src/utils/lodgementDocuments.ts`
- Test: `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts` (extend)

**Interfaces:**
- Consumes: `RecordComposition`, `PlanFamily` from Task 1; `ManifestFile` from Task 3's module.
- Produces: `interface CompositionVerification { expectedMissing: PlanFamily[]; unexpectedPresent: Array<{ family: PlanFamily; files: ManifestFile[] }> }`; `verifyAgainstManifest(c: RecordComposition | null, files: ManifestFile[]): CompositionVerification`.

**Why here and not in `recordComposition.ts`:** it needs `ManifestFile`, which this module owns, and this module already imports from `recordComposition.ts`. Putting it there would make the two modules import each other.

- [ ] **Step 1: Write the failing test**

Append to `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts`:

```ts
describe('verifyAgainstManifest', () => {
  it('reports a declared family whose folder is empty', () => {
    const files = [f('general-undeveloped-MAGLAS.pdf', 'output/general-plans')];
    const v = verifyAgainstManifest(confirmedComposition(true, true), files);
    expect(v.expectedMissing).toEqual(['diagram']);
    expect(v.unexpectedPresent).toEqual([]);
  });

  it('reports files present for a family the record does not declare', () => {
    // The stale-trial case: a diagram left over from an abandoned attempt.
    const files = [
      f('general-undeveloped-MAGLAS.pdf', 'output/general-plans'),
      f('diagram-STAND_207.pdf', 'output/diagrams'),
    ];
    const v = verifyAgainstManifest(confirmedComposition(false, true), files);
    expect(v.expectedMissing).toEqual([]);
    expect(v.unexpectedPresent).toHaveLength(1);
    expect(v.unexpectedPresent[0].family).toBe('diagram');
    expect(v.unexpectedPresent[0].files.map(x => x.name)).toEqual(['diagram-STAND_207.pdf']);
  });

  it('reports nothing when the folders match the composition', () => {
    const files = [
      f('general-undeveloped-MAGLAS.pdf', 'output/general-plans'),
      f('diagram-STAND_207.pdf', 'output/diagrams'),
    ];
    const v = verifyAgainstManifest(confirmedComposition(true, true), files);
    expect(v.expectedMissing).toEqual([]);
    expect(v.unexpectedPresent).toEqual([]);
  });

  it('reports both directions at once', () => {
    const files = [f('diagram-STAND_207.pdf', 'output/diagrams')];
    const v = verifyAgainstManifest(confirmedComposition(false, true), files);
    expect(v.expectedMissing).toEqual(['general']);
    expect(v.unexpectedPresent.map(u => u.family)).toEqual(['diagram']);
  });

  it('stays silent when nothing is confirmed', () => {
    const files = [f('diagram-STAND_207.pdf', 'output/diagrams')];
    expect(verifyAgainstManifest(null, files)).toEqual({ expectedMissing: [], unexpectedPresent: [] });
  });

  it('tolerates an empty manifest without throwing', () => {
    const v = verifyAgainstManifest(confirmedComposition(true, false), []);
    expect(v.expectedMissing).toEqual(['diagram']);
  });
});
```

Extend the import at the top of the file to include the new function:

```ts
import { LODGEMENT_DOCUMENTS, lodgementDocumentsFor, resolveLodgementDocuments, markRecordSectionsPresent, verifyAgainstManifest, type ManifestFile } from '../lodgementDocuments';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/lodgementDocuments.test.ts`
Expected: FAIL — `verifyAgainstManifest is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `app-frontend/src/utils/lodgementDocuments.ts`, and widen the type import to bring in `PlanFamily`:

```ts
import type { RecordComposition, PlanFamily } from './recordComposition';
```

```ts
export interface CompositionVerification {
  /** Families the record declares whose output folder holds nothing. */
  expectedMissing: PlanFamily[];
  /** Families the record does NOT declare whose output folder holds files. */
  unexpectedPresent: Array<{ family: PlanFamily; files: ManifestFile[] }>;
}

/** Output subfolder each gated family writes into. Mirrors planTypeOutputSubdir. */
const FAMILY_FOLDERS: Array<{ family: PlanFamily; folder: string }> = [
  { family: 'diagram', folder: 'diagrams' },
  { family: 'general', folder: 'general-plans' },
];

/**
 * Cross-check a confirmed composition against what is actually on disk, in both
 * directions. The absent direction catches "the plan was never generated"; the
 * present direction catches a leftover trial from an abandoned attempt — something
 * a fixed expected-list check cannot express at all.
 */
export function verifyAgainstManifest(
  composition: RecordComposition | null,
  files: ManifestFile[]
): CompositionVerification {
  const result: CompositionVerification = { expectedMissing: [], unexpectedPresent: [] };
  if (!composition || composition.source !== 'confirmed') return result;
  const list = files || [];
  for (const { family, folder } of FAMILY_FOLDERS) {
    const declared = family === 'diagram' ? composition.includesDiagrams : composition.includesGeneralPlans;
    const found = list.filter((file) =>
      (file.relDir || '').split('/').filter(Boolean).includes(folder)
    );
    if (declared && found.length === 0) result.expectedMissing.push(family);
    if (!declared && found.length > 0) result.unexpectedPresent.push({ family, files: found });
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/lodgementDocuments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/lodgementDocuments.ts app-frontend/src/utils/__tests__/lodgementDocuments.test.ts
git commit -m "feat(letter): cross-check the composition against the output folders both ways"
```

---

### Task 5: Timestamps in the output manifest

**Files:**
- Modify: `app-backend/src/utils/outputManifest.js:24-31`
- Modify: `app-frontend/src/services/documentStorage.ts:130-144`
- Modify: `app-frontend/src/utils/lodgementDocuments.ts` (`ManifestFile`)
- Test: `app-backend/src/utils/__tests__/outputManifest.test.js` (extend)

**Interfaces:**
- Produces: each manifest entry gains `mtimeMs: number`; frontend `ManifestFile` gains `mtimeMs?: number`.

**What this buys, stated honestly:** mtime cannot *decide* whether a file is stale — it can only surface it. Task 6 lists matched files with their dates so a human can spot a three-week-old trial beside today's plan. No heuristic judges it.

- [ ] **Step 1: Write the failing test**

Append to `app-backend/src/utils/__tests__/outputManifest.test.js`:

```js
test('carries each file mtime so callers can surface stale outputs', () => {
  const files = collectOutputManifest(root);
  const gp = files.find(f => f.name === 'GENERAL-PLAN-Maglas.pdf');
  expect(typeof gp.mtimeMs).toBe('number');
  expect(gp.mtimeMs).toBeGreaterThan(0);
  expect(files.every(f => typeof f.mtimeMs === 'number')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js outputManifest`
Expected: FAIL — `expect(received).toBe(expected)` with received `"undefined"`.

- [ ] **Step 3: Write minimal implementation**

In `app-backend/src/utils/outputManifest.js`, replace the file branch of `walk`:

```js
    } else if (entry.isFile()) {
      const relDir = path.relative(base, dir).split(path.sep).join('/');
      // mtime lets callers surface a stale output beside a current one. It cannot
      // decide staleness on its own -- that judgement stays with the surveyor.
      let mtimeMs = 0;
      try {
        mtimeMs = fs.statSync(full).mtimeMs;
      } catch {
        // Unreadable file: keep it in the manifest, just without a usable time.
      }
      out.push({ name: entry.name, relDir, mtimeMs });
    }
```

In `app-frontend/src/services/documentStorage.ts`, widen the return type of `getOutputManifest`:

```ts
export async function getOutputManifest(
  workingDirectory: string
): Promise<{ files: { name: string; relDir: string; mtimeMs?: number }[] }> {
```

In `app-frontend/src/utils/lodgementDocuments.ts`, widen `ManifestFile`:

```ts
/** A file from the project output/input manifest. relDir is POSIX, e.g. "output/field-book". */
export interface ManifestFile {
  name: string;
  relDir: string;
  /** Last-modified epoch ms, for surfacing stale outputs. Absent on older callers. */
  mtimeMs?: number;
}
```

- [ ] **Step 3b: Add the shared warning builder**

Both record generators (Task 10) must show the same warnings. Rather than duplicating ~30 lines
of assembly logic into two `.vue` files — which a review would rightly flag — extract it here,
where `mtimeMs` has just become available.

Append this test to `app-frontend/src/utils/__tests__/lodgementDocuments.test.ts`:

```ts
describe('buildLodgementWarnings', () => {
  const noVerification = { expectedMissing: [], unexpectedPresent: [] };

  it('returns no warnings when nothing is missing or unexpected', () => {
    expect(buildLodgementWarnings([], noVerification)).toEqual([]);
  });

  it('lists missing documents as one bulleted warning', () => {
    const [warning] = buildLodgementWarnings(['Working Plan', 'Searches'], noVerification);
    expect(warning).toContain('2 document(s) not found');
    expect(warning).toContain('• Working Plan');
    expect(warning).toContain('• Searches');
  });

  it('names a declared family whose folder is empty', () => {
    const w = buildLodgementWarnings([], { expectedMissing: ['diagram'], unexpectedPresent: [] });
    expect(w[0]).toBe('This record is configured to enclose Diagrams, but none have been generated.');
  });

  it('lists unexpected files with their dates so a stale one is visible', () => {
    const when = new Date('2026-08-20T00:00:00Z').getTime();
    const w = buildLodgementWarnings([], {
      expectedMissing: [],
      unexpectedPresent: [
        { family: 'diagram', files: [{ name: 'diagram-OLD.pdf', relDir: 'output/diagrams', mtimeMs: when }] },
      ],
    });
    expect(w[0]).toContain('1 diagram file(s)');
    expect(w[0]).toContain('diagram-OLD.pdf');
    expect(w[0]).toContain('20/08/2026');
  });

  it('says the date is unknown when the manifest carries no mtime', () => {
    const w = buildLodgementWarnings([], {
      expectedMissing: [],
      unexpectedPresent: [
        { family: 'general', files: [{ name: 'gp.pdf', relDir: 'output/general-plans' }] },
      ],
    });
    expect(w[0]).toContain('date unknown');
  });
});
```

Add `buildLodgementWarnings` to that file's import list, then append the implementation to
`app-frontend/src/utils/lodgementDocuments.ts`:

```ts
/**
 * Assemble the pre-generation warnings for the lodgement letter.
 *
 * Lives here rather than in the two record-generating views so both show identical
 * wording from one tested source. Views join the result with a blank line and pass it
 * to a single confirm dialog.
 */
export function buildLodgementWarnings(
  missing: string[],
  verification: CompositionVerification
): string[] {
  const warnings: string[] = [];

  if (missing.length) {
    warnings.push(
      `${missing.length} document(s) not found in the output folder:
` +
      missing.map((m) => `  • ${m}`).join('
')
    );
  }

  for (const family of verification.expectedMissing) {
    const what = family === 'diagram' ? 'Diagrams' : 'General Plans';
    warnings.push(`This record is configured to enclose ${what}, but none have been generated.`);
  }

  for (const extra of verification.unexpectedPresent) {
    const what = extra.family === 'diagram' ? 'diagram' : 'general plan';
    const listed = extra.files
      .map((file) => {
        // mtime cannot decide staleness -- showing the date lets the surveyor decide.
        const when = file.mtimeMs
          ? new Date(file.mtimeMs).toLocaleDateString('en-GB')
          : 'date unknown';
        return `  • ${file.name} (${when})`;
      })
      .join('
');
    warnings.push(
      `The output folder holds ${extra.files.length} ${what} file(s) that this record ` +
      `is not configured to enclose — they will NOT be listed on the letter:
${listed}`
    );
  }

  return warnings;
}
```

Run: `cd app-frontend && npx vitest run src/utils/__tests__/lodgementDocuments.test.ts`
Expected: PASS.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js outputManifest`
Expected: PASS — 3 tests.

Then confirm the frontend still compiles and passes:
Run: `cd app-frontend && npx vitest run src/utils/__tests__/lodgementDocuments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/utils/outputManifest.js app-backend/src/utils/__tests__/outputManifest.test.js app-frontend/src/services/documentStorage.ts app-frontend/src/utils/lodgementDocuments.ts
git commit -m "feat(manifest): carry file mtimes so stale outputs can be surfaced"
```

---

### Task 6: Thread the composition through the lodgement check

**Files:**
- Modify: `app-frontend/src/composables/useLodgementCheck.ts`
- Test: `app-frontend/src/composables/__tests__/useLodgementCheck.test.ts` (extend)

**Interfaces:**
- Consumes: `resolveLodgementDocuments`, `verifyAgainstManifest`, `CompositionVerification` (Tasks 3–4); `RecordComposition` (Task 1).
- Produces: `checkLodgementDocuments(workingDirectory?: string, composition?: RecordComposition | null): Promise<{ documents: LodgementDocumentStatus[]; missing: string[]; verification: CompositionVerification }>` — the second parameter and the `verification` key are new; existing callers keep working unchanged.

- [ ] **Step 1: Write the failing test**

Append to `app-frontend/src/composables/__tests__/useLodgementCheck.test.ts`:

```ts
import type { RecordComposition } from '@/utils/recordComposition';

const composition = (d: boolean, g: boolean): RecordComposition => ({
  includesDiagrams: d,
  includesGeneralPlans: g,
  source: 'confirmed',
});

describe('checkLodgementDocuments — composition aware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('omits General Plan entirely for a diagrams-only record', async () => {
    (getOutputManifest as any).mockResolvedValue({
      files: [{ name: 'diagram-STAND_207.pdf', relDir: 'output/diagrams', mtimeMs: 1 }],
    });
    const { documents, missing } = await checkLodgementDocuments('some/dir', composition(true, false));
    expect(documents.map(d => d.label)).not.toContain('General Plan');
    expect(missing).not.toContain('General Plan');
    expect(documents.find(d => d.label === 'Diagram')?.present).toBe(true);
  });

  it('flags a declared family whose folder is empty', async () => {
    (getOutputManifest as any).mockResolvedValue({
      files: [{ name: 'general-undeveloped-MAGLAS.pdf', relDir: 'output/general-plans', mtimeMs: 1 }],
    });
    const { verification } = await checkLodgementDocuments('some/dir', composition(true, true));
    expect(verification.expectedMissing).toEqual(['diagram']);
  });

  it('flags leftover files for a family the record does not declare', async () => {
    (getOutputManifest as any).mockResolvedValue({
      files: [
        { name: 'general-undeveloped-MAGLAS.pdf', relDir: 'output/general-plans', mtimeMs: 1 },
        { name: 'diagram-STAND_207.pdf', relDir: 'output/diagrams', mtimeMs: 2 },
      ],
    });
    const { verification } = await checkLodgementDocuments('some/dir', composition(false, true));
    expect(verification.unexpectedPresent.map(u => u.family)).toEqual(['diagram']);
  });

  it('returns an empty verification when no composition is given', async () => {
    (getOutputManifest as any).mockResolvedValue({ files: [] });
    const { verification } = await checkLodgementDocuments('some/dir');
    expect(verification).toEqual({ expectedMissing: [], unexpectedPresent: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/composables/__tests__/useLodgementCheck.test.ts`
Expected: FAIL — `verification` is undefined; General Plan still present in the diagrams-only list.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `app-frontend/src/composables/useLodgementCheck.ts`:

```ts
import { getOutputManifest } from '@/services/documentStorage'
import {
  resolveLodgementDocuments,
  markRecordSectionsPresent,
  verifyAgainstManifest,
  type LodgementDocumentStatus,
  type ManifestFile,
  type CompositionVerification,
} from '@/utils/lodgementDocuments'
import type { RecordComposition } from '@/utils/recordComposition'

/**
 * Determine which enclosed documents exist in the project output/input folders.
 * When no working directory is available (download-only path), skips the fetch and
 * reports every item as absent — callers should NOT show a warning dialog then.
 *
 * The composition, when confirmed, decides which plan rows the letter carries and
 * enables a two-way cross-check against the folders. Omit it and the behaviour is
 * the both-inclusive list with no verification, exactly as before.
 */
export async function checkLodgementDocuments(
  workingDirectory?: string,
  composition?: RecordComposition | null
): Promise<{
  documents: LodgementDocumentStatus[]
  missing: string[]
  verification: CompositionVerification
}> {
  let files: ManifestFile[] = []
  if (workingDirectory) {
    const manifest = await getOutputManifest(workingDirectory)
    files = manifest.files
  }
  const documents = markRecordSectionsPresent(resolveLodgementDocuments(files, composition))
  const missing = documents.filter((d) => !d.present).map((d) => d.label)
  const verification = verifyAgainstManifest(composition ?? null, files)
  return { documents, missing, verification }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-frontend && npx vitest run src/composables/__tests__/useLodgementCheck.test.ts`
Expected: PASS — the three original tests plus four new ones.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/composables/useLodgementCheck.ts app-frontend/src/composables/__tests__/useLodgementCheck.test.ts
git commit -m "feat(letter): thread the record composition through the lodgement check"
```

---

### Task 7: Persist the composition

**Files:**
- Create: `app-frontend/src/composables/useRecordComposition.ts`
- Modify: `app-frontend/src/services/parcelValidation.ts:40` (export the predicate)
- Test: `app-frontend/src/composables/__tests__/useRecordComposition.test.ts`

**Interfaces:**
- Consumes: `normalizeComposition`, `inferComposition`, `RecordComposition` (Task 1); `getLandParcels` from `@/services/landParcels`; `api` from `@/services/api`.
- Produces: `useRecordComposition()` returning `{ compositionFor(projectId): RecordComposition | null, parcelCountFor(projectId): number | null, loadComposition(projectId, workflowState): Promise<RecordComposition | null>, confirmComposition(projectId, includesDiagrams, includesGeneralPlans): Promise<RecordComposition>, resetCache(): void }`; and `isOutsideFigureParcelName(name?: string): boolean` becomes exported from `parcelValidation.ts`.

`parcelCountFor` exists so the confirm banner in Task 8 can say *"Suggested from 47 parcel(s)"* without fetching the parcels a second time.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/composables/__tests__/useRecordComposition.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/services/api', () => ({
  default: { patch: vi.fn().mockResolvedValue({ data: { ok: true } }) },
}));
vi.mock('@/services/landParcels', () => ({
  getLandParcels: vi.fn(),
}));

import api from '@/services/api';
import { getLandParcels } from '@/services/landParcels';
import { useRecordComposition } from '../useRecordComposition';

describe('useRecordComposition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRecordComposition().resetCache();
  });

  it('hydrates a confirmed value from workflow state without fetching parcels', async () => {
    const { loadComposition } = useRecordComposition();
    const c = await loadComposition(42, {
      step_data: {
        'record-composition': {
          includesDiagrams: false,
          includesGeneralPlans: true,
          source: 'confirmed',
          confirmedAt: '2026-09-10T00:00:00.000Z',
        },
      },
    });
    expect(c).not.toBeNull();
    expect(c!.includesGeneralPlans).toBe(true);
    expect(c!.source).toBe('confirmed');
    expect(getLandParcels).not.toHaveBeenCalled();
  });

  it('infers from the parcel count when nothing is persisted', async () => {
    (getLandParcels as any).mockResolvedValue([
      { stand: '207' }, { stand: '208' }, { stand: '209' },
    ]);
    const { loadComposition } = useRecordComposition();
    const c = await loadComposition(42, { step_data: {} });
    expect(getLandParcels).toHaveBeenCalledWith(42);
    expect(c!.includesGeneralPlans).toBe(true);
    expect(c!.source).toBe('inferred');
  });

  it('excludes the Outside Figure parcel from the count', async () => {
    // One real stand plus the Outside Figure must infer a DIAGRAM survey, not a
    // general plan -- counting the Outside Figure would silently flip the guess.
    (getLandParcels as any).mockResolvedValue([
      { stand: '207' }, { stand: 'Outside Figure' },
    ]);
    const { loadComposition } = useRecordComposition();
    const c = await loadComposition(42, { step_data: {} });
    expect(c!.includesDiagrams).toBe(true);
    expect(c!.includesGeneralPlans).toBe(false);
  });

  it('ignores a persisted value that is not a valid confirmed composition', async () => {
    (getLandParcels as any).mockResolvedValue([{ stand: '207' }]);
    const { loadComposition } = useRecordComposition();
    const c = await loadComposition(42, {
      step_data: { 'record-composition': { source: 'inferred', includesDiagrams: true } },
    });
    expect(c!.source).toBe('inferred');
    expect(getLandParcels).toHaveBeenCalled();
  });

  it('persists a confirmation to the workflow endpoint and caches it', async () => {
    const { confirmComposition, compositionFor } = useRecordComposition();
    const c = await confirmComposition(42, true, true);
    expect(c.source).toBe('confirmed');
    expect(c.confirmedAt).toBeTruthy();
    expect(api.patch).toHaveBeenCalledWith('/survey-projects/42/workflow', {
      step: 'record-composition',
      action: 'update',
      metadata: expect.objectContaining({
        includesDiagrams: true,
        includesGeneralPlans: true,
        source: 'confirmed',
      }),
    });
    expect(compositionFor(42)!.includesDiagrams).toBe(true);
  });

  it('refuses to confirm a composition with neither family', async () => {
    const { confirmComposition } = useRecordComposition();
    await expect(confirmComposition(42, false, false)).rejects.toThrow(/at least one/i);
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('serves a cached value without refetching', async () => {
    (getLandParcels as any).mockResolvedValue([{ stand: '207' }, { stand: '208' }]);
    const { loadComposition } = useRecordComposition();
    await loadComposition(42, { step_data: {} });
    await loadComposition(42, { step_data: {} });
    expect(getLandParcels).toHaveBeenCalledTimes(1);
  });

  it('exposes the parcel count the guess was based on, for the banner hint', async () => {
    (getLandParcels as any).mockResolvedValue([
      { stand: '207' }, { stand: '208' }, { stand: 'Outside Figure' },
    ]);
    const { loadComposition, parcelCountFor } = useRecordComposition();
    await loadComposition(42, { step_data: {} });
    expect(parcelCountFor(42)).toBe(2);
  });

  it('has no parcel count for a project hydrated straight from workflow state', async () => {
    const { loadComposition, parcelCountFor } = useRecordComposition();
    await loadComposition(42, {
      step_data: {
        'record-composition': {
          includesDiagrams: true,
          includesGeneralPlans: false,
          source: 'confirmed',
        },
      },
    });
    expect(parcelCountFor(42)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/composables/__tests__/useRecordComposition.test.ts`
Expected: FAIL — "Failed to resolve import ../useRecordComposition".

- [ ] **Step 3: Write minimal implementation**

In `app-frontend/src/services/parcelValidation.ts`, export the existing predicate (change `function` to `export function` on line 40):

```ts
/** True for the Outside Figure pseudo-parcel, which is never a lodged stand. */
export function isOutsideFigureParcelName(name?: string): boolean {
  return (name || '').toLowerCase().includes('outside figure');
}
```

Create `app-frontend/src/composables/useRecordComposition.ts`:

```ts
import { ref } from 'vue'
import api from '@/services/api'
import { getLandParcels } from '@/services/landParcels'
import { isOutsideFigureParcelName } from '@/services/parcelValidation'
import {
  inferComposition,
  normalizeComposition,
  type RecordComposition,
} from '@/utils/recordComposition'

/** Key under workflow_state.step_data. Arbitrary keys are accepted by PATCH .../workflow. */
const STEP_KEY = 'record-composition'

/**
 * Module-scope cache, keyed by project id — the same shape stores/projectContext.ts
 * uses. Confirming writes through to the workflow jsonb AND updates the cache, so
 * gating reacts immediately without a refetch.
 */
const cache = ref<Record<number, RecordComposition>>({})

/** Parcel count each inference was based on, so the banner can show its reasoning. */
const parcelCounts = ref<Record<number, number>>({})

export function useRecordComposition() {
  /** The composition currently known for a project, or null if none is loaded. */
  const compositionFor = (projectId: number): RecordComposition | null =>
    cache.value[projectId] ?? null

  /**
   * The parcel count behind an inferred composition, or null when the composition
   * came straight from the database and no count was ever taken.
   */
  const parcelCountFor = (projectId: number): number | null =>
    parcelCounts.value[projectId] ?? null

  /**
   * Hydrate from workflow state; fall back to inferring from the digitized parcel
   * count. Only confirmed values are ever persisted, so anything valid found in
   * step_data is a human decision and is never overwritten by inference.
   */
  const loadComposition = async (
    projectId: number,
    workflowState?: any
  ): Promise<RecordComposition | null> => {
    if (cache.value[projectId]) return cache.value[projectId]

    const persisted = normalizeComposition(workflowState?.step_data?.[STEP_KEY])
    if (persisted) {
      cache.value[projectId] = persisted
      return persisted
    }

    let parcelCount = 0
    try {
      const parcels = await getLandParcels(projectId)
      parcelCount = (parcels || []).filter(
        (p: any) => !isOutsideFigureParcelName(p?.stand ?? p?.designation)
      ).length
    } catch (error) {
      // A failed fetch must not block plan generation; infer from zero, which
      // gates nothing because the result is only ever 'inferred'.
      console.warn('[RecordComposition] Could not load parcels to infer composition:', error)
    }

    const inferred = inferComposition(parcelCount)
    cache.value[projectId] = inferred
    parcelCounts.value[projectId] = parcelCount
    return inferred
  }

  /** Record the surveyor's decision, persist it, and cache it. */
  const confirmComposition = async (
    projectId: number,
    includesDiagrams: boolean,
    includesGeneralPlans: boolean
  ): Promise<RecordComposition> => {
    if (!includesDiagrams && !includesGeneralPlans) {
      throw new Error('A record must enclose at least one of Diagrams or General Plans')
    }
    const confirmed: RecordComposition = {
      includesDiagrams,
      includesGeneralPlans,
      source: 'confirmed',
      confirmedAt: new Date().toISOString(),
    }
    await api.patch(`/survey-projects/${projectId}/workflow`, {
      step: STEP_KEY,
      action: 'update',
      metadata: { ...confirmed },
    })
    cache.value[projectId] = confirmed
    return confirmed
  }

  /** Test seam; also used when switching projects. */
  const resetCache = () => {
    cache.value = {}
    parcelCounts.value = {}
  }

  return { compositionFor, parcelCountFor, loadComposition, confirmComposition, resetCache }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app-frontend && npx vitest run src/composables/__tests__/useRecordComposition.test.ts`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/composables/useRecordComposition.ts app-frontend/src/composables/__tests__/useRecordComposition.test.ts app-frontend/src/services/parcelValidation.ts
git commit -m "feat(record): persist the confirmed composition in workflow state"
```

---

### Task 8: The confirm banner and card gating

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanViewNew.vue:9-53` (template), `:104-125` (script)

**Interfaces:**
- Consumes: `useRecordComposition` (Task 7); `describeComposition`, `allowsFamily` (Task 1).
- Produces: nothing consumed by later tasks.

**No unit test:** this repo has no component-mounting harness, and all the logic this view needs already lives in tested modules (Tasks 1, 2, 7). The `.vue` change stays declarative. Verification is manual, against the running app.

- [ ] **Step 1: Add composition state to the script**

In the `<script setup>` block of `SurveyPlanViewNew.vue`, after the existing `const { surveyProjects } = useSurveyors()` line:

```ts
import { useRecordComposition } from '@/composables/useRecordComposition'
import { describeComposition, allowsFamily, type PlanFamily } from '@/utils/recordComposition'

const { compositionFor, parcelCountFor, loadComposition, confirmComposition } = useRecordComposition()

const composition = ref(props.projectId ? compositionFor(props.projectId) : null)
const parcelCountForHint = ref<number | null>(null)
const draftDiagrams = ref(false)
const draftGeneralPlans = ref(false)
const confirming = ref(false)

const isConfirmed = computed(() => composition.value?.source === 'confirmed')

// describeComposition owns BOTH the banner label and the blocked-plan reason, so the
// wording has exactly one source. Do not re-derive the reason string here.
const description = computed(() => describeComposition(composition.value))
const compositionLabel = computed(() => description.value.label)
const blockedReason = computed(() => description.value.reason ?? '')

function familyAllowed(family: PlanFamily): boolean {
  return allowsFamily(composition.value, family)
}

/**
 * NOTE: `SurveyPlanViewNew.vue` ALREADY declares `onMounted(() => {` at line 191.
 * Do NOT add a second one — convert that existing hook to `async` and append these
 * statements to the end of its body.
 */
async function initComposition() {
  if (!props.projectId) return
  const loaded = await loadComposition(props.projectId, props.workflowState)
  composition.value = loaded
  parcelCountForHint.value = parcelCountFor(props.projectId)
  draftDiagrams.value = loaded?.includesDiagrams ?? false
  draftGeneralPlans.value = loaded?.includesGeneralPlans ?? false
}
// ...and inside the existing onMounted body, add:  await initComposition()

async function saveComposition() {
  if (!props.projectId) return
  if (!draftDiagrams.value && !draftGeneralPlans.value) return
  confirming.value = true
  try {
    composition.value = await confirmComposition(
      props.projectId,
      draftDiagrams.value,
      draftGeneralPlans.value
    )
  } catch (error) {
    console.error('[RecordComposition] Failed to save:', error)
    alert('Could not save the record composition. Please try again.')
  } finally {
    confirming.value = false
  }
}

/**
 * Reopen the banner for editing. This demotes only the LOCAL copy to 'inferred' —
 * the cache and the database keep the confirmed value until the surveyor presses
 * Confirm again. So pressing Change and then navigating away changes nothing, which
 * is the behaviour you want from a Change link that was never followed through.
 */
function reopenComposition() {
  draftDiagrams.value = composition.value?.includesDiagrams ?? false
  draftGeneralPlans.value = composition.value?.includesGeneralPlans ?? false
  composition.value = composition.value ? { ...composition.value, source: 'inferred' } : null
}
```

Guard the existing `selectPlanType` so a blocked card cannot be opened by any route:

```ts
function selectPlanType(type: string) {
  const family: PlanFamily =
    type === 'diagram' ? 'diagram' : type === 'working-plan' ? 'working' : 'general'
  if (!familyAllowed(family)) return
  selectedPlanType.value = type
  console.log('📋 Selected plan type:', type)
}
```

- [ ] **Step 2: Add the banner to the template**

Immediately after the closing `</div>` of `.header-section` and before `<div v-if="!selectedPlanType" class="plan-type-selection">`:

```html
      <!-- Record Composition: what this record encloses. Drives the letter and the cards below. -->
      <div v-if="projectId" class="composition-banner" :class="{ 'is-confirmed': isConfirmed }">
        <template v-if="isConfirmed">
          <span class="composition-summary">
            📋 Record composition: <strong>{{ compositionLabel }}</strong>
          </span>
          <button class="composition-change" @click="reopenComposition">Change</button>
        </template>
        <template v-else>
          <div class="composition-prompt">
            <strong>What does this survey record enclose?</strong>
            <span v-if="parcelCountForHint !== null" class="composition-hint">
              Suggested from {{ parcelCountForHint }} parcel(s).
            </span>
          </div>
          <label class="composition-option">
            <input type="checkbox" v-model="draftDiagrams" />
            Diagrams
          </label>
          <label class="composition-option">
            <input type="checkbox" v-model="draftGeneralPlans" />
            General Plans
          </label>
          <button
            class="composition-confirm"
            :disabled="(!draftDiagrams && !draftGeneralPlans) || confirming"
            @click="saveComposition"
          >
            {{ confirming ? 'Saving…' : 'Confirm' }}
          </button>
        </template>
      </div>
```

- [ ] **Step 3: Gate the three cards**

Replace each card's opening `<div>` tag. Survey Diagram (currently line 12):

```html
        <div
          class="plan-type-card"
          :class="{ 'plan-type-card--blocked': !familyAllowed('diagram') }"
          :title="familyAllowed('diagram') ? '' : blockedReason"
          @click="selectPlanType('diagram')"
        >
```

Working Plan (currently line 26) — never gated, so it keeps its plain tag:

```html
        <div class="plan-type-card" @click="selectPlanType('working-plan')">
```

Township General Plan (currently line 40):

```html
        <div
          class="plan-type-card"
          :class="{ 'plan-type-card--blocked': !familyAllowed('general') }"
          :title="familyAllowed('general') ? '' : blockedReason"
          @click="selectPlanType('township-general-plan')"
        >
```

Inside the Diagram card and the Township General Plan card, immediately before their closing `</div>`, add the inline reason:

```html
          <p v-if="!familyAllowed('diagram')" class="plan-type-blocked-reason">{{ blockedReason }}</p>
```

```html
          <p v-if="!familyAllowed('general')" class="plan-type-blocked-reason">{{ blockedReason }}</p>
```

- [ ] **Step 4: Add the styles**

Append to the `<style scoped>` block:

```css
.composition-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin: 1rem 0 1.5rem;
  padding: 0.75rem 1rem;
  border: 1px solid #f59e0b;
  border-radius: 0.5rem;
  background: #fffbeb;
}
.composition-banner.is-confirmed {
  border-color: #d1d5db;
  background: #f9fafb;
}
.composition-prompt { display: flex; flex-direction: column; }
.composition-hint { font-size: 0.8rem; color: #6b7280; }
.composition-option { display: inline-flex; align-items: center; gap: 0.35rem; }
.composition-confirm {
  padding: 0.35rem 0.9rem;
  border-radius: 0.375rem;
  background: #2563eb;
  color: #fff;
}
.composition-confirm:disabled { background: #9ca3af; cursor: not-allowed; }
.composition-change {
  margin-left: auto;
  color: #2563eb;
  text-decoration: underline;
  background: none;
}
.plan-type-card--blocked {
  opacity: 0.45;
  cursor: not-allowed;
  pointer-events: none;
}
.plan-type-blocked-reason {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #b45309;
  pointer-events: auto;
}
```

- [ ] **Step 5: Verify manually in the running app**

Both servers are already up. Open `http://localhost:5173`, open a project with several digitized parcels, and navigate to the Survey Plan step. Confirm:

1. The banner appears with **General Plans** pre-ticked and Diagrams unticked.
2. All three cards are fully enabled while the banner is unconfirmed.
3. Tick only **General Plans**, press Confirm. The banner collapses to a summary with a Change link; the **Survey Diagram** card greys out, carries the reason, and does not open when clicked. **Working Plan stays enabled.**
4. Reload the page. The banner is still collapsed and the Diagram card is still blocked — the value came back from the database.
5. Press **Change**, tick Diagrams too, Confirm. All cards enable.

Also run the whole frontend suite to confirm nothing regressed:
Run: `cd app-frontend && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/SurveyPlanViewNew.vue
git commit -m "feat(plans): confirm record composition and gate the plan-type cards"
```

---

### Task 9: One plan-type list, gated

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue:330-340` (the `<select>`), plus script additions

**Interfaces:**
- Consumes: `planTypeOptionsFor`, `normalizePlanTypeSelection` (Task 2); `useRecordComposition` (Task 7).
- Produces: nothing consumed by later tasks.

**This is cleanup #1 from the spec.** The `<select>` currently hardcodes the same four plan types that `PLAN_TYPE_META` already declares — two lists for one vocabulary. Collapsing them means there is one place to make composition-aware.

- [ ] **Step 1: Add composition state to the script**

In the `<script setup>` block of `SurveyPlanMapView.vue`, alongside the existing `paperSizeOptionsFor` import:

```ts
import { planTypeOptionsFor, normalizePlanTypeSelection } from './planTypeOptions'
import { useRecordComposition } from '@/composables/useRecordComposition'
import { describeComposition } from '@/utils/recordComposition'

const { compositionFor, loadComposition } = useRecordComposition()
const recordComposition = ref(props.projectId ? compositionFor(props.projectId) : null)

const planTypeOptions = computed(() => planTypeOptionsFor(recordComposition.value))
const compositionLabel = computed(() => describeComposition(recordComposition.value).label)

onMounted(async () => {
  if (!props.projectId) return
  recordComposition.value = await loadComposition(props.projectId, props.workflowState)
  // config.planType is state independent of the composition: without this, confirming
  // a general-plans-only record while 'diagram' is selected leaves the <select>
  // sitting on a disabled option.
  config.value.planType = normalizePlanTypeSelection(config.value.planType, recordComposition.value)
})
```

If the file already has an `onMounted` block, add these three statements to the end of it rather than declaring a second one.

- [ ] **Step 2: Replace the hardcoded options**

Replace the `<select>` at line 332 and its four `<option>` children with:

```html
          <select v-model="config.planType" class="config-input">
            <option
              v-for="opt in planTypeOptions"
              :key="opt.value"
              :value="opt.value"
              :disabled="!opt.enabled"
            >
              {{ opt.label }}{{ opt.enabled ? '' : ' (not in this record)' }}
            </option>
          </select>
          <p v-if="planTypeOptions.some(o => !o.enabled)" class="plan-type-gated-note">
            This record is configured as {{ compositionLabel }}.
          </p>
```

- [ ] **Step 3: Add the note style**

Append to the `<style scoped>` block:

```css
.plan-type-gated-note {
  margin-top: 0.25rem;
  font-size: 0.75rem;
  color: #6b7280;
}
```

- [ ] **Step 4: Verify manually in the running app**

Open a project confirmed as **General Plans only**, then open the Township General Plan card and its config panel. Confirm:

1. The dropdown lists all four plan types in the original order: General Plan (Undeveloped Portion), General Plan (Developed Portion), Diagram, Working Plan.
2. **Diagram** is disabled and reads "Diagram (not in this record)". Working Plan is selectable.
3. The note underneath reads "This record is configured as General Plans only."
4. The selected value is a general plan, not a disabled option.

Run the suite: `cd app-frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "refactor(plans): render the plan-type list from PLAN_TYPE_META and gate it"
```

---

### Task 10: Wire the composition into both record generators

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue:4625-4640`
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue:6280-6295`

**Interfaces:**
- Consumes: `checkLodgementDocuments` with its new second parameter (Task 6); `useRecordComposition` (Task 7).
- Produces: the final behaviour — the letter's enclosed list and its warning now reflect the composition.

**Both call sites must change.** They build `CoverPageInfo` identically; the 2026-07-13 letter work established this same both-sites pattern, and missing one leaves the Area Computation route silently on the old behaviour.

- [ ] **Step 1: Update the SurveyPlanMapView call site**

Add `buildLodgementWarnings` to this file's existing import from `@/utils/lodgementDocuments`
(or add the import if there is none), then replace the existence-check block at
`SurveyPlanMapView.vue:4625-4640`:

```ts
    // Existence check for enclosed documents (ticks + optional warning), scoped to
    // what this record is configured to enclose.
    const recordWorkingDirectory = (props.projectInfo as any).workingDirectory
    const { documents: lodgementDocs, missing: missingDocs, verification } =
      await checkLodgementDocuments(recordWorkingDirectory, recordComposition.value)

    if (recordWorkingDirectory) {
      // Warning wording is assembled by one tested helper so both record generators
      // say exactly the same thing. See lodgementDocuments.buildLodgementWarnings.
      const warnings = buildLodgementWarnings(missingDocs, verification)
      if (warnings.length) {
        const proceed = window.confirm(`⚠ ${warnings.join('

')}

Generate anyway?`)
        if (!proceed) {
          console.log('[ComprehensivePDF] Generation cancelled by user (document check)')
          return
        }
      }
    }
```

- [ ] **Step 2: Update the MapLibreAreaView call site**

`MapLibreAreaView.vue` does not yet know about the composition. Add to its `<script setup>`, near the existing `checkLodgementDocuments` import at line 914:

```ts
import { useRecordComposition } from '@/composables/useRecordComposition';
import { buildLodgementWarnings } from '@/utils/lodgementDocuments';

const { compositionFor } = useRecordComposition();
```

Then replace its `await checkLodgementDocuments(recordWorkingDirectory)` call at line 6282, and the `window.confirm` block that follows it, with:

```ts
    const recordComposition = props.projectId ? compositionFor(props.projectId) : null
    const { documents: lodgementDocs, missing: missingDocs, verification } =
      await checkLodgementDocuments(recordWorkingDirectory, recordComposition)

    if (recordWorkingDirectory) {
      // Warning wording is assembled by one tested helper so both record generators
      // say exactly the same thing. See lodgementDocuments.buildLodgementWarnings.
      const warnings = buildLodgementWarnings(missingDocs, verification)
      if (warnings.length) {
        const proceed = window.confirm(`⚠ ${warnings.join('

')}

Generate anyway?`)
        if (!proceed) {
          console.log('[ComprehensivePDF] Generation cancelled by user (document check)')
          return
        }
      }
    }
```

**Deliberately reading from cache, not loading:** this view is reached after the Survey Plan step in the normal workflow, so the composition is already cached. If a surveyor generates the record without ever visiting that step, `compositionFor` returns `null` and the letter falls back to the both-inclusive list with no verification — exactly today's behaviour.

- [ ] **Step 3: Verify manually in the running app**

With a project confirmed as **General Plans only** and at least one general plan generated:

1. Generate the comprehensive record. The letter's enclosed list has **no Diagram row**, and General Plan is ticked.
2. Manually drop a file named `diagram-TEST.pdf` into the project's `output/diagrams/` folder and generate again. A warning names the unexpected file **with its date**, and offers to proceed.
3. Change the composition to **Both** and generate again with `output/diagrams/` emptied. A warning says diagrams are configured but none were generated.
4. Put a real diagram back and generate. No composition warning; the letter shows a ticked Diagram row.
5. With two diagrams present, the row reads **Diagrams (6)** — two files at three lodged copies each. With one diagram it reads **Diagram (3)**. With two general plans, that row reads **General Plan (2)** — one copy per plan, no multiplier.

- [ ] **Step 4: Run the full suite**

Run: `cd app-frontend && npm test`
Expected: PASS.

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js outputManifest`
Expected: PASS.

Then check the snapshot suite specifically:
Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitGeoPDF`
Expected: PASS. **If it fails, inspect the diff — do not regenerate it blindly.** That snapshot records exact rendered text x/y. This work changes the number of lines in the letter's enclosed list, which shifts everything below it. The snapshot is backend PDFKit and the letter is frontend jsPDF, so a failure most likely means something else broke.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git commit -m "feat(letter): warn both ways when the folders disagree with the composition"
```

---

## Verification checklist

Run before considering the work done:

```bash
cd app-frontend && npm test
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js
```

Then walk the three configurations end to end in the running app:

| Configuration | Cards | Dropdown | Letter |
|---|---|---|---|
| Diagrams only | Township General Plan blocked | General Plan options disabled | Diagram row, no General Plan row |
| General Plans only | Survey Diagram blocked | Diagram disabled | General Plan row, no Diagram row |
| Both | all enabled | all enabled | both rows |
| Unconfirmed | all enabled | all enabled | both rows, no composition warnings |

Working Plan must be selectable in every one of those.
