# Per-Sheet Derivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Given the parts a cut divides the outside figure into, derive everything each sheet states about itself — its sheet number, its stands, its lettering, its Seventh Schedule sentence and its servitude statement — or refuse, naming the stand that cannot be placed.

**Architecture:** One new pure module, `app-shared/sheetDerivation.js`, holding the ordering, assignment and lettering rules. It consumes `app-shared/figureSplit.js`'s part rings and produces per-sheet data; it renders nothing and reads nothing. Two small frontend modules wire it to table builders that already exist and are already correct (`buildEdgeTable` for the outside-figure table, `buildPartyWallStatementRows` for servitudes) — this plan changes what they are given, not what they do.

**Tech Stack:** Plain ES modules (`app-shared` is `"type": "module"`). Jest for the shared module (run from `app-backend`), Vitest for the frontend wiring.

**Spec:** `docs/superpowers/specs/2026-09-26-multi-sheet-outside-figure-split-design.md`

**Predecessor:** `docs/superpowers/plans/2026-09-26-figure-split-geometry.md` — complete. Read `app-shared/figureSplit.js`'s module docstring and `splitFigure`'s docstring before starting; they carry contracts this plan depends on.

## Global Constraints

- **Coordinate convention:** every point is `{ y, x }` in Lo metres — `y` easting, `x` southing — matching `coordinate_points` rows. Never `{ x, y }` PDF points.
- **Each stand appears on exactly one sheet.** A stand on none, or on two, is a refusal — never a silent choice. This is the rule the retired grid-tiling path got wrong: bounding-box assignment against overlapping tiles could place one stand on two sheets, and its area would be counted twice in the total.
- **Sheets are numbered geographically**, north to south then west to east, by part centroid (spec Decision 10). Numbers are **derived from the current parts, never stored**.
- **Naming:** on a multi-part plan each part is `Outside Figure Sheet N`; on a single-sheet plan the figure is plain `Outside Figure` (spec Decision 11). Both satisfy the existing `includes('outside figure')` predicate, so no recognition rule changes.
- **Each sheet carries the schedule for its own stands**, and its servitude statement for its own stands (spec Decision 8).
- **Each sheet is worded per SI 727 Seventh Schedule (b)**, using the existing `multiSheetTemplate` at `app-shared/block-definitions.js:235` (spec Decision 9). Do not write a new sentence.
- **Points the cut created carry provenance `-`** and are already rounded to 2 dp by `figureSplit`. Never re-round a coordinate this plan receives, and never round a surveyed one.
- **Part rings share point objects** with each other, with `newPoints`, and with the caller's ring. Never letter by writing a property onto a point — key a map by index or identity. `splitFigure`'s docstring states this; it is the single most likely way to break spec Part 4.
- `app-shared` modules are tested from `app-backend` via
  `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>`.
  Bare `npx jest` fails on ESM.
- Frontend tests: `cd app-frontend && npx vitest run <path>`. There is **no `@vue/test-utils` and no `vue-tsc`** in this repo — never write a component-mounting test, and put view logic in a plain `.ts` module so it can be tested there.
- `utils/` must never import from `views/`.
- **Another session may be committing to this branch.** `git add` your files by explicit path — never `git add -A`, `git add .`, or `git commit -a` — and check `git diff --cached --name-only` before committing. Leave unrelated modified files alone.
- Line endings: the repo is mixed LF/CRLF. Confirm `git diff --numstat` agrees with `git diff --ignore-cr-at-eol --numstat` for **your own commit** — a range spanning another session's commits will show their CRLF, not yours.

## What this plan does NOT cover

- **Rendering.** No PDF page, no DXF file, no sheet furniture. That is the next plan, which will retire `generateTiledGeoPDF`'s grid tiling and drive pages from this plan's output instead.
- **The interactive split tool.** Drawing the polyline on the map is the plan after that.
- **Retiring `ofdClipping.ts`'s Sutherland-Hodgman clipping.** It becomes dead when tiling goes, which is the rendering plan's job. This plan leaves it in place and does not call it.

## Decision recorded before this plan was written

A rectangular grid-tiling multi-sheet path already exists and is wired up (`generateTiledGeoPDF` at `pdfkitGeoPDF.js:12749`, `_filterDataToTileExtent` at `:12614`, `ofdClipping.ts`). The surveyor chose to **replace** it rather than keep it as a fallback: cut-based sheets become the only multi-sheet path. So this plan's assignment rule does not have to coexist with bounding-box assignment, and a stand landing on two sheets is a refusal rather than a tie to break.

## File Structure

| File | Responsibility |
| --- | --- |
| `app-shared/sheetDerivation.js` (create) | Ordering, assignment, lettering, wording. The only new production module. |
| `app-backend/src/services/__tests__/sheetDerivation-shared.test.js` (create) | Its tests, following the `figureSplit-shared.test.js` convention. |
| `app-frontend/src/utils/sheetOutsideFigure.ts` (create) | Turns a part ring into the `OfdVertex[]` that `buildEdgeTable` already consumes. |
| `app-frontend/src/utils/__tests__/sheetOutsideFigure.test.ts` (create) | Its tests. |
| `app-frontend/src/utils/ofdClipping.ts` (modify) | Widen `OfdVertex.type` / `OfdEdge.fromType` by one value. Nothing else. |
| `app-frontend/src/views/modules/cadastral-standard/servitudes.ts` (modify) | One exported filter: the statement rows for a given set of stands. |
| `app-frontend/src/views/modules/cadastral-standard/__tests__/servitudes.test.ts` (modify) | Cover it. |

---

### Task 1: Geographic sheet ordering

Spec Decision 10. A reader holding three sheets expects them to run north to south, then west to east — and `generateTiledGeoPDF` already numbers its tiles that way, so this is also what the renderer will expect.

A plain sort on centroid `x` then `y` does not express "north to south then west to east". Two parts side by side would be ordered by whichever centroid southing happened to be smaller, so a left-right pair could come back as 1 and 2 in either order on a millimetre's difference. Parts must first be grouped into **bands** that share a north–south range, then ordered west to east within a band.

**Files:**
- Create: `app-shared/sheetDerivation.js`
- Test: `app-backend/src/services/__tests__/sheetDerivation-shared.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `centroid(ring) -> { y, x }` — area-weighted centroid of an open ring.
  - `orderSheets(parts) -> number[]` — for each part, in input order, its 1-based sheet number.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/__tests__/sheetDerivation-shared.test.js`:

```javascript
/**
 * app-shared/sheetDerivation.js -- what each sheet states about itself.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js sheetDerivation-shared
 */
import { describe, test, expect } from '@jest/globals'
import { centroid, orderSheets } from '../../../../app-shared/sheetDerivation.js'

const P = (y, x) => ({ y, x })
/** An open box from (y0,x0) to (y1,x1), in ring order. */
const box = (y0, x0, y1, x1) => [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)]

describe('centroid', () => {
  test('finds the middle of a square', () => {
    const c = centroid(box(0, 0, 100, 100))
    expect(c.y).toBeCloseTo(50, 9)
    expect(c.x).toBeCloseTo(50, 9)
  })

  test('is area-weighted, not the mean of the vertices', () => {
    // An L-shape. The vertex mean and the area centroid differ, and only the
    // area centroid is inside the figure.
    const L = [P(0, 0), P(90, 0), P(90, 30), P(30, 30), P(30, 90), P(0, 90)]
    const c = centroid(L)
    const vertexMeanY = (0 + 90 + 90 + 30 + 30 + 0) / 6
    expect(c.y).not.toBeCloseTo(vertexMeanY, 3)
  })
})

describe('orderSheets', () => {
  test('a single part is sheet 1', () => {
    expect(orderSheets([box(0, 0, 100, 100)])).toEqual([1])
  })

  test('runs north to south', () => {
    // x is southing, so the smaller x is further north.
    const north = box(0, 0, 100, 50)
    const south = box(0, 50, 100, 100)
    expect(orderSheets([south, north])).toEqual([2, 1])
  })

  test('runs west to east within one band', () => {
    // Same southing range, so one band; y is easting, so the smaller y is west.
    const west = box(0, 0, 50, 100)
    const east = box(50, 0, 100, 100)
    expect(orderSheets([east, west])).toEqual([2, 1])
  })

  test('bands first, then west to east inside each band', () => {
    // Two rows of two, handed over scrambled. This is the test a plain
    // lexicographic sort fails.
    const nw = box(0, 0, 50, 50)
    const ne = box(50, 0, 100, 50)
    const sw = box(0, 50, 50, 100)
    const se = box(50, 50, 100, 100)
    expect(orderSheets([se, nw, sw, ne])).toEqual([4, 1, 3, 2])
  })

  test('every part gets exactly one number, and they are 1..n', () => {
    const parts = [box(0, 0, 40, 40), box(40, 0, 80, 40), box(0, 40, 40, 80)]
    const order = orderSheets(parts)
    expect([...order].sort()).toEqual([1, 2, 3])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js sheetDerivation-shared
```

Expected: FAIL — `Cannot find module '../../../../app-shared/sheetDerivation.js'`.

- [ ] **Step 3: Implement it**

Create `app-shared/sheetDerivation.js`:

```javascript
/**
 * What each sheet of a multi-part general plan states about itself.
 *
 * Every point here is { y, x } in Lo metres -- y easting, x southing -- the same
 * shape figureSplit.js produces and a coordinate_points row carries.
 *
 * This module consumes the part rings splitFigure returns. Those rings share
 * point OBJECTS with each other and with the caller's figure, so nothing here
 * writes to a point; lettering comes back as a separate array.
 *
 * See docs/superpowers/specs/2026-09-26-multi-sheet-outside-figure-split-design.md
 */

/**
 * Area-weighted centroid of an open ring.
 *
 * Not the mean of the vertices: on an L-shaped figure that lands in the notch,
 * outside the figure, and a sheet ordered by it would sort by where its corners
 * happen to be rather than where its land is.
 */
export function centroid(ring) {
  let twiceArea = 0
  let cy = 0
  let cx = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j]
    const b = ring[i]
    const cross = a.y * b.x - b.y * a.x
    twiceArea += cross
    cy += (a.y + b.y) * cross
    cx += (a.x + b.x) * cross
  }
  if (twiceArea === 0) {
    // A degenerate ring has no area to weight by. Fall back to the mean so this
    // can never return NaN into a sort comparator.
    const n = ring.length || 1
    return {
      y: ring.reduce((s, p) => s + p.y, 0) / n,
      x: ring.reduce((s, p) => s + p.x, 0) / n,
    }
  }
  return { y: cy / (3 * twiceArea), x: cx / (3 * twiceArea) }
}

function southingRange(ring) {
  let min = Infinity
  let max = -Infinity
  for (const p of ring) {
    if (p.x < min) min = p.x
    if (p.x > max) max = p.x
  }
  return { min, max }
}

/**
 * The sheet number for each part, in the order the parts were given.
 *
 * Spec Decision 10: north to south, then west to east. Those are two orderings,
 * and one sort cannot express both -- two parts side by side would be ordered by
 * whichever centroid southing was smaller, so a left-right pair could come out
 * either way on a millimetre. Parts are therefore BANDED first: two share a band
 * when their southing ranges overlap, which needs no sheet size to decide. Bands
 * run north to south; parts run west to east inside a band.
 */
export function orderSheets(parts) {
  const described = parts.map((ring, index) => ({
    index,
    c: centroid(ring),
    range: southingRange(ring),
  }))

  const northFirst = [...described].sort((a, b) => a.c.x - b.c.x)

  const bands = []
  for (const part of northFirst) {
    const band = bands[bands.length - 1]
    const overlaps = band && part.range.min <= band.max && part.range.max >= band.min
    if (overlaps) {
      band.parts.push(part)
      band.min = Math.min(band.min, part.range.min)
      band.max = Math.max(band.max, part.range.max)
    } else {
      bands.push({ parts: [part], min: part.range.min, max: part.range.max })
    }
  }

  const sheetOf = new Array(parts.length)
  let sheet = 1
  for (const band of bands) {
    for (const part of [...band.parts].sort((a, b) => a.c.y - b.c.y)) {
      sheetOf[part.index] = sheet++
    }
  }
  return sheetOf
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js sheetDerivation-shared
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Prove the banding is load-bearing**

Temporarily replace `orderSheets`' body with a plain lexicographic sort:

```javascript
  return parts
    .map((ring, index) => ({ index, c: centroid(ring) }))
    .sort((a, b) => a.c.x - b.c.x || a.c.y - b.c.y)
    .reduce((out, p, i) => { out[p.index] = i + 1; return out }, new Array(parts.length))
```

Run the suite. The two-rows-of-two test must fail. Restore, confirm green again, and paste both outputs in your report. If the lexicographic version passes everything, the fixtures are not testing the banding and the test needs fixing, not the code.

- [ ] **Step 6: Commit**

```bash
git add app-shared/sheetDerivation.js app-backend/src/services/__tests__/sheetDerivation-shared.test.js
git diff --cached --name-only   # must list exactly those two
git commit -m "feat(sheets): number the parts north to south, then west to east"
```

---

### Task 2: Put every stand on exactly one sheet

Spec Decision 8. A sheet's schedule is the schedule of that sheet's stands, so assignment is what makes the schedule correct — and a stand placed twice is lodged twice, with its area counted twice in the total.

**Files:**
- Modify: `app-shared/sheetDerivation.js`
- Test: `app-backend/src/services/__tests__/sheetDerivation-shared.test.js`

**Interfaces:**
- Consumes: `pointInRing` from `app-shared/figureSplit.js`; `centroid` from Task 1.
- Produces: `assignStands(parts, stands) -> { ok: true, bySheet: string[][] } | { ok: false, error: 'stand-off-plan' | 'stand-straddles-sheets', stands: string[] }`. A stand is `{ name, ring, isPublicPlace? }` — the same shape `standsCrossedBy` takes, so a caller builds one list for both. `bySheet[i]` holds the names on the part at index `i`, in the order the stands were given.

- [ ] **Step 1: Write the failing test**

Append to `sheetDerivation-shared.test.js`, adding `assignStands` to the import list:

```javascript
describe('assignStands', () => {
  const west = box(0, 0, 50, 100)
  const east = box(50, 0, 100, 100)
  const parts = [west, east]
  const stand = (name, y0, x0, y1, x1, extra = {}) =>
    ({ name, ring: box(y0, x0, y1, x1), ...extra })

  test('puts each stand on the part that holds it', () => {
    const r = assignStands(parts, [
      stand('1686', 10, 10, 20, 20),
      stand('1687', 60, 10, 70, 20),
    ])
    expect(r).toEqual({ ok: true, bySheet: [['1686'], ['1687']] })
  })

  test('keeps the order the stands were given', () => {
    const r = assignStands(parts, [
      stand('1687', 30, 10, 40, 20),
      stand('1686', 10, 10, 20, 20),
    ])
    expect(r.bySheet[0]).toEqual(['1687', '1686'])
  })

  test('refuses a stand no part holds, naming it', () => {
    const r = assignStands(parts, [stand('9999', 200, 200, 210, 210)])
    expect(r).toEqual({ ok: false, error: 'stand-off-plan', stands: ['9999'] })
  })

  test('refuses a stand two parts hold, naming it', () => {
    // A stand spanning the cut. standsCrossedBy refuses such a cut, so reaching
    // this means an earlier rule failed -- which is why it is caught rather than
    // resolved by picking a side.
    const r = assignStands(parts, [stand('1690', 40, 10, 60, 20)])
    expect(r).toEqual({ ok: false, error: 'stand-straddles-sheets', stands: ['1690'] })
  })

  test('names every unplaceable stand, not just the first', () => {
    const r = assignStands(parts, [
      stand('9998', 200, 200, 210, 210),
      stand('1686', 10, 10, 20, 20),
      stand('9999', 300, 300, 310, 310),
    ])
    expect(r.ok).toBe(false)
    expect(r.stands).toEqual(['9998', '9999'])
  })

  test('an unplaceable public place is skipped, not refused', () => {
    // Roads are not digitised yet -- the same reason Decision 7 exempts them
    // from the straddle rule. Refusing would block every split in a township.
    const r = assignStands(parts, [
      stand('1686', 10, 10, 20, 20),
      { name: 'Road', isPublicPlace: true },
    ])
    expect(r).toEqual({ ok: true, bySheet: [['1686'], []] })
  })

  test('a non-public stand with no usable ring is still refused', () => {
    const r = assignStands(parts, [{ name: 'NoRing' }])
    expect(r).toEqual({ ok: false, error: 'stand-off-plan', stands: ['NoRing'] })
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `assignStands is not a function`.

- [ ] **Step 3: Implement it**

Add this import at the top of `app-shared/sheetDerivation.js`:

```javascript
import { pointInRing } from './figureSplit.js'
```

Append:

```javascript
/**
 * Whether `part` holds the stand bounded by `ring`.
 *
 * Any vertex inside is enough, and the centroid is checked too so a stand larger
 * than the part it sits in is still placed. A stand cannot legitimately be half
 * in: standsCrossedBy refuses a cut that would slice one, so a stand matching two
 * parts is a symptom, not a case to resolve.
 */
function partHolds(part, ring) {
  return ring.some((p) => pointInRing(part, p)) || pointInRing(part, centroid(ring))
}

/**
 * Which stands belong to which part.
 *
 * Each must land on exactly one. On none means the figure does not cover the
 * survey; on two means a slicing cut got through. Both refuse, naming EVERY
 * offending stand rather than the first, so the surveyor fixes the survey once
 * instead of meeting the next one on the next attempt.
 *
 * A PUBLIC PLACE with no usable ring is skipped rather than refused. Roads are
 * not digitised yet -- the same fact behind Decision 7's exemption -- and
 * refusing every split in a township until they are would make the tool
 * unusable. A non-public stand with no ring is still a refusal: that is missing
 * survey data, not an absent road.
 */
export function assignStands(parts, stands) {
  const bySheet = parts.map(() => [])
  const unplaceable = []
  const holderCount = new Map()

  for (const stand of stands ?? []) {
    if (!stand) continue
    const usable = Array.isArray(stand.ring) && stand.ring.length >= 3
    if (!usable) {
      if (stand.isPublicPlace === true) continue
      unplaceable.push(stand.name)
      holderCount.set(stand.name, 0)
      continue
    }

    const holders = []
    for (let i = 0; i < parts.length; i++) {
      if (partHolds(parts[i], stand.ring)) holders.push(i)
    }
    holderCount.set(stand.name, holders.length)

    if (holders.length === 1) bySheet[holders[0]].push(stand.name)
    else unplaceable.push(stand.name)
  }

  if (unplaceable.length > 0) {
    // Which error it is depends on how the FIRST offender failed: no part held
    // it, or more than one did. Counted while assigning, so this does not redo
    // the containment work.
    const straddles = (holderCount.get(unplaceable[0]) ?? 0) > 1
    return {
      ok: false,
      error: straddles ? 'stand-straddles-sheets' : 'stand-off-plan',
      stands: unplaceable,
    }
  }

  return { ok: true, bySheet }
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 14 tests.

- [ ] **Step 5: Prove the two refusals are distinguishable**

Temporarily make `assignStands` return `'stand-off-plan'` unconditionally. The straddle test must fail and nothing else. Restore, confirm green, paste both outputs.

- [ ] **Step 6: Commit**

```bash
git add app-shared/sheetDerivation.js app-backend/src/services/__tests__/sheetDerivation-shared.test.js
git diff --cached --name-only
git commit -m "feat(sheets): place every stand on exactly one sheet, or refuse and name it"
```

---

### Task 3: Letter each part independently

Spec Part 4: *"Each part letters its own figure independently from A … The same physical points therefore appear in two outside-figure tables under two different letters."*

This is the task the shared-object aliasing traps. A part ring holds the same point objects as the other part and as the caller's figure, so writing a letter onto a point would give the second part's letter to the first and mutate the surveyor's own figure on the way past. Lettering is returned as an array, never applied.

A township outside figure can exceed 26 vertices. `String.fromCharCode(65 + i)` — the fallback at `pdfkitGeoPDF.js:9214` — yields `[` at 26 and must not be copied.

**Files:**
- Modify: `app-shared/sheetDerivation.js`
- Test: `app-backend/src/services/__tests__/sheetDerivation-shared.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `vertexLetter(index) -> string` — `A`…`Z`, then `AA`, `AB`… for a 0-based index.
  - `letterPart(part) -> string[]` — the letter for each vertex by position; index `i` is the letter for `part[i]`.

- [ ] **Step 1: Write the failing test**

Append, adding both names to the import list:

```javascript
describe('vertexLetter', () => {
  test('runs A to Z', () => {
    expect(vertexLetter(0)).toBe('A')
    expect(vertexLetter(25)).toBe('Z')
  })

  test('continues past Z instead of running into punctuation', () => {
    // String.fromCharCode(65 + 26) is '[', which is what the old fallback did.
    expect(vertexLetter(26)).toBe('AA')
    expect(vertexLetter(27)).toBe('AB')
    expect(vertexLetter(51)).toBe('AZ')
    expect(vertexLetter(52)).toBe('BA')
  })
})

describe('letterPart', () => {
  test('letters one part from A, by position', () => {
    expect(letterPart(box(0, 0, 10, 10))).toEqual(['A', 'B', 'C', 'D'])
  })

  test('letters each part from A independently, and touches no point', () => {
    // Spec Part 4: the SAME physical point carries a different letter on each
    // sheet. Both parts here hold the object `shared`.
    const shared = P(50, 0)
    const partA = [P(0, 0), shared, P(50, 100), P(0, 100)]
    const partB = [shared, P(100, 0), P(100, 100), P(50, 100)]

    expect(letterPart(partA)[1]).toBe('B')
    expect(letterPart(partB)[0]).toBe('A')
    // The point itself is untouched -- no letter written anywhere on it.
    expect(Object.keys(shared).sort()).toEqual(['x', 'y'])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `vertexLetter is not a function`.

- [ ] **Step 3: Implement it**

Append:

```javascript
/**
 * The letter for a 0-based vertex position: A..Z, then AA, AB, ...
 *
 * A developed township's outside figure runs past 26 vertices. The fallback
 * elsewhere in this codebase is String.fromCharCode(65 + i), which yields '[' at
 * 26 -- do not copy it.
 */
export function vertexLetter(index) {
  let n = index
  let out = ''
  do {
    out = String.fromCharCode(65 + (n % 26)) + out
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return out
}

/**
 * The letter for each vertex of ONE part, by position.
 *
 * Returned as an array rather than written onto the points, because a part ring
 * shares its point objects with the other part and with the caller's figure.
 * Spec Part 4 requires the same physical point to carry a different letter on
 * each sheet, which is exactly what annotating a shared object cannot do: the
 * second part would overwrite the first, and the surveyor's own figure would be
 * mutated too. Index this array with the vertex's position.
 */
export function letterPart(part) {
  return part.map((_, i) => vertexLetter(i))
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add app-shared/sheetDerivation.js app-backend/src/services/__tests__/sheetDerivation-shared.test.js
git diff --cached --name-only
git commit -m "feat(sheets): letter each part from A without touching the shared points"
```

---

### Task 4: The Seventh Schedule sentence for a sheet

Spec Decision 9. The wording already exists as `multiSheetTemplate` at `app-shared/block-definitions.js:235`:

```
The figure {figureLabel} which, together with the figures on {otherSheets},
represents {township} comprising {totalStandCount} stands numbered {standRange}
and public places being {wholePortion} of {ofTarget}, situate in the district of
{district}.
```

This task fills the placeholders that vary. Note what they mean: `{totalStandCount}` and `{standRange}` describe **the whole plan**, not this sheet — the sentence says what the sheets *together* represent. Only `{figureLabel}` and `{otherSheets}` are per sheet.

**Files:**
- Modify: `app-shared/sheetDerivation.js`
- Test: `app-backend/src/services/__tests__/sheetDerivation-shared.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `figureLabel(sheetNumber, totalSheets) -> string` — `Outside Figure Sheet 2`, or plain `Outside Figure` when `totalSheets` is 1 (spec Decision 11).
  - `otherSheetsPhrase(sheetNumber, totalSheets) -> string` — `Sheet 2`, `Sheets 2 and 3`, `Sheets 1, 2, 4 and 5`. Empty string when there are none.
  - `standRange(names) -> string` — `1686 to 1699` from the numeric extremes, or the single name when there is one.

- [ ] **Step 1: Write the failing test**

Append, adding the three names to the import list:

```javascript
describe('figureLabel', () => {
  test('a single-sheet plan keeps the plain name', () => {
    expect(figureLabel(1, 1)).toBe('Outside Figure')
  })

  test('a multi-part plan names its sheet', () => {
    expect(figureLabel(2, 3)).toBe('Outside Figure Sheet 2')
  })

  test('both forms still satisfy the outside-figure predicate', () => {
    // parcelValidation.ts and designationParcels.ts recognise an outside figure
    // by that substring alone, so neither form changes a recognition rule.
    for (const label of [figureLabel(1, 1), figureLabel(2, 3)]) {
      expect(label.toLowerCase().includes('outside figure')).toBe(true)
    }
  })
})

describe('otherSheetsPhrase', () => {
  test('a single-sheet plan has no others', () => {
    expect(otherSheetsPhrase(1, 1)).toBe('')
  })

  test('names the one other sheet', () => {
    expect(otherSheetsPhrase(1, 2)).toBe('Sheet 2')
  })

  test('joins two others with "and"', () => {
    expect(otherSheetsPhrase(2, 3)).toBe('Sheets 1 and 3')
  })

  test('commas the rest and "and"s the last', () => {
    expect(otherSheetsPhrase(3, 5)).toBe('Sheets 1, 2, 4 and 5')
  })
})

describe('standRange', () => {
  test('states the numeric extremes', () => {
    expect(standRange(['1690', '1686', '1699'])).toBe('1686 to 1699')
  })

  test('a single stand is not a range', () => {
    expect(standRange(['1686'])).toBe('1686')
  })

  test('sorts as numbers, not as text', () => {
    // A string sort puts 1720 before 87, and 100 before 99.
    expect(standRange(['87', '1720', '100'])).toBe('87 to 1720')
  })

  test('a lettered stand ranges on its number', () => {
    expect(standRange(['2833A', '2469'])).toBe('2469 to 2833A')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Expected: FAIL — `figureLabel is not a function`.

- [ ] **Step 3: Implement it**

Append:

```javascript
/** Spec Decision 11. Both forms contain "outside figure", so the substring
 *  predicate every consumer uses keeps working unchanged. */
export function figureLabel(sheetNumber, totalSheets) {
  return totalSheets > 1 ? `Outside Figure Sheet ${sheetNumber}` : 'Outside Figure'
}

/** The other sheets this one is read with, for multiSheetTemplate's
 *  {otherSheets}. Empty when there are none. */
export function otherSheetsPhrase(sheetNumber, totalSheets) {
  const others = []
  for (let n = 1; n <= totalSheets; n++) if (n !== sheetNumber) others.push(String(n))
  if (others.length === 0) return ''
  if (others.length === 1) return `Sheet ${others[0]}`
  return `Sheets ${others.slice(0, -1).join(', ')} and ${others[others.length - 1]}`
}

/**
 * The plan's stand range, for {standRange}.
 *
 * Compared as NUMBERS: this survey carries 87 and 1720 together, and a string
 * sort reads 1720 before 87, and 100 before 99. A stand with a letter sorts on
 * its number first, so 2833A follows 2469.
 */
export function standRange(names) {
  const sorted = [...names].sort((a, b) => {
    const na = parseInt(a, 10)
    const nb = parseInt(b, 10)
    if (Number.isNaN(na) || Number.isNaN(nb)) return String(a).localeCompare(String(b))
    return na !== nb ? na - nb : String(a).localeCompare(String(b))
  })
  if (sorted.length === 0) return ''
  if (sorted.length === 1) return String(sorted[0])
  return `${sorted[0]} to ${sorted[sorted.length - 1]}`
}
```

- [ ] **Step 4: Run it and watch it pass**

Expected: PASS, 29 tests.

- [ ] **Step 5: Commit**

```bash
git add app-shared/sheetDerivation.js app-backend/src/services/__tests__/sheetDerivation-shared.test.js
git diff --cached --name-only
git commit -m "feat(sheets): fill the Seventh Schedule sentence for each sheet"
```

---

### Task 5: A sheet's own servitude statement

Spec Decision 8. `buildPartyWallStatementRows` at `servitudes.ts:250` already builds the statement correctly from the servitude records; this task filters its output to one sheet's stands.

Filtering the **rows** rather than the servitudes is deliberate. A row's `stands` field already merges the two stands a party wall joins, and a wall between stands on different sheets is a boundary of both, so it belongs on both statements — which a servitude-level filter would get wrong in one direction.

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/servitudes.ts`
- Test: `app-frontend/src/views/modules/cadastral-standard/__tests__/servitudes.test.ts`

**Interfaces:**
- Consumes: `PartyWallStatementRow` (already exported).
- Produces: `statementRowsForSheet(rows: PartyWallStatementRow[], sheetStands: string[]): PartyWallStatementRow[]` — the rows naming at least one of `sheetStands`, in the order given.

- [ ] **Step 1: Write the failing test**

Append to `app-frontend/src/views/modules/cadastral-standard/__tests__/servitudes.test.ts`, adding `statementRowsForSheet` to its import list:

```typescript
describe('statementRowsForSheet', () => {
  const rows = [
    { stands: '1686 and 1687', boundary: 'A-B' },
    { stands: '1690 and 1691', boundary: 'C-D' },
    { stands: '1687 and 1690', boundary: 'E-F' },
  ]

  it('keeps the rows naming one of this sheet\'s stands', () => {
    expect(statementRowsForSheet(rows, ['1686', '1687'])).toEqual([
      { stands: '1686 and 1687', boundary: 'A-B' },
      { stands: '1687 and 1690', boundary: 'E-F' },
    ])
  })

  it('puts a wall between two sheets on BOTH of them', () => {
    // 1687 is on sheet 1, 1690 on sheet 2, and the wall between them is a
    // boundary of each -- so each sheet's statement carries it. Filtering the
    // servitudes instead of the rows would drop it from one side.
    const sheet1 = statementRowsForSheet(rows, ['1686', '1687'])
    const sheet2 = statementRowsForSheet(rows, ['1690', '1691'])

    expect(sheet1).toContainEqual({ stands: '1687 and 1690', boundary: 'E-F' })
    expect(sheet2).toContainEqual({ stands: '1687 and 1690', boundary: 'E-F' })
  })

  it('matches whole stand names, not substrings', () => {
    const tricky = [{ stands: '1686 and 16860', boundary: 'A-B' }]
    expect(statementRowsForSheet(tricky, ['168'])).toEqual([])
    expect(statementRowsForSheet(tricky, ['16860'])).toEqual(tricky)
  })

  it('a sheet with no servitudes gets no rows', () => {
    expect(statementRowsForSheet(rows, ['9999'])).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app-frontend && npx vitest run src/views/modules/cadastral-standard/__tests__/servitudes.test.ts
```

Expected: FAIL — `statementRowsForSheet is not a function`.

- [ ] **Step 3: Implement it**

Append to `servitudes.ts`:

```typescript
/**
 * The party-wall statement rows a given sheet must carry (spec Decision 8).
 *
 * Filters the ROWS, not the servitudes. A row's `stands` already merges the two
 * stands a wall joins, and a wall between stands on different sheets is a
 * boundary of both, so it belongs on both statements; filtering servitudes by
 * their subject would drop it from one side.
 *
 * Matches whole names: '168' must not match stand 1686, and 1686 must not match
 * 16860.
 */
export function statementRowsForSheet(
  rows: PartyWallStatementRow[],
  sheetStands: string[],
): PartyWallStatementRow[] {
  const wanted = new Set(sheetStands.map((s) => String(s).trim()))
  return rows.filter((row) =>
    String(row.stands)
      .split(/\s+and\s+|,\s*/)
      .map((name) => name.trim())
      .some((name) => wanted.has(name)),
  )
}
```

- [ ] **Step 4: Run it and watch it pass**

```bash
cd app-frontend && npx vitest run src/views/modules/cadastral-standard/__tests__/servitudes.test.ts
```

Expected: PASS, with every pre-existing test in that file still passing.

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/servitudes.ts app-frontend/src/views/modules/cadastral-standard/__tests__/servitudes.test.ts
git diff --cached --name-only
git commit -m "feat(sheets): give each sheet the servitude rows its own stands need"
```

---

### Task 6: A sheet's outside-figure table

`buildEdgeTable` at `ofdClipping.ts:267` already builds the SI 727 outside-figure table from an ordered vertex array, and it does not care where the vertices came from. This task converts a part ring into the `OfdVertex[]` it consumes, so the existing builder produces a per-sheet table with no change to it.

`OfdVertex.type` is `'survey' | 'clip'`, where `'clip'` meant *auto-generated at a tile boundary by Sutherland-Hodgman*. A point the cut created is the analogous thing under the new model, but `'clip'` names a mechanism being retired, so a third value `'cut'` is added rather than overloading it. `'clip'` stays until the rendering plan removes tiling.

**Files:**
- Create: `app-frontend/src/utils/sheetOutsideFigure.ts`
- Modify: `app-frontend/src/utils/ofdClipping.ts` (widen two unions only)
- Test: `app-frontend/src/utils/__tests__/sheetOutsideFigure.test.ts`

**Interfaces:**
- Consumes: `OfdVertex` and `buildEdgeTable` from `./ofdClipping`; `letterPart` from
  `app-shared/sheetDerivation`. Import it WITHOUT the `.js` extension — that is the
  convention every existing frontend import of `app-shared` uses (`cadastral-csv.ts:20`,
  `coordinate-list.ts:7`), and it is what Vite resolves here. The backend Jest tests
  import the same module WITH `.js`, because Node's ESM resolver requires it.
- Produces: `sheetOutsideFigureVertices(part, newPoints) -> OfdVertex[]` — one vertex per point of the part, lettered from A by position, typed `'cut'` when the point is one the cut created and `'survey'` otherwise.

- [ ] **Step 1: Write the failing test**

Create `app-frontend/src/utils/__tests__/sheetOutsideFigure.test.ts`:

```typescript
// @vitest-environment happy-dom
//
// Turning a part ring into the vertex array the existing SI 727 edge-table
// builder already consumes. That builder does not change; only what it is given.

import { describe, it, expect } from 'vitest';
import { sheetOutsideFigureVertices } from '../sheetOutsideFigure';
import { buildEdgeTable } from '../ofdClipping';

const P = (y: number, x: number) => ({ y, x });

describe('sheetOutsideFigureVertices', () => {
  it('letters the part from A, by position', () => {
    const part = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)];
    expect(sheetOutsideFigureVertices(part, []).map((v) => v.pointId))
      .toEqual(['A', 'B', 'C', 'D']);
  });

  it('marks a point the cut created, by identity not coordinate', () => {
    // splitFigure returns the SAME objects in the part ring and in newPoints, so
    // identity is exact. A coordinate comparison would need an epsilon and would
    // misclassify a beacon surveyed to 3 dp as created.
    const created = P(50, 0);
    const part = [created, P(0, 0), P(0, 100)];

    expect(sheetOutsideFigureVertices(part, [created]).map((v) => v.type))
      .toEqual(['cut', 'survey', 'survey']);
  });

  it('does not mark a distinct point that merely shares a coordinate', () => {
    const created = P(50, 0);
    const lookalike = P(50, 0);
    const part = [lookalike, P(0, 0), P(0, 100)];

    expect(sheetOutsideFigureVertices(part, [created])[0].type).toBe('survey');
  });

  it('feeds the existing edge-table builder unchanged', () => {
    const part = [P(0, 0), P(100, 0), P(100, 100), P(0, 100)];
    const { edges, constants } = buildEdgeTable(sheetOutsideFigureVertices(part, []));

    expect(edges).toHaveLength(4);
    expect(edges[0].side).toBe('A-B');
    expect(edges[3].side).toBe('D-A');     // closes back to the first vertex
    expect(constants.pointId).toBe('A');
  });

  it('letters past Z for a township figure', () => {
    const part = Array.from({ length: 28 }, (_, i) => P(i, i * 2));
    const ids = sheetOutsideFigureVertices(part, []).map((v) => v.pointId);

    expect(ids[25]).toBe('Z');
    expect(ids[26]).toBe('AA');
    expect(ids[27]).toBe('AB');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd app-frontend && npx vitest run src/utils/__tests__/sheetOutsideFigure.test.ts
```

Expected: FAIL — cannot resolve `../sheetOutsideFigure`.

- [ ] **Step 3: Widen the vertex type**

In `app-frontend/src/utils/ofdClipping.ts`, replace `OfdVertex.type`'s declaration with:

```typescript
  /**
   * survey = real survey/coordinate point from the project
   * cut    = created by a figure split, so it carries provenance '-'
   * clip   = auto-generated at a tile boundary by S-H clipping (grid tiling,
   *          being retired -- see the per-sheet derivation plan)
   */
  type: 'survey' | 'cut' | 'clip'
```

and widen `OfdEdge.fromType` to the same union.

- [ ] **Step 4: Implement it**

Create `app-frontend/src/utils/sheetOutsideFigure.ts`:

```typescript
/**
 * One sheet's outside figure, in the shape the existing SI 727 edge-table
 * builder already wants.
 *
 * `buildEdgeTable` is agnostic about where its vertices came from, so a per-sheet
 * table needs no new builder -- only a conversion from the part ring splitFigure
 * returns. The lettering restarts at A on every sheet, which is spec Part 4: the
 * same physical point appears in two sheets' tables under two different letters.
 */
import { letterPart } from '../../../app-shared/sheetDerivation'
import type { OfdVertex } from './ofdClipping'

interface LoPoint {
  y: number
  x: number
}

export function sheetOutsideFigureVertices(
  part: LoPoint[],
  newPoints: LoPoint[],
): OfdVertex[] {
  // A Set of the actual OBJECTS. splitFigure returns the same objects in the part
  // ring and in newPoints, so identity is exact -- where a coordinate comparison
  // would need an epsilon and would misclassify a beacon surveyed to 3 dp as a
  // created point.
  const created = new Set<LoPoint>(newPoints)
  const letters = letterPart(part)

  return part.map((p, i) => ({
    id: `${i}`,
    pointId: letters[i],
    y: p.y,
    x: p.x,
    type: created.has(p) ? 'cut' : 'survey',
  }))
}
```

- [ ] **Step 5: Run it and watch it pass**

```bash
cd app-frontend && npx vitest run src/utils/__tests__/sheetOutsideFigure.test.ts
```

Expected: PASS, 5 tests.

- [ ] **Step 6: Check the widened union broke nothing**

```bash
cd app-frontend && npx vitest run src/utils/__tests__/
```

Every pre-existing test must still pass. Then confirm the build still compiles:

```bash
cd app-frontend && npx vite build; echo "EXIT=$?"
```

Read that **exit code**, not the last line of output. A previous task on this codebase reported a passing build from `tail`'s exit code while the build had in fact failed.

- [ ] **Step 7: Commit**

```bash
git add app-frontend/src/utils/sheetOutsideFigure.ts app-frontend/src/utils/__tests__/sheetOutsideFigure.test.ts app-frontend/src/utils/ofdClipping.ts
git diff --cached --name-only
git commit -m "feat(sheets): build each sheet's outside-figure table from its own part"
```

---

## Self-Review

**Spec coverage of Part 4.** Sheet numbering (Decision 10) → Task 1. Stands per sheet (Decision 8) → Task 2. Lettering (Part 4) → Task 3. Seventh Schedule wording (Decision 9) and naming (Decision 11) → Task 4. Servitude statement (Decision 8) → Task 5. Outside-figure data table → Task 6.

**Deliberately not covered, and why.** The *schedule of areas* rows are not built here. `professionalSurveyPlanExporter.ts:1456` already filters parcels and builds that table, and once Task 2 hands it one sheet's stands the existing builder is correct unchanged — a new builder would be a second way to make the same table, which is exactly the drift this codebase has been paying down elsewhere. The rendering plan wires it.

**Type consistency.** `assignStands` takes the same `{ name, ring, isPublicPlace? }` shape as `figureSplit.js`'s `standsCrossedBy`, deliberately, so a caller builds one stand list for both rules. `sheetOutsideFigureVertices` returns `ofdClipping.ts`'s own `OfdVertex`, so `buildEdgeTable` needs no change. `letterPart` is imported by both the shared module's tests and the frontend, which is why it lives in `app-shared` rather than beside the frontend conversion.

**Known gap carried from the predecessor.** `splitFigure` returns part rings and `newPoints` but no *identity* for a created point — no name, no Calculations-page entry, no Coordinate List row. Task 6 letters them for the outside-figure table, which is what that table needs, but a created point must still reach the Coordinate List as a `-` provenance row. That wiring belongs to the rendering plan, where the Coordinate List is assembled; it is recorded here so it is not lost between the two.

**Ordering.** Tasks 1–4 append to one module in sequence and must run in order. Task 5 is independent. Task 6 consumes Task 3.
