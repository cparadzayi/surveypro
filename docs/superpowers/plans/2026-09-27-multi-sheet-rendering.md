# Multi-Sheet Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the per-sheet data the derivation plan produces into lodgeable output — one PDF of N pages and one DXF per sheet — and retire the grid-tiling path it replaces.

**Architecture:** One new pure assembler, `app-frontend/src/utils/sheetPayloads.ts`, ties `sheetDerivation.js`, `sheetOutsideFigure.ts` and `statementRowsForSheet` into one array of per-sheet payloads. Both renderers already accept a `sheetInfo` and already draw "SHEET N" chrome from it, so the renderers change at their *input* rather than in their drawing code: the PDF loops the payloads where it used to loop a tile grid, and the DXF is invoked once per payload. Nothing new is persisted except the cuts themselves.

**Tech Stack:** Vue 3 + TypeScript + Vitest (frontend), Fastify + Jest + `pdfkit`/`pdf-lib` (backend PDF), `dxfGenerator.js` (DXF).

**Spec:** `docs/superpowers/specs/2026-09-26-multi-sheet-outside-figure-split-design.md`

**Predecessors, both complete:**
- `docs/superpowers/plans/2026-09-26-figure-split-geometry.md` — `app-shared/figureSplit.js`
- `docs/superpowers/plans/2026-09-26-per-sheet-derivation.md` — `app-shared/sheetDerivation.js`, `app-frontend/src/utils/sheetOutsideFigure.ts`, `statementRowsForSheet`

Read both modules' docstrings before starting. They carry contracts this plan must honour, and the "For the rendering plan" section of `.superpowers/sdd/2026-09-26-per-sheet-derivation/progress.md` lists every one that is not obvious from the code.

## Global Constraints

- **Coordinate convention:** every point is `{ y, x }` in Lo metres — `y` easting, `x` southing. Never `{ x, y }` PDF points.
- **A single-sheet plan uses `figureDescription.template`, NOT `multiSheetTemplate`.** `otherSheetsPhrase` returns `''` for one sheet and the multi-sheet sentence has nowhere to put it: `"the figures on , represents"` would be lodged as written. `figureLabel(1, 1)` returning the plain name is Decision 11's naming rule, not permission to use the multi-sheet wording.
- **Never letter by writing onto a point.** Part rings, `newPoints` and the caller's own ring share point OBJECTS. Spec Part 4 requires one physical point to carry a different letter per sheet, which annotation cannot do. `letterPart` already returns the map you need, keyed by vertex position.
- **Match a part-ring point back to `newPoints` with `===`**, never by coordinate. A coordinate comparison needs an epsilon and misclassifies a beacon surveyed to 3 dp as one the cut created.
- **Public places are absent from `bySheet` by design** — the Seventh Schedule describes them collectively. Do not synthesise schedule rows for them.
- **Exclude the outside figure itself** from the `stands` array passed to `assignStands`, or every split is refused naming the figure.
- **A cut endpoint is up to ~7 mm off the boundary it split** (Decision 13's 2 dp rounding). Any containment or renderer-parity check near a cut endpoint needs a tolerance of at least the 10 mm quantum. Do not assert exact equality between a part ring's side lengths and the original figure's.
- **Normalise a GeoJSON ring to OPEN** (drop the repeated last position) before passing it to anything in `sheetDerivation.js`. `splitFigure` normalises internally; `sheetDerivation` does not.
- Backend tests: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>`. Bare `npx jest` fails on ESM.
- Frontend tests: `cd app-frontend && npx vitest run <path>`. **No `@vue/test-utils`, no `vue-tsc`** — never write a component-mounting test; put logic in a plain `.ts` module and test it there. Nothing type-checks, so a type error is caught by no command.
- `utils/` must never import from `views/`.
- Another session may be committing to this branch. `git add` by explicit path, never `-A`/`.`/`-a`, and check `git diff --cached --name-only` before committing.
- Line endings are mixed LF/CRLF. Compare `git diff --numstat` with `--ignore-cr-at-eol --numstat` **for your own commit**; a range spanning another session's commits shows theirs.

## What already exists, and is reused rather than rebuilt

| Already there | Where | How this plan uses it |
| --- | --- | --- |
| `sheetInfo = { sheetNumber, totalSheets }` on the DXF generator | `dxfGenerator.js:557`, label at `:130` | Pass one per sheet; the "SHEET N" line already draws |
| `sheetInfo` on the PDF title block | `pdfkitGeoPDF.js:4326` `_buildTitleBlockTexts` | Same |
| `generateTiledGeoPDF` — multi-page assembly, key plan sheet | `pdfkitGeoPDF.js:12749` | Its **page assembly** is kept; its **tile grid** is replaced |
| `buildEdgeTable` — the SI 727 outside-figure table | `ofdClipping.ts:267` | Fed by `sheetOutsideFigureVertices`, unchanged |
| The schedule builder's parcel filter | `professionalSurveyPlanExporter.ts:1456` | Given one sheet's stands, already correct |
| `nextLargerSheet` returning `'multi-sheet-required'` | `dxfScheduleHelpers.js:66` | **Nothing consumes it today.** Task 6 makes it the entry point |
| Per-project output folders, one file per artefact, 409-EXISTS prompt | `Surveyors/<surveyor>/<project>/output/<type>/` | One DXF per sheet lands here as N files |

## What this plan retires

`generateTiledGeoPDF`'s rectangular tile grid, `_filterDataToTileExtent` (`pdfkitGeoPDF.js:12614`) and `ofdClipping.ts`'s Sutherland-Hodgman clipping (`clipPolygonToTile`, `computeAllSheetOfds`, `propagateSharedBoundary`, `OfdTile`). The surveyor chose to replace rather than keep them as a fallback, so cut-based sheets become the only multi-sheet path. Task 6 removes them; Tasks 1–5 build the replacement beside them so the tree is never broken.

## What this plan does NOT cover

The **interactive split tool** — drawing the polyline on the map, previewing snaps, and persisting the cuts. That is `docs/superpowers/plans/2026-09-27-interactive-split-tool.md`. Until it ships, this plan's only source of cuts is a stored array; Task 2 reads whatever is there and Task 6 refuses politely when there is nothing.

## File Structure

| File | Responsibility |
| --- | --- |
| `app-shared/cutPointNames.js` (create) | Designations for the points a cut creates, unique against the survey's existing names. |
| `app-backend/src/services/__tests__/cutPointNames-shared.test.js` (create) | Its tests. |
| `app-frontend/src/utils/sheetPayloads.ts` (create) | One payload per sheet: number, label, wording, stands, OFD vertices and edges, servitude rows. |
| `app-frontend/src/utils/__tests__/sheetPayloads.test.ts` (create) | Its tests. |
| `app-frontend/src/utils/coordinate-list.ts` (modify) | Created points enter the list as `-` provenance rows. |
| `app-backend/src/services/pdfkitGeoPDF.js` (modify) | Pages driven by payloads; tile grid removed in Task 6. |
| `app-backend/src/services/dxfGenerator.js` (modify) | Invoked once per sheet with that sheet's payload. |
| `app-backend/src/routes/geopdf-vector.js` (modify) | The call site that chooses single vs multi-sheet. |
| `app-frontend/src/utils/ofdClipping.ts` (modify) | Tiling helpers removed in Task 6. |

---

### Task 1: Name the points a cut creates

`splitFigure` returns `newPoints` as bare `{ y, x }`. They have no identity, yet they need three: a row in the Coordinate List, an entry in the Calculations pages, and a letter in each sheet's outside-figure table. The letter is per sheet and `letterPart` already gives it. The **designation** is per point and per survey, and nothing produces it.

Spec Decision 6: they carry provenance `-`. Decision 13: they are already rounded to 2 dp — do not round again.

**Files:**
- Create: `app-shared/cutPointNames.js`
- Test: `app-backend/src/services/__tests__/cutPointNames-shared.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `nameCutPoints(newPoints, takenNames, prefix = 'C') -> Array<{ y, x, name, status }>` — one row per input point in input order, each with a designation not in `takenNames` and not repeated within the result, and `status: '-'`. The input objects are NOT mutated; new objects are returned.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/__tests__/cutPointNames-shared.test.js`:

```javascript
/**
 * app-shared/cutPointNames.js -- designations for the points a cut creates.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js cutPointNames-shared
 */
import { describe, test, expect } from '@jest/globals'
import { nameCutPoints } from '../../../../app-shared/cutPointNames.js'

const P = (y, x) => ({ y, x })

describe('nameCutPoints', () => {
  test('numbers them from 1 with the default prefix', () => {
    expect(nameCutPoints([P(1, 2), P(3, 4)], []).map((p) => p.name)).toEqual(['C1', 'C2'])
  })

  test('gives every point provenance "-", never found or placed', () => {
    // Spec Decision 6: defined by a click, so neither found nor placed.
    expect(nameCutPoints([P(1, 2)], []).map((p) => p.status)).toEqual(['-'])
  })

  test('keeps the coordinates exactly, without rounding them again', () => {
    // figureSplit already rounded these once, at creation. Rounding a second
    // time is how the outside-figure table and the Coordinate List come to
    // disagree in the last digit.
    const out = nameCutPoints([P(-85729.94, 2144164.76)], [])
    expect(out[0].y).toBe(-85729.94)
    expect(out[0].x).toBe(2144164.76)
  })

  test('does not mutate the points it was given', () => {
    const point = P(1, 2)
    nameCutPoints([point], [])
    expect(Object.keys(point).sort()).toEqual(['x', 'y'])
  })

  test('skips a designation the survey already uses', () => {
    // A survey with a beacon called C1 must not get a second C1 from the cut:
    // two rows under one designation in a lodged Coordinate List.
    expect(nameCutPoints([P(1, 2), P(3, 4)], ['C1', 'C3']).map((p) => p.name))
      .toEqual(['C2', 'C4'])
  })

  test('compares designations case-insensitively', () => {
    // 'c1' and 'C1' are the same designation to a reader.
    expect(nameCutPoints([P(1, 2)], ['c1']).map((p) => p.name)).toEqual(['C2'])
  })

  test('honours a caller-chosen prefix', () => {
    expect(nameCutPoints([P(1, 2)], [], 'SP').map((p) => p.name)).toEqual(['SP1'])
  })

  test('an empty input is an empty result, not a throw', () => {
    expect(nameCutPoints([], [])).toEqual([])
    expect(nameCutPoints(undefined, undefined)).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js cutPointNames-shared
```

Expected: FAIL — cannot find the module.

- [ ] **Step 3: Implement it**

Create `app-shared/cutPointNames.js`:

```javascript
/**
 * Designations for the points a cut creates.
 *
 * splitFigure returns newPoints as bare { y, x }. A point needs a designation
 * before it can be a row in the Coordinate List, an entry in the Calculations
 * pages, or anything a surveyor can refer to. The LETTER each sheet gives it is
 * a different thing, per sheet, and letterPart already supplies that.
 *
 * Every point returned carries provenance '-' (spec Decision 6): defined by a
 * click, so neither found nor placed. Coordinates pass through untouched --
 * figureSplit rounded them once at creation, and rounding again is how the
 * outside-figure table and the Coordinate List come to disagree in the last
 * digit.
 *
 * New objects are returned. The inputs are shared with the part rings and with
 * the caller's own figure, so writing a name onto one would travel.
 */
export function nameCutPoints(newPoints, takenNames, prefix = 'C') {
  const points = Array.isArray(newPoints) ? newPoints : []
  const taken = new Set(
    (Array.isArray(takenNames) ? takenNames : [])
      .map((n) => String(n ?? '').trim().toUpperCase())
      .filter((n) => n !== ''),
  )

  let next = 1
  return points.map((p) => {
    let name = `${prefix}${next}`
    while (taken.has(name.toUpperCase())) {
      next += 1
      name = `${prefix}${next}`
    }
    taken.add(name.toUpperCase())
    next += 1
    return { y: p.y, x: p.x, name, status: '-' }
  })
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 8 tests.

- [ ] **Step 5: Prove the collision guard is load-bearing**

Temporarily drop the `while` loop that skips a taken name. The `skips a designation the survey already uses` and `compares designations case-insensitively` tests must both fail. Restore, confirm green, and paste both outputs.

- [ ] **Step 6: Commit**

```bash
git add app-shared/cutPointNames.js app-backend/src/services/__tests__/cutPointNames-shared.test.js
git diff --cached --name-only
git commit -m "feat(sheets): designations for the points a cut creates"
```

---

### Task 2: One payload per sheet

Everything a sheet needs, assembled once, so neither renderer derives it independently. This is the task that makes the two renderers agree by construction rather than by parity test.

**Files:**
- Create: `app-frontend/src/utils/sheetPayloads.ts`
- Test: `app-frontend/src/utils/__tests__/sheetPayloads.test.ts`

**Interfaces:**
- Consumes: `splitFigure` from `app-shared/figureSplit`; `orderSheets`, `assignStands`, `letterPart`, `figureLabel`, `otherSheetsPhrase`, `standRange` from `app-shared/sheetDerivation`; `nameCutPoints` from `app-shared/cutPointNames`; `sheetOutsideFigureVertices` from `./sheetOutsideFigure`; `buildEdgeTable` from `./ofdClipping`; `statementRowsForSheet` and `buildPartyWallStatementRows` from the servitudes module.
- Produces:
  ```ts
  interface SheetPayload {
    sheetNumber: number
    totalSheets: number
    figureLabel: string          // 'Outside Figure Sheet 2', or 'Outside Figure'
    otherSheets: string          // '' for a single sheet -- see the constraint
    ring: LoPoint[]              // this sheet's part, open
    stands: string[]             // this sheet's stands, ascending
    vertices: OfdVertex[]        // lettered from A, 'cut' or 'survey'
    edges: OfdEdge[]             // from buildEdgeTable
    constants: { pointId: string; y: number; x: number }
    servitudeRows: PartyWallStatementRow[]
    standRange: string           // the WHOLE plan's range, identical on every sheet
    totalStandCount: number      // likewise
    newPoints: Array<{ y: number; x: number; name: string; status: string }>
  }
  buildSheetPayloads(input) -> { ok: true, sheets: SheetPayload[] } | { ok: false, error: string, stands?: string[], at?: LoPoint }
  ```
  `error` passes through whatever `splitFigure` or `assignStands` returned, unchanged, so the UI reports one vocabulary.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/sheetPayloads.test.ts`. Build the input from the REAL producers, not by hand — three fixtures invented on the predecessor plans could not catch the bug they were aimed at, each time because the fixture described the input instead of being taken from whatever makes it:

```typescript
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { buildSheetPayloads } from '../sheetPayloads';

const P = (y: number, x: number) => ({ y, x });
const box = (y0: number, x0: number, y1: number, x1: number) =>
  [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)];

// One figure, cut down the middle; two stands, one each side.
const ring = box(0, 0, 100, 100);
const input = () => ({
  ring,
  polyline: [P(50, 0), P(50, 100)],
  stands: [
    { name: '1686', ring: box(10, 10, 40, 40) },
    { name: '1687', ring: box(60, 10, 90, 40) },
  ],
  servitudes: [],
  standForParcel: () => undefined,
  takenNames: ['SD1', 'SD2'],
});

describe('buildSheetPayloads', () => {
  it('produces one payload per part, numbered geographically', () => {
    const out = buildSheetPayloads(input());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.sheets.map((s) => s.sheetNumber)).toEqual([1, 2]);
    expect(out.sheets.every((s) => s.totalSheets === 2)).toBe(true);
  });

  it('gives each sheet its own stands and nobody else\'s', () => {
    const out = buildSheetPayloads(input());
    if (!out.ok) throw new Error('expected ok');
    const all = out.sheets.flatMap((s) => s.stands);
    expect([...all].sort()).toEqual(['1686', '1687']);
    // Exactly one sheet each: a stand on two sheets is lodged twice.
    for (const s of out.sheets) expect(s.stands).toHaveLength(1);
  });

  it('letters each sheet from A, so one point carries two letters', () => {
    const out = buildSheetPayloads(input());
    if (!out.ok) throw new Error('expected ok');
    for (const s of out.sheets) expect(s.vertices[0].pointId).toBe('A');
    // The cut's endpoints appear on both sheets under different letters.
    const cutOn = (n: number) =>
      out.sheets[n].vertices.filter((v) => v.type === 'cut').map((v) => v.pointId);
    expect(cutOn(0)).not.toEqual(cutOn(1));
  });

  it('names the created points once for the whole plan, avoiding taken names', () => {
    const out = buildSheetPayloads({ ...input(), takenNames: ['C1'] });
    if (!out.ok) throw new Error('expected ok');
    const names = out.sheets[0].newPoints.map((p) => p.name);
    expect(names).not.toContain('C1');
    // Both sheets describe the SAME created points, so both lists agree.
    expect(out.sheets[1].newPoints.map((p) => p.name)).toEqual(names);
    expect(out.sheets[0].newPoints.every((p) => p.status === '-')).toBe(true);
  });

  it('states the whole plan\'s stand range on every sheet, not the sheet\'s own', () => {
    // multiSheetTemplate says what the sheets TOGETHER represent.
    const out = buildSheetPayloads(input());
    if (!out.ok) throw new Error('expected ok');
    for (const s of out.sheets) {
      expect(s.standRange).toBe('1686 to 1687');
      expect(s.totalStandCount).toBe(2);
    }
  });

  it('gives a single-sheet plan the plain name and no other sheets', () => {
    const out = buildSheetPayloads({ ...input(), polyline: [] });
    if (!out.ok) throw new Error('expected ok');
    expect(out.sheets).toHaveLength(1);
    expect(out.sheets[0].figureLabel).toBe('Outside Figure');
    expect(out.sheets[0].otherSheets).toBe('');
  });

  it('builds a closed edge table for each sheet', () => {
    const out = buildSheetPayloads(input());
    if (!out.ok) throw new Error('expected ok');
    for (const s of out.sheets) {
      expect(s.edges).toHaveLength(s.ring.length);
      expect(s.edges[s.edges.length - 1].side.endsWith('-A')).toBe(true);
      expect(s.edges.every((e) => e.distance > 0)).toBe(true);
    }
  });

  it('accepts a CLOSED ring, which is what GeoJSON hands a caller', () => {
    const out = buildSheetPayloads({ ...input(), ring: [...ring, P(0, 0)] });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.sheets).toHaveLength(2);
    // No duplicated vertex, which is what an unnormalised closed ring produces.
    for (const s of out.sheets) {
      const ids = s.ring.map((p) => `${p.y},${p.x}`);
      expect([...new Set(ids)].sort()).toEqual([...ids].sort());
    }
  });

  it('passes a refusal through in splitFigure\'s own words', () => {
    const sliced = buildSheetPayloads({
      ...input(),
      stands: [{ name: '1690', ring: box(40, 10, 60, 40) }],  // spans the cut
    });
    expect(sliced.ok).toBe(false);
    if (sliced.ok) return;
    expect(sliced.error).toBe('straddles-stands');
    expect(sliced.stands).toEqual(['1690']);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app-frontend && npx vitest run src/utils/__tests__/sheetPayloads.test.ts
```

Expected: FAIL — cannot resolve `../sheetPayloads`.

- [ ] **Step 3: Implement it**

Create `app-frontend/src/utils/sheetPayloads.ts`. The order of operations matters and is the whole point of the file:

1. If `polyline` has fewer than two points, there is one sheet: the figure itself, `figureLabel(1, 1)`, all stands, no created points. Return early — do not call `splitFigure` with nothing.
2. Otherwise call `splitFigure({ ring, polyline, stands, tolerance })`. On `ok: false`, return `{ ok: false, ...that }` verbatim.
3. `nameCutPoints(split.newPoints, takenNames)` **once for the whole plan**, so both sheets name the same point identically.
4. `assignStands(split.parts, stands)`. On refusal, return it verbatim.
5. `orderSheets(split.parts)` for the numbers.
6. Per part: `sheetOutsideFigureVertices(part, split.newPoints)` → `buildEdgeTable(...)`; `figureLabel`/`otherSheetsPhrase` from its number and the total; that part's stands sorted ascending; `statementRowsForSheet(buildPartyWallStatementRows(servitudes, standForParcel), thatSheetsStands)`.
7. `standRange` and `totalStandCount` from **all** stands, not the sheet's.
8. Return the payloads sorted by `sheetNumber`.

Use `letterPart` only through `sheetOutsideFigureVertices` — do not letter twice.

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 9 tests.

- [ ] **Step 5: Prove the whole-plan values are not per-sheet**

Temporarily compute `standRange` and `totalStandCount` from the sheet's own stands. The `states the whole plan's stand range on every sheet` test must fail. Restore and paste both outputs. This is the mistake the template invites, because every other field on the payload IS per sheet.

- [ ] **Step 6: Commit**

```bash
git add app-frontend/src/utils/sheetPayloads.ts app-frontend/src/utils/__tests__/sheetPayloads.test.ts
git diff --cached --name-only
git commit -m "feat(sheets): one payload per sheet, assembled once for both renderers"
```

---

### Task 3: Created points reach the Coordinate List

Spec Part 3: a created point "has coordinates, a name, a place in the Calculations pages and a row in the Coordinate List. What it does not have is a mark in the ground." The `-` provenance and its Coordinate List section already exist — the first plan built them. What is missing is the points themselves: nothing adds `newPoints` to the list.

**Files:**
- Modify: `app-frontend/src/utils/coordinate-list.ts`
- Test: `app-frontend/src/utils/__tests__/coordinateListSections.test.ts`

**Interfaces:**
- Consumes: the `newPoints` rows from `nameCutPoints` (each `{ y, x, name, status: '-' }`).
- Produces: nothing new exported. `generateCoordinateList` accepts the created points among its `adjustedCoordinates` and files them under CALCULATED POINTS via the existing `provenance === '-'` branch.

- [ ] **Step 1: Write the failing test**

The grouping already handles `-`; what needs proving is that a created point survives the whole path with its provenance and prints `-` in the F/P column. Append to `coordinateListSections.test.ts`:

```typescript
describe('a point the cut created', () => {
  it('is filed under calculated points, not placed', () => {
    const at = sectionsOf([
      { pointId: 'C1', status: '-', description: '', y: -85700, x: 2144000,
        fieldBookPage: '', calculationsPage: 101 },
    ]);
    expect(at.C1).toBe('calculated');
  });

  it('carries "-" into both the F/P and F. B cells', () => {
    // fpAndFieldBookCells decides this from the parsed provenance. A created
    // point was never visited, so neither cell has anything real to say.
    expect(fpAndFieldBookCells({
      pointId: 'C1', status: '-', description: '',
      fieldBookPage: 'E2', calculationsPage: 101,
    } as never)).toEqual({ fp: '-', fb: '-' });
  });
});
```

Add `fpAndFieldBookCells` to the file's imports.

- [ ] **Step 2: Run it**

```bash
cd app-frontend && npx vitest run src/utils/__tests__/coordinateListSections.test.ts
```

If both pass unchanged, the list already handles a created point correctly and this task is documentation only — say so in your report, add the tests anyway (they pin behaviour nothing else pins), and skip to Step 4.

- [ ] **Step 3: If either fails, fix the path it exposes**

Do not change the grouping rule or `fpAndFieldBookCells` — both were built and reviewed for exactly this case on the first plan. The fault will be upstream: something dropping `status` or not passing the created points through. Fix there.

- [ ] **Step 4: Commit**

```bash
git add app-frontend/src/utils/__tests__/coordinateListSections.test.ts app-frontend/src/utils/coordinate-list.ts
git diff --cached --name-only
git commit -m "test(sheets): a created point reaches the Coordinate List as a dash"
```

---

### Task 4: PDF pages from payloads

`generateTiledGeoPDF` already assembles a multi-page PDF with a key plan first. Its page **content** comes from a tile window; this task makes it come from a payload instead. The tile path stays in place until Task 6, so this adds a branch rather than rewriting one.

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js`
- Test: `app-backend/src/services/__tests__/pdfkitSheetPages.test.js` (create)

**Interfaces:**
- Consumes: `SheetPayload[]` (serialised over the route; plain JSON).
- Produces: `generateSheetedGeoPDF({ sheets, metadata, beacons, projection, ... }, logger) -> { pdf, pageCount }` — one page per payload, in `sheetNumber` order, each with its own figure, schedule, outside-figure table, servitude statement and its "SHEET N" chrome.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/__tests__/pdfkitSheetPages.test.js`. Assert on **rendered text**, the way `pdfkitGeoPDF.snapshot.test.js` already does, not on internals:

```javascript
/**
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitSheetPages
 */
import { describe, test, expect } from '@jest/globals'
import { generateSheetedGeoPDF } from '../pdfkitGeoPDF.js'

const P = (y, x) => ({ y, x })

/** Two sheets, as buildSheetPayloads would hand them over. */
const payloads = () => [
  {
    sheetNumber: 1, totalSheets: 2,
    figureLabel: 'Outside Figure Sheet 1', otherSheets: 'Sheet 2',
    ring: [P(50, 0), P(50, 100), P(0, 100), P(0, 0)],
    stands: ['1686'],
    vertices: [], edges: [], constants: { pointId: 'A', y: 50, x: 0 },
    servitudeRows: [], standRange: '1686 to 1687', totalStandCount: 2, newPoints: [],
  },
  {
    sheetNumber: 2, totalSheets: 2,
    figureLabel: 'Outside Figure Sheet 2', otherSheets: 'Sheet 1',
    ring: [P(50, 100), P(50, 0), P(100, 0), P(100, 100)],
    stands: ['1687'],
    vertices: [], edges: [], constants: { pointId: 'A', y: 50, x: 100 },
    servitudeRows: [], standRange: '1686 to 1687', totalStandCount: 2, newPoints: [],
  },
]

const textOf = (pdf) => Buffer.from(pdf.output ? pdf.output('arraybuffer') : pdf).toString('latin1')

describe('generateSheetedGeoPDF', () => {
  test('emits one page per sheet, plus the key plan', async () => {
    const { pageCount } = await generateSheetedGeoPDF({ sheets: payloads(), metadata: {} })
    expect(pageCount).toBe(3)
  })

  test('each page names its own sheet, not the plan', async () => {
    const { pdf } = await generateSheetedGeoPDF({ sheets: payloads(), metadata: {} })
    const raw = textOf(pdf)
    expect(raw).toContain('SHEET 1')
    expect(raw).toContain('SHEET 2')
  })

  test('a sheet carries only its own stands in its schedule', async () => {
    // The whole point of per-sheet derivation: 1687 must not appear on sheet 1.
    const { pages } = await generateSheetedGeoPDF({ sheets: payloads(), metadata: {}, returnPages: true })
    expect(pages[1]).toContain('1686')
    expect(pages[1]).not.toContain('1687')
    expect(pages[2]).toContain('1687')
    expect(pages[2]).not.toContain('1686')
  })

  test('a single-sheet plan gets no SHEET chrome and no key plan', async () => {
    const one = [{ ...payloads()[0], sheetNumber: 1, totalSheets: 1, figureLabel: 'Outside Figure', otherSheets: '' }]
    const { pageCount, pdf } = await generateSheetedGeoPDF({ sheets: one, metadata: {} })
    expect(pageCount).toBe(1)
    // A single sheet gets no sheet chrome at all -- there is no other sheet to
    // refer to, so the label would say nothing.
    expect(textOf(pdf)).not.toContain('SHEET 1')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `generateSheetedGeoPDF` is not exported.

- [ ] **Step 3: Implement it**

Reuse, do not rewrite:
- `_generateKeyPlanSheet` for the first page, fed the payloads' rings instead of a tile grid. Skip it entirely when `totalSheets === 1`.
- `_generateGeoPDFInner` per sheet, passing `sheetInfo: { sheetNumber, totalSheets }`.
  The existing title-block code draws **`SHEET N` only, and that is correct** — a
  general plan names the sheet or sheets it is read WITH, which the Seventh
  Schedule sentence already does via `{otherSheets}` ("together with the figures
  on Sheets 1 and 3"). Do NOT add a total. `totalSheets` is still needed on the
  payload, because it decides whether there is a key plan at all and which
  template the sentence uses.
- The payload's `stands` where the schedule builder wants parcels; its `edges`/`constants` where `outsideFigureData` goes; its `servitudeRows` for the servitude block.
- The figure-description sentence: `multiSheetTemplate` when `totalSheets > 1`, `template` when it is 1. **This is the single-sheet hazard from the Global Constraints — read it again before writing this line.**

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 4 tests.

- [ ] **Step 5: Render one and look at it**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitSheetPages
```
then render a two-sheet plan to disk and convert it:
```bash
pdftoppm -png -r 80 <the pdf> /tmp/sheet
```
Open both pages. Check by eye: each sheet's figure fills its drawing area, the schedule lists only that sheet's stands, the outside-figure table is headed from A, and the sentence reads correctly. **Installing poppler on this codebase previously caught two defects every suite passed** — a north arrow drawn on the scale bar, and overlapping header lines. Tests assert reserves; only a render shows collisions.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/__tests__/pdfkitSheetPages.test.js
git diff --cached --name-only
git commit -m "feat(sheets): PDF pages driven by per-sheet payloads"
```

---

### Task 5: One DXF per sheet

Spec Part 1: in PDF the plan is one document with a page per sheet; in DXF each sheet is its own file. The DXF generator already takes `sheetInfo` and draws a "SHEET N" line from it, so this task is about invoking it N times and naming the files, not about its drawing code.

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/routes/geopdf-vector.js`
- Test: `app-backend/src/services/__tests__/dxfSheetFiles.test.js` (create)

**Interfaces:**
- Produces: `generateSheetedDXF({ sheets, metadata, ... }) -> Array<{ sheetNumber, filename, dxf }>` — one entry per payload, `filename` ending `-sheet-N-of-M.dxf`, and just `.dxf` when there is one sheet.

- [ ] **Step 1: Write the failing test**

```javascript
/**
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxfSheetFiles
 */
import { describe, test, expect } from '@jest/globals'
import { generateSheetedDXF } from '../dxfGenerator.js'

const P = (y, x) => ({ y, x })
const sheet = (n, total, stands) => ({
  sheetNumber: n, totalSheets: total,
  figureLabel: total > 1 ? `Outside Figure Sheet ${n}` : 'Outside Figure',
  otherSheets: total > 1 ? `Sheet ${3 - n}` : '',
  ring: [P(0, 0), P(100, 0), P(100, 100), P(0, 100)],
  stands, vertices: [], edges: [], constants: { pointId: 'A', y: 0, x: 0 },
  servitudeRows: [], standRange: '1686 to 1687', totalStandCount: 2, newPoints: [],
})

describe('generateSheetedDXF', () => {
  test('one file per sheet, numbered in the filename', () => {
    const out = generateSheetedDXF({ sheets: [sheet(1, 2, ['1686']), sheet(2, 2, ['1687'])], metadata: {} })
    expect(out).toHaveLength(2)
    expect(out[0].filename).toMatch(/-sheet-1-of-2\.dxf$/)
    expect(out[1].filename).toMatch(/-sheet-2-of-2\.dxf$/)
  })

  test('a single-sheet plan keeps its plain filename', () => {
    const out = generateSheetedDXF({ sheets: [sheet(1, 1, ['1686'])], metadata: {} })
    expect(out).toHaveLength(1)
    expect(out[0].filename).not.toMatch(/sheet/)
  })

  test('each file carries its own sheet label and its own stands', () => {
    const out = generateSheetedDXF({ sheets: [sheet(1, 2, ['1686']), sheet(2, 2, ['1687'])], metadata: {} })
    expect(out[0].dxf).toContain('SHEET 1')
    expect(out[0].dxf).toContain('1686')
    expect(out[0].dxf).not.toContain('1687')
  })

  test('a single sheet gets no SHEET line at all', () => {
    const out = generateSheetedDXF({ sheets: [sheet(1, 1, ['1686'])], metadata: {} })
    expect(out[0].dxf).not.toContain('SHEET 1')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `generateSheetedDXF` is not exported.

- [ ] **Step 3: Implement it**

Wrap the existing single-plan DXF entry point. Pass `sheetInfo: { sheetNumber, totalSheets }` — `formatSheetLabel` (`dxfGenerator.js:130`) already returns `[]` for a single sheet, so the "no SHEET line" test passes without a special case. Then wire the route to write N files into the project's output folder, honouring the existing 409-EXISTS prompt-before-overwrite gate rather than inventing a second convention.

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 4 tests.

- [ ] **Step 5: Open one in a CAD viewer**

A DXF that parses is not a DXF that draws. Open sheet 1 and sheet 2 and check the figure, the table and the SHEET line by eye.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/routes/geopdf-vector.js app-backend/src/services/__tests__/dxfSheetFiles.test.js
git diff --cached --name-only
git commit -m "feat(sheets): one DXF file per sheet"
```

---

### Task 6: Make the ladder reach it, and retire the tiling

`nextLargerSheet` has returned `'multi-sheet-required'` at the top of the ladder since it was written, and nothing has ever consumed it. This task makes that string the entry point, and removes the grid-tiling path it supersedes.

**Files:**
- Modify: `app-backend/src/routes/geopdf-vector.js`
- Modify: `app-backend/src/services/pdfkitGeoPDF.js` (remove `generateTiledGeoPDF`, `_filterDataToTileExtent`, `_clipPolygonToExtent`)
- Modify: `app-frontend/src/utils/ofdClipping.ts` (remove `clipPolygonToTile`, `computeAllSheetOfds`, `propagateSharedBoundary`, `OfdTile`, and the now-unused `'clip'` member of the vertex union)
- Test: `app-backend/src/routes/__tests__/sheetedRouteSelection.test.js` (create)

- [ ] **Step 1: Write the failing test**

Pin the three outcomes the route must choose between:

```javascript
describe('choosing single, sheeted, or refusal', () => {
  test('a figure that fits one sheet renders single-sheet', () => { /* … */ })

  test('a figure needing multiple sheets WITH cuts renders sheeted', () => { /* … */ })

  test('a figure needing multiple sheets with NO cuts refuses, and says what to do', () => {
    // The surveyor has to draw the cuts; the tool cannot invent them, because
    // where a sheet boundary falls is a survey judgement. The message must say
    // so rather than failing silently or falling back to a tile grid.
    const r = chooseSheeting({ recommendedSheetSize: 'multi-sheet-required', cuts: [] })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('cuts-required')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

- [ ] **Step 3: Implement the selection, then remove the tiling**

Add the selection first and confirm the suite is green, then delete the tiling in a separate commit. Deleting first leaves the tree with no multi-sheet path at all.

When you remove the `'clip'` union member, `grep` for every use — `sheetOutsideFigure.ts` sets `'cut'`, and anything still reading `'clip'` must go with it.

- [ ] **Step 4: Run the backend suites that touch these files**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js "pdfkit|dxf|geopdf"
```
Expect failures in suites that exercised tiling — those are the point. Delete tests of deleted behaviour; **do not** weaken a test of behaviour that survives. Note that a full backend run reports ~8 spurious SIGTERM failures in the heavy DXF/PDF suites, so re-run a failure in isolation before believing it.

- [ ] **Step 5: Run the frontend utils suite**

```bash
cd app-frontend && npx vitest run src/utils/__tests__/ && npx vite build; echo "EXIT=$?"
```
Read the build's exit code directly, not the last line of output.

- [ ] **Step 6: Commit, in two**

```bash
git add <the selection files>
git commit -m "feat(sheets): route a multi-sheet-required plan to the cut-based path"
git add <the removals>
git commit -m "refactor(sheets): retire the grid-tiling multi-sheet path"
```

---

## Self-Review

**Spec coverage.** Part 1 (PDF one document, DXF one file per sheet) → Tasks 4, 5. Part 3 (created points in the Coordinate List) → Tasks 1, 3. Part 4 (per-sheet derivation reaching the page) → Task 2. Decisions 8 and 9 (per-sheet schedule, servitude statement, Seventh Schedule wording) → Tasks 2, 4. Decision 10 (geographic numbering) → Task 2, via `orderSheets`. Decision 11 (naming) → Task 2, via `figureLabel`. The replacement of grid tiling → Task 6.

**Not covered, deliberately.** The Calculations pages entry for a created point. Spec Part 3 requires one, but the Calculations generator is a separate document with its own pagination, and folding it in here would make Task 3 a second plan. Task 1 gives the point the designation and provenance that entry needs; add it in whichever plan next touches `calculations-part1.ts`. **This is the one place this plan knowingly leaves a spec requirement short — say so in the final review rather than letting it pass as complete.**

**Type consistency.** `SheetPayload` is the only new shape and every renderer reads the same one. `nameCutPoints` returns `{ y, x, name, status }`, which is what `coordinate-list.ts` already expects of a row. `sheetOutsideFigureVertices` returns `ofdClipping.ts`'s own `OfdVertex`, so `buildEdgeTable` is untouched throughout.

**Ordering.** Task 1 is independent. Task 2 consumes Task 1. Tasks 4 and 5 consume Task 2 and are independent of each other. Task 3 is independent of all of them. Task 6 must be last — it deletes the fallback.

**The risk worth naming.** Task 6 deletes a working path. If the cut-based path is wrong in a way the suites miss, there is nothing to fall back to. Mitigate by rendering a real two-sheet plan and looking at it (Task 4 Step 5, Task 5 Step 5) before Task 6 runs, not after.
