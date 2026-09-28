# Interactive Split Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the surveyor draw the cut that divides the outside figure — clicking through road space, seeing what will be refused before committing, and storing the result so the renderers can use it.

**Architecture:** The drawing itself is a state machine in a plain `.ts` module, `app-frontend/src/utils/cutDrawing.ts`, holding the vertices, the snap decision and the live validity verdict. The map view owns only pointer events and what is painted; every rule lives in the module, where it can be tested. Validation is `splitFigure` called on each change — the same function the renderers call, so the preview cannot disagree with the outcome.

**Tech Stack:** Vue 3 + TypeScript + Vitest, MapLibre GL, `proj4` via the existing Cape Lo helpers.

**Spec:** `docs/superpowers/specs/2026-09-26-multi-sheet-outside-figure-split-design.md`

**Predecessors, all complete:**
- `docs/superpowers/plans/2026-09-26-figure-split-geometry.md` — `app-shared/figureSplit.js`
- `docs/superpowers/plans/2026-09-26-per-sheet-derivation.md` — `app-shared/sheetDerivation.js`
- `docs/superpowers/plans/2026-09-27-multi-sheet-rendering.md` — consumes what this plan stores

## Global Constraints

- **Coordinate convention:** `{ y, x }` in Lo metres — `y` easting, `x` southing. MapLibre speaks WGS84 `{ lng, lat }`; convert at the boundary and nowhere else.
- **Clicked points round to 2 decimal places, once, at creation** (spec Decision 13). `figureSplit`'s `roundPoint` is the only place that should happen — do not round in the view and again in the module.
- **Snap tolerance is 0.10 m** and belongs to `resolveEndpoint`, not to this plan. The tool PREVIEWS what `resolveEndpoint` will decide; it must never snap on its own and hand a moved point to `splitFigure`.
- **A cut that grazes a stand is refused, not snapped clear** (Decision 12, as settled). The tool reports the refusal and the surveyor moves their own cut. Never silently adjust what they drew.
- **Validation is `splitFigure`, not a reimplementation.** If the preview says a cut is fine and the render then refuses it, the tool has lied. Call the real function.
- Frontend tests: `cd app-frontend && npx vitest run <path>`. **No `@vue/test-utils`, no `vue-tsc`** — never write a component-mounting test. `.vue` changes verify only as "suite green plus `vite build` compiles", so every `.vue` step below carries explicit manual browser checks, and logic belongs in the `.ts` module where it can be tested.
- `utils/` must never import from `views/`.
- Another session may be committing to this branch. `git add` by explicit path, never `-A`/`.`/`-a`, and check `git diff --cached --name-only` before committing.
- Line endings are mixed LF/CRLF. Compare `git diff --numstat` with `--ignore-cr-at-eol --numstat` for **your own** commit.

## The deliberate exception this plan rests on

`MapLibreAreaView.vue` carries an explicit rule, stated at its `previewDragToCursor` (around `:5489`): a preview LineString is drawn straight in WGS84 and never persisted, because *"turning the cursor into Cape Lo is exactly the coordinate-deriving path decision 1 forbids."* Existing digitising never invents a coordinate from a click; it uses surveyed points.

**This tool must invent coordinates from clicks, and the surveyor asked for that.** Spec Decision 5 and its Part 5 discussion settle it: road space is not digitised, so along a road there is nothing to snap to, and *"the user will click on the screen to generate the vertices."* Those points are then honest about what they are — provenance `-`, neither found nor placed, rounded to 10 mm, appearing in the Coordinate List as defined rather than surveyed.

So decision 1 is not being broken quietly; it is being **excepted, narrowly and on the record**: only for cut vertices, only in road space, and only with the `-` provenance that says so. Task 1 states this in the module's own docstring. Do not remove that paragraph, and do not extend the exception to anything else that takes a click.

## Where it goes: one viewer, not two

The cadastral digitising step has **two** map viewers — `AreaComputationView.vue` (Leaflet) and `MapLibreAreaView.vue` (MapLibre) — each with its own parcel-designation prompt, and past work has had to be wired into both.

This plan puts the split tool in **MapLibre only**. The reason is concrete rather than a preference: the LineString rubber-band preview, the vertex hit-testing and the click-to-draw machinery this tool needs already exist there (`MapLibreAreaView.vue` around `:5361` and `:5489`), and the Leaflet view has none of it. Building it twice would double the surface for a feature whose geometry rules are all shared anyway.

**The consequence, which the surveyor should confirm before Task 5 runs:** a surveyor working in the Leaflet view cannot split a figure and must switch to the MapLibre view to do it. If that is unacceptable, Task 5 grows a sibling task for Leaflet and the estimate roughly doubles — the `.ts` module and Tasks 1–4 are unaffected either way, which is why this plan puts every rule there.

## File Structure

| File | Responsibility |
| --- | --- |
| `app-frontend/src/utils/cutDrawing.ts` (create) | The drawing state machine: vertices, snap preview, live verdict. Every rule. |
| `app-frontend/src/utils/__tests__/cutDrawing.test.ts` (create) | Its tests. |
| `app-frontend/src/utils/cutStorage.ts` (create) | Reading and writing the stored cuts on the project. |
| `app-frontend/src/utils/__tests__/cutStorage.test.ts` (create) | Its tests. |
| `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue` (modify) | Pointer events and painting. No rules. |

---

### Task 1: The drawing state machine

Everything the tool decides, in one testable place: what the surveyor has clicked, where an endpoint would land, and whether the cut as it stands would be accepted.

**Files:**
- Create: `app-frontend/src/utils/cutDrawing.ts`
- Test: `app-frontend/src/utils/__tests__/cutDrawing.test.ts`

**Interfaces:**
- Consumes: `splitFigure`, `resolveEndpoint`, `roundPoint`, `SNAP_TOLERANCE_M` from `app-shared/figureSplit`.
- Produces:
  ```ts
  interface CutDraft {
    vertices: LoPoint[]              // rounded once, at creation
    startsAt: EndpointPreview | null // what resolveEndpoint would do with vertex 0
    endsAt: EndpointPreview | null   // …and with the last
    verdict: Verdict                 // 'incomplete' | 'ok' | a splitFigure error
    offenders: string[]              // stands named by a straddles-stands refusal
  }
  interface EndpointPreview { kind: 'vertex' | 'edge'; index: number; point: LoPoint; snapped: boolean }
  type Verdict = 'incomplete' | 'ok' | 'degenerate' | 'self-intersecting' | 'straddles-stands' | 'interior-outside'

  newDraft() -> CutDraft
  addVertex(draft, ring, stands, point) -> CutDraft     // point is raw Lo, unrounded
  undoVertex(draft, ring, stands) -> CutDraft
  clearDraft() -> CutDraft
  ```
  Every function returns a NEW draft; none mutates its argument, so Vue reactivity sees a change and an undo cannot corrupt history.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/cutDrawing.test.ts`:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { newDraft, addVertex, undoVertex, clearDraft } from '../cutDrawing';

const P = (y: number, x: number) => ({ y, x });
const box = (y0: number, x0: number, y1: number, x1: number) =>
  [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)];

const ring = box(0, 0, 100, 100);
const noStands: never[] = [];

describe('a fresh draft', () => {
  it('has nothing and says so', () => {
    const d = newDraft();
    expect(d.vertices).toEqual([]);
    expect(d.verdict).toBe('incomplete');
    expect(d.startsAt).toBeNull();
  });
});

describe('addVertex', () => {
  it('rounds a clicked point to 2 dp, once', () => {
    // Decision 13. The raw click carries whatever the projection produced.
    const d = addVertex(newDraft(), ring, noStands, P(33.333333, 0.004));
    expect(d.vertices[0]).toEqual(P(33.33, 0));
  });

  it('does not mutate the draft it was given', () => {
    const before = newDraft();
    addVertex(before, ring, noStands, P(10, 0));
    expect(before.vertices).toEqual([]);
  });

  it('is incomplete with one vertex', () => {
    const d = addVertex(newDraft(), ring, noStands, P(50, 0));
    expect(d.verdict).toBe('incomplete');
  });

  it('accepts an honest chord as soon as it has two ends', () => {
    let d = addVertex(newDraft(), ring, noStands, P(50, 0));
    d = addVertex(d, ring, noStands, P(50, 100));
    expect(d.verdict).toBe('ok');
  });

  it('previews a snap when an end is within tolerance of a figure point', () => {
    // 0,04 m from the corner (0,0): resolveEndpoint will snap it.
    let d = addVertex(newDraft(), ring, noStands, P(0.04, 0.03));
    d = addVertex(d, ring, noStands, P(100, 50));
    expect(d.startsAt?.kind).toBe('vertex');
    expect(d.startsAt?.snapped).toBe(true);
    expect(d.startsAt?.point).toEqual(P(0, 0));
  });

  it('previews a new point on an edge when nothing is near enough', () => {
    let d = addVertex(newDraft(), ring, noStands, P(40, 0.07));
    d = addVertex(d, ring, noStands, P(100, 50));
    expect(d.startsAt?.kind).toBe('edge');
    expect(d.startsAt?.snapped).toBe(false);
  });

  it('reports a cut that would slice a stand, and names it', () => {
    const stands = [{ name: '1686', ring: box(40, 10, 60, 20) }];
    let d = addVertex(newDraft(), ring, stands, P(50, 0));
    d = addVertex(d, ring, stands, P(50, 100));
    expect(d.verdict).toBe('straddles-stands');
    expect(d.offenders).toEqual(['1686']);
  });

  it('reports a cut that wanders outside the figure', () => {
    let d = addVertex(newDraft(), ring, noStands, P(50, 0));
    d = addVertex(d, ring, noStands, P(150, 50));   // outside
    d = addVertex(d, ring, noStands, P(50, 100));
    expect(d.verdict).toBe('interior-outside');
  });

  it('reports a cut that crosses itself', () => {
    let d = addVertex(newDraft(), ring, noStands, P(0, 50));
    d = addVertex(d, ring, noStands, P(70, 30));
    d = addVertex(d, ring, noStands, P(30, 30));
    d = addVertex(d, ring, noStands, P(70, 70));
    d = addVertex(d, ring, noStands, P(100, 50));
    expect(d.verdict).toBe('self-intersecting');
  });

  it('a repeated click is one vertex, not two', () => {
    // A double-click while drawing. figureSplit collapses these, so the preview
    // must agree with it or the vertex count on screen lies.
    let d = addVertex(newDraft(), ring, noStands, P(50, 0));
    d = addVertex(d, ring, noStands, P(50, 50));
    d = addVertex(d, ring, noStands, P(50, 50));
    d = addVertex(d, ring, noStands, P(50, 100));
    expect(d.vertices).toHaveLength(3);
    expect(d.verdict).toBe('ok');
  });
});

describe('undoVertex', () => {
  it('removes the last vertex and re-verdicts what is left', () => {
    const stands = [{ name: '1686', ring: box(40, 10, 60, 20) }];
    let d = addVertex(newDraft(), ring, stands, P(50, 0));
    d = addVertex(d, ring, stands, P(50, 100));
    expect(d.verdict).toBe('straddles-stands');

    d = undoVertex(d, ring, stands);
    expect(d.vertices).toHaveLength(1);
    expect(d.verdict).toBe('incomplete');
  });

  it('on an empty draft is a no-op, not a throw', () => {
    expect(undoVertex(newDraft(), ring, noStands).vertices).toEqual([]);
  });
});

describe('clearDraft', () => {
  it('returns something a fresh draft would match', () => {
    expect(clearDraft()).toEqual(newDraft());
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app-frontend && npx vitest run src/utils/__tests__/cutDrawing.test.ts
```

Expected: FAIL — cannot resolve `../cutDrawing`.

- [ ] **Step 3: Implement it**

Create `app-frontend/src/utils/cutDrawing.ts`. Open it with the exception paragraph from this plan's *"The deliberate exception"* section, in the module docstring, in your own words but keeping the substance: existing digitising never derives a coordinate from a click; this tool does, because road space is not digitised; the points say so via provenance `-`; the exception is for cut vertices only.

Then:
- `addVertex` rounds with `roundPoint` **once**, appends, and drops a vertex identical at 2 dp to the one before it (so the preview's vertex count matches what `splitFigure` will use).
- `revalidate(draft, ring, stands)`, private: fewer than two vertices → `'incomplete'`; otherwise `resolveEndpoint` on the first and last for the two previews, and `splitFigure({ ring, polyline: draft.vertices, stands })` for the verdict. `ok: true` → `'ok'`; otherwise its `error` verbatim and its `stands` into `offenders`.
- `snapped` is `preview.kind === 'vertex'`.
- Everything returns a new object.

Do not re-derive containment, crossing or straddling. Ask `splitFigure`.

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 14 tests.

- [ ] **Step 5: Prove the verdict comes from `splitFigure`**

Temporarily make `revalidate` return `'ok'` whenever there are two or more vertices. Four tests must fail — the straddle, the outside, the self-intersection, and the snap-preview one that depends on real resolution. Restore, confirm green, paste both outputs. If only one fails, the tests are not exercising the verdict.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/utils/cutDrawing.ts app-frontend/src/utils/__tests__/cutDrawing.test.ts
git diff --cached --name-only
git commit -m "feat(split): the cut drawing state machine, with live validation"
```

---

### Task 2: Storing the cuts

A cut has to survive a page reload, and the renderers read it. Spec Decision 10 is emphatic that sheet numbers are **derived, never stored** — and the same reasoning applies here: store the cut the surveyor drew, and nothing computed from it. Parts, sheet numbers, letters and created-point names are all re-derived, so they can never go stale against the figure.

**Files:**
- Create: `app-frontend/src/utils/cutStorage.ts`
- Test: `app-frontend/src/utils/__tests__/cutStorage.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface StoredCut { vertices: Array<{ y: number; x: number }> }
  readCuts(projectMetadata: unknown) -> StoredCut[]      // [] for anything unreadable
  writeCuts(projectMetadata: object, cuts: StoredCut[]) -> object   // a new metadata object
  ```

- [ ] **Step 1: Write the failing test**

```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { readCuts, writeCuts } from '../cutStorage';

const P = (y: number, x: number) => ({ y, x });

describe('readCuts', () => {
  it('reads what writeCuts wrote', () => {
    const cut = { vertices: [P(50, 0), P(50, 100)] };
    expect(readCuts(writeCuts({}, [cut]))).toEqual([cut]);
  });

  it('is empty for a project that has never been split', () => {
    expect(readCuts({})).toEqual([]);
    expect(readCuts(undefined)).toEqual([]);
    expect(readCuts(null)).toEqual([]);
  });

  it('is empty rather than throwing on rubbish', () => {
    // Metadata is stored JSON and reaches us from a database, so it can be
    // anything. A malformed cut must not break plan generation.
    expect(readCuts({ figureCuts: 'nonsense' })).toEqual([]);
    expect(readCuts({ figureCuts: [{ vertices: 'no' }] })).toEqual([]);
    expect(readCuts({ figureCuts: [{ vertices: [{ y: 1 }] }] })).toEqual([]);
  });

  it('drops a cut with fewer than two vertices', () => {
    expect(readCuts({ figureCuts: [{ vertices: [P(1, 2)] }] })).toEqual([]);
  });
});

describe('writeCuts', () => {
  it('does not mutate the metadata it was given', () => {
    const meta = { designation: 'Stands 1686-1687' };
    writeCuts(meta, [{ vertices: [P(50, 0), P(50, 100)] }]);
    expect(Object.keys(meta)).toEqual(['designation']);
  });

  it('leaves every other metadata key alone', () => {
    const out = writeCuts({ designation: 'X', centralMeridian: 31 }, []);
    expect(out.designation).toBe('X');
    expect(out.centralMeridian).toBe(31);
  });

  it('stores only the vertices, never anything derived from them', () => {
    // Decision 10's reasoning: sheet numbers are derived, not stored, so they
    // cannot go stale. Parts, letters and created-point names are the same.
    const stored = writeCuts({}, [{ vertices: [P(50, 0), P(50, 100)] }]) as Record<string, unknown>;
    expect(JSON.stringify(stored)).not.toMatch(/sheetNumber|parts|letter|Outside Figure/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement it**

Store under `metadata.figureCuts`. Validate on read: an array, each entry an object with a `vertices` array of at least two entries, each a finite `{ y, x }`. Anything else is dropped rather than thrown — this is stored JSON arriving from a database, and a malformed cut must not stop a plan being generated. `writeCuts` returns `{ ...metadata, figureCuts: cuts }`.

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/cutStorage.ts app-frontend/src/utils/__tests__/cutStorage.test.ts
git diff --cached --name-only
git commit -m "feat(split): store the cut the surveyor drew, and nothing derived from it"
```

---

### Task 3: Drawing it on the map

Pointer events and painting. Every rule already lives in `cutDrawing.ts`, so this task adds no logic — if you find yourself deciding geometry here, it belongs in the module.

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`

**Interfaces:**
- Consumes: `newDraft`, `addVertex`, `undoVertex`, `clearDraft` from `../../../utils/cutDrawing`; the existing Cape Lo ↔ WGS84 helpers this view already uses.
- Produces: nothing exported.

- [ ] **Step 1: Add the mode, and the layers it paints**

A "Split figure" toggle that, while active, suppresses parcel digitising so a click cannot do both. Three paint layers, all display-only:
- the committed vertices, as small circles;
- the polyline through them;
- a rubber band from the last vertex to the cursor, drawn **straight in WGS84** exactly as `previewDragToCursor` does — not routed through Cape Lo.

- [ ] **Step 2: Wire the events**

Click → convert to Cape Lo, `addVertex`. `Ctrl+Z` or an Undo button → `undoVertex`. Escape → `clearDraft`. Double-click or an explicit Finish → leave the mode with the draft intact.

- [ ] **Step 3: Show the verdict where the surveyor is looking**

The draft's `verdict` as a line under the map, not a toast that can be missed:
- `incomplete` → "Click a second point to close the cut."
- `ok` → "This cut divides the figure into 2 sheets." (count from `splitFigure`'s parts.)
- `straddles-stands` → "Would slice stand 1686." — name every offender; that is why they are returned.
- `interior-outside` → "The cut leaves the figure."
- `self-intersecting` → "The cut crosses itself."
- `degenerate` → "Both ends land in the same place."

And paint a snapped endpoint differently from a created one, so "this reuses beacon 87D" and "this makes a new point" are distinguishable **before** committing — the surveyor is accountable for a created point's coordinates appearing in the Coordinate List.

- [ ] **Step 4: Build, then check it in a browser**

```bash
cd app-frontend && npx vitest run src/utils/__tests__/ && npx vite build; echo "EXIT=$?"
```
Read the exit code directly, not the last line of output.

Then, because **no test in this repo can see a `.vue` file**, walk these by hand and record what you saw:
1. Toggle the mode on. Click two points across the figure. The line, both endpoint markers and "divides the figure into 2 sheets" all appear.
2. Click a third point outside the figure. The verdict changes to "leaves the figure" while you are still drawing.
3. Undo it. The verdict goes back to ok.
4. Draw a cut across a stand. The stand is named in the message.
5. Click within 10 cm of an existing figure corner. The endpoint marker shows as snapped, and the coordinate readout is the beacon's, not your click's.
6. Escape. Everything clears and parcel digitising works again.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git diff --cached --name-only
git commit -m "feat(split): draw the cut on the map, with its verdict live"
```

---

### Task 4: Saving, reloading, and handing it to the renderers

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue`

- [x] **Step 1: Save on finish, restore on load**

Finishing a valid draft calls `writeCuts` and persists the project metadata by whatever path this view already uses for a parcel edit — do not invent a second one. On mount, `readCuts` and paint any stored cut so the surveyor sees it exists.

- [x] **Step 2: Refuse to save an invalid draft**

Only a draft whose verdict is `ok` can be saved. The Finish control is disabled otherwise, with the verdict visible beside it, so the reason is never a mystery.

- [x] **Step 3: Show what the cut produces**

Once stored, show the sheet count and each sheet's number over its part, from `buildSheetPayloads` (rendering plan, Task 2). **Decision 10's numbering lives in `orderSheets` and must have exactly one implementation.** *(Done: parts paint `N/M` labels over each part from `buildSheetPayloads`. The renderer hand-off required more than this plan's file list — `SurveyPlanMapView.vue` reads the stored cut, calls `buildSheetPayloads`, and attaches `sheets` to the PDF/DXF payload through `planPayload.ts` and `geopdf.ts`. The backend `sheets` route predates this plan.*)

- [ ] **Step 4: Build, then check by hand**

```bash
cd app-frontend && npx vitest run src/utils/__tests__/ && npx vite build; echo "EXIT=$?"
```
1. Draw a valid cut, finish, reload the page. The cut is still there.
2. Draw an invalid cut. Finish is disabled and the reason is on screen.
3. Generate a plan. It comes out as two sheets.
4. Delete the cut, save, generate again. One sheet.

- [x] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/MapLibreAreaView.vue
git diff --cached --name-only
git commit -m "feat(split): persist a cut and reload it"
```

---

### Task 5: The Leaflet view — confirm before building

**Do not start this task without the surveyor's answer.** This plan's recommendation is that the split tool lives in the MapLibre view only, for the reason given in *"Where it goes"*: the drawing machinery is there and the Leaflet view has none of it.

If the answer is that Leaflet must have it too, this task mirrors Tasks 3 and 4 against `AreaComputationView.vue`, reusing `cutDrawing.ts` and `cutStorage.ts` unchanged — which is the point of every rule living in a `.ts` module. Budget it as roughly the size of Tasks 3 and 4 together, and expect the same manual checks, since no test can see either view.

If the answer is MapLibre only, close this task by writing that down: a note in `AreaComputationView.vue` saying splitting is done in the MapLibre view, so the next person does not conclude it was forgotten.

*(Answer: MapLibre only. Done — `AreaComputationView.vue`'s deprecation banner now says splitting is done in the MapLibre view.)*

---

## Self-Review

**Spec coverage.** Decision 5 (free-form split along roads, clicked vertices) → Tasks 1, 3. Decision 12 as settled (a grazing stand is refused, not snapped) → Task 1, inherited from `splitFigure` rather than reimplemented. Decision 13 (2 dp, once, at creation) → Task 1 Step 1's first test. Decision 6 (`-` provenance) → inherited: the tool stores only vertices, and provenance is attached where the points are named, in the rendering plan's Task 1. The four crossing/snapping combinations of spec Part 5.3 → all inherited from `resolveEndpoint`, and previewed rather than re-decided.

**Not covered, deliberately.** Editing an existing cut vertex by dragging. Adding it means hit-testing and a drag state machine on top of a feature that does not exist yet; delete and redraw is enough to lodge a plan. Say so when the surveyor asks.

**The tension I want a reviewer to check.** Task 1 validates by calling `splitFigure` on every click. That is the right call for honesty — the preview cannot disagree with the outcome — but it is O(cut × ring × stands) per click. On a 240-stand township with a 60-vertex figure that may be slow enough to feel. If it is, the fix is to debounce the verdict, **not** to write a cheaper approximate check: two validators is how a preview starts lying. A reviewer should look for a cheap-check shortcut having crept in.

**Type consistency.** `CutDraft.vertices` is `LoPoint[]` — the same `{ y, x }` every shared module uses. `EndpointPreview` mirrors `resolveEndpoint`'s own return, plus `snapped`, so a reader can line the two up. `StoredCut` holds only vertices, matching Decision 10's derive-don't-store rule.

**Ordering.** Tasks 1 and 2 are independent and both pure. Task 3 consumes both. Task 4 consumes Task 3. Task 5 is gated on an answer and may not run at all.
