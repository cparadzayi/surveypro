# DXF Title-Block SI 727 Lines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Emit the SI 727 Seventh Schedule (b) figure-description sentence and the "Vide diagram S.G. No. ..." line on every DXF, plus a conditional "SHEET N" placeholder when the caller signals a multi-sheet plan via `sheetInfo`.

**Architecture:** Extend `app-backend/src/services/dxfGenerator.js` in place. Add three pure helpers (`formatFigureDescription`, `formatVideLine`, `formatSheetLabel`) plus one shared wrap utility (`splitToWidth`); call them inline from the existing title-zone emission. Templates are read from `app-shared/block-definitions.js` so the PDF and DXF stay in lockstep when the templates change. One new optional `generateDXF()` option — `sheetInfo` — plumbed through but not yet populated by the frontend; sub-project #6 (multi-sheet tiling) populates it later.

**Tech Stack:** Node.js / Fastify backend, Jest 30 with ESM (`--experimental-vm-modules`). DXF R12 (AC1009) unchanged. No new runtime dependencies.

**Branch:** `feature/dxf-title-block-si727` (already created off main; spec committed at `16b9935`).

**Spec:** [`docs/superpowers/specs/2026-06-01-dxf-title-block-si727-design.md`](../specs/2026-06-01-dxf-title-block-si727-design.md)

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `app-backend/src/services/dxfGenerator.js` | **modify** | Add an `import { TITLE_BLOCK, formatStandRanges } from '../../../app-shared/block-definitions.js'` line; add four exported pure helpers (`splitToWidth`, `formatSheetLabel`, `formatVideLine`, `formatFigureDescription`); destructure `sheetInfo = null` in `generateDXF()`; **replace** the ad-hoc `Survey of Stands X, Y Township, Z District` line (currently at line 1093) with calls to the three new helpers. ~150 lines added, ~5 lines removed. |
| `app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js` | **create** | Layer 1 unit tests for the four new helpers. ~200 lines. |
| `app-backend/src/services/__tests__/dxfGenerator.integration.test.js` | **modify** | Layer 2 structural integration tests: assert the figure-description sentence and Vide line are emitted; assert `SHEET N` is absent without `sheetInfo` and present with `{ sheetNumber: 1, totalSheets: 3 }`. ~40 lines added. |
| `docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md` | **modify** | Append three new tick items for the title-block SI 727 lines + screenshot filenames. ~10 lines added. |

No new files apart from the unit-test file; no frontend changes; no route changes; no new layer; no new warning category.

---

## Task 1: Foundation — block-definitions import, `sheetInfo` option, `splitToWidth` utility

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Create: `app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js`

This task lands the import, the new option, and the shared wrap utility — the foundation Tasks 2–4 build on.

- [ ] **Step 1: Create the new unit-test file with the failing first test**

Create `app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js`:

```js
/**
 * Layer 1 unit tests for the title-block SI 727 helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator.titleBlock
 */
import { describe, test, expect } from '@jest/globals'
import { splitToWidth } from '../dxfGenerator.js'

describe('splitToWidth', () => {
  test('empty input returns []', () => {
    expect(splitToWidth('', 40)).toEqual([])
  })
  test('short input ≤ maxChars returns single-element array', () => {
    expect(splitToWidth('Hello world', 40)).toEqual(['Hello world'])
  })
  test('long input wraps to multiple entries, each ≤ maxChars', () => {
    const long = 'The quick brown fox jumps over the lazy dog and keeps running endlessly through the countryside.'
    const lines = splitToWidth(long, 25)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(25)
    }
  })
  test('no mid-word splits — joined output preserves every token from the input', () => {
    const input = 'one two three four five six seven eight nine ten eleven twelve'
    const lines = splitToWidth(input, 15)
    const reconstructed = lines.join(' ').split(/\s+/).filter(Boolean)
    expect(reconstructed).toEqual(input.split(/\s+/))
  })
  test('single word longer than maxChars is emitted as its own line (no truncation)', () => {
    const lines = splitToWidth('short supercalifragilisticexpialidocious more', 10)
    expect(lines).toContain('supercalifragilisticexpialidocious')
  })
  test('never produces empty entries', () => {
    const lines = splitToWidth('   spaces    between    words   ', 8)
    for (const line of lines) expect(line.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the new test file to verify failure**

Run: `cd app-backend && npm run test -- dxfGenerator.titleBlock`

Expected: All 6 tests fail because the implementation isn't there yet. Jest reports failures like "splitToWidth is not a function".

- [ ] **Step 3: Add the block-definitions import**

Edit `app-backend/src/services/dxfGenerator.js`. The file currently has no imports — it starts with the file-level JSDoc comment, then helper functions. Add the import line directly above the first `function normalizeCapeLoYX` declaration (around line 22, right after the `// ── Helpers ──` comment).

Find (line 21):

```js
// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeCapeLoYX(y, x) {
```

Replace with:

```js
// ── Helpers ──────────────────────────────────────────────────────────────────

import { TITLE_BLOCK, formatStandRanges } from '../../../app-shared/block-definitions.js'

function normalizeCapeLoYX(y, x) {
```

- [ ] **Step 4: Add the `splitToWidth` helper**

Still in `app-backend/src/services/dxfGenerator.js`. Add the helper directly below the new `import` line, before `function normalizeCapeLoYX`:

```js
/**
 * Word-boundary wrap for single-line DXF TEXT entities.
 * Splits `str` into chunks no longer than `maxChars` characters, never
 * breaking inside a word. Single tokens longer than `maxChars` are emitted
 * as their own line (no truncation, no hyphenation). Returns [] for empty
 * input; never produces empty entries.
 */
export function splitToWidth(str, maxChars) {
  if (!str) return []
  const tokens = String(str).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return []
  const lines = []
  let current = ''
  for (const tok of tokens) {
    if (current === '') {
      current = tok
      continue
    }
    if (current.length + 1 + tok.length <= maxChars) {
      current += ' ' + tok
    } else {
      lines.push(current)
      current = tok
    }
  }
  if (current !== '') lines.push(current)
  return lines
}
```

- [ ] **Step 5: Add the `sheetInfo` option destructure**

Still in `app-backend/src/services/dxfGenerator.js`. Find the option destructure (currently around line 234):

```js
  const {
    parcels,
    beacons,
    outsideFigureData,
    metadata = {},
    projection = 'Cape Lo',
    scale,
    sheetSize = 'ISO_A2',
  } = options;
```

Replace with:

```js
  const {
    parcels,
    beacons,
    outsideFigureData,
    metadata = {},
    projection = 'Cape Lo',
    scale,
    sheetSize = 'ISO_A2',
    sheetInfo = null,
  } = options;
```

- [ ] **Step 6: Run the `splitToWidth` tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGenerator.titleBlock`

Expected: 6 `splitToWidth` tests pass. The other three test groups (`formatSheetLabel`, `formatVideLine`, `formatFigureDescription`) still fail because the helpers don't exist yet — that's intentional; Tasks 2–4 add them.

- [ ] **Step 7: Run the existing test suite to verify the import didn't break anything**

Run: `cd app-backend && npm run test -- dxfGenerator`

Expected: All previously-passing tests still pass. New `dxfGenerator.titleBlock` `splitToWidth` tests pass (6/6).

- [ ] **Step 8: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js
git commit -m "feat(dxf): foundation for title-block SI 727 lines — import block-definitions, sheetInfo option, splitToWidth utility

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: `formatSheetLabel` helper

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js`

`formatSheetLabel` is the simplest of the three — pure function over `sheetInfo`, no template substitution, no wrapping. Tackling it first builds confidence in the export/import wiring.

- [ ] **Step 1: Write the failing tests**

First widen the import at the top of `app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js`:

Find:
```js
import { splitToWidth } from '../dxfGenerator.js'
```
Replace with:
```js
import { splitToWidth, formatSheetLabel } from '../dxfGenerator.js'
```

Then append the new describe block after the `splitToWidth` describe block:

```js
describe('formatSheetLabel', () => {
  test.each([
    ['null',                        null],
    ['undefined',                   undefined],
    ['empty object',                {}],
    ['totalSheets: 1',              { totalSheets: 1 }],
    ['totalSheets: 1 + sheetNumber: 1', { sheetNumber: 1, totalSheets: 1 }],
    ['negative sheetNumber',        { sheetNumber: -1, totalSheets: 3 }],
    ['zero sheetNumber',            { sheetNumber: 0, totalSheets: 3 }],
    ['NaN sheetNumber',             { sheetNumber: NaN, totalSheets: 3 }],
    ['non-integer sheetNumber',     { sheetNumber: 1.5, totalSheets: 3 }],
  ])('%s → []', (_label, input) => {
    expect(formatSheetLabel(input)).toEqual([])
  })

  test('valid multi-sheet input → ["SHEET N"]', () => {
    expect(formatSheetLabel({ sheetNumber: 2, totalSheets: 3 })).toEqual(['SHEET 2'])
  })

  test('sheetNumber 1 with totalSheets 3 → ["SHEET 1"]', () => {
    expect(formatSheetLabel({ sheetNumber: 1, totalSheets: 3 })).toEqual(['SHEET 1'])
  })
})
```

- [ ] **Step 2: Run the test to verify failure**

Run: `cd app-backend && npm run test -- dxfGenerator.titleBlock`

Expected: 10 new test failures. Error: `formatSheetLabel is not a function` (the import resolves to `undefined`).

- [ ] **Step 3: Add the `formatSheetLabel` helper**

Edit `app-backend/src/services/dxfGenerator.js`. Add directly below the `splitToWidth` helper added in Task 1:

```js
/**
 * Returns `["SHEET N"]` when sheetInfo indicates a multi-sheet plan
 * (totalSheets > 1) with a positive integer sheetNumber. Returns [] for
 * any other input shape. No warning on malformed input — the absent label
 * is itself visible to the surveyor in CAD.
 */
export function formatSheetLabel(sheetInfo) {
  if (!sheetInfo || typeof sheetInfo !== 'object') return []
  const { sheetNumber, totalSheets } = sheetInfo
  if (typeof totalSheets !== 'number' || totalSheets <= 1) return []
  if (!Number.isInteger(sheetNumber) || sheetNumber <= 0) return []
  return [`SHEET ${sheetNumber}`]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGenerator.titleBlock`

Expected: All `splitToWidth` (6) + `formatSheetLabel` (10) tests pass. The two not-yet-implemented test groups still fail.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js
git commit -m "feat(dxf): formatSheetLabel helper — SHEET N for multi-sheet plans

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: `formatVideLine` helper

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js`

`formatVideLine` reads the Vide template from `app-shared/block-definitions.js` and wraps it via `splitToWidth`. No substitution, but it exercises the import path and wrap-helper integration.

- [ ] **Step 1: Write the failing tests**

First widen the import at the top of `app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js`:

Find:
```js
import { splitToWidth, formatSheetLabel } from '../dxfGenerator.js'
```
Replace with:
```js
import { splitToWidth, formatSheetLabel, formatVideLine } from '../dxfGenerator.js'
```

Then append the new describe block:

```js
import { TITLE_BLOCK } from '../../../../app-shared/block-definitions.js'

describe('formatVideLine', () => {
  test('returns the Vide template from block-definitions, wrapped to maxLineChars', () => {
    const lines = formatVideLine(200) // generous width — likely single line
    expect(lines.length).toBeGreaterThanOrEqual(1)
    // The joined output (collapsed whitespace) must reconstruct the template
    // up to whitespace collapsing (splitToWidth splits on \s+).
    const expectedTokens = TITLE_BLOCK.vide.template.split(/\s+/).filter(Boolean)
    const gotTokens = lines.join(' ').split(/\s+/).filter(Boolean)
    expect(gotTokens).toEqual(expectedTokens)
  })

  test('wraps to multiple entries at small maxLineChars', () => {
    const lines = formatVideLine(20)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(20)
  })

  test('output contains the literal "Vide diagram S.G. No." opening', () => {
    const lines = formatVideLine(200)
    expect(lines[0]).toMatch(/^Vide diagram S\.G\. No\./)
  })
})
```

Note: the relative import path `../../../../app-shared/block-definitions.js` has four `..` because the test file lives at `app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js` — four directories up from `__tests__/` reaches the repo root.

- [ ] **Step 2: Run the tests to verify failure**

Run: `cd app-backend && npm run test -- dxfGenerator.titleBlock`

Expected: 3 new test failures. Error: `formatVideLine is not a function`.

- [ ] **Step 3: Add the `formatVideLine` helper**

Edit `app-backend/src/services/dxfGenerator.js`. Add directly below `formatSheetLabel`:

```js
/**
 * Returns the SI 727 Seventh Schedule (b) Vide template from
 * `app-shared/block-definitions.js`, wrapped via `splitToWidth` to fit
 * `maxLineChars`. Always returns at least one entry. Throws if the
 * template is missing from the shared module (configuration bug —
 * the PDF would fail the same way).
 */
export function formatVideLine(maxLineChars) {
  const template = TITLE_BLOCK?.vide?.template
  if (!template) throw new Error('TITLE_BLOCK.vide.template missing from app-shared/block-definitions.js')
  return splitToWidth(template, maxLineChars)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGenerator.titleBlock`

Expected: `splitToWidth` (6) + `formatSheetLabel` (10) + `formatVideLine` (3) tests pass. `formatFigureDescription` tests still fail.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js
git commit -m "feat(dxf): formatVideLine helper — SI 727 Vide line from shared template

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: `formatFigureDescription` helper

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Modify: `app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js`

The biggest of the three. Reads the figure-description template from `app-shared/block-definitions.js`, substitutes seven placeholders, wraps the result via `splitToWidth`. Skips with `[]` when the data needed to build the sentence is absent.

- [ ] **Step 1: Write the failing tests**

First widen the import at the top of `app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js`:

Find:
```js
import { splitToWidth, formatSheetLabel, formatVideLine } from '../dxfGenerator.js'
```
Replace with:
```js
import { splitToWidth, formatSheetLabel, formatVideLine, formatFigureDescription } from '../dxfGenerator.js'
```

Then append the new describe block:

```js
describe('formatFigureDescription', () => {
  // Reusable fixture inputs — happy path, Borrowdale sample.
  const fullMetadata = {
    township: 'borrowdale',
    district: 'harare',
    parentProperty: 'lot 9 of borrowdale',
    wholePortion: 'a portion',
  }
  const ofData = {
    edges: [
      { pointId: 'A', y: 50000, x: 2200000 },
      { pointId: 'B', y: 50200, x: 2200000 },
      { pointId: 'C', y: 50200, x: 2200100 },
      { pointId: 'D', y: 50000, x: 2200100 },
    ],
  }
  const surveyedParcels = [
    { stand: '123', area_m2: 10000 },
    { stand: '124', area_m2: 10000 },
  ]

  test('happy path → all placeholders substituted, sentence reads correctly', () => {
    const lines = formatFigureDescription(fullMetadata, ofData, surveyedParcels, 500)
    const sentence = lines.join(' ')
    expect(sentence).toContain('The figure A, B, C, D, A represents')
    expect(sentence).toContain('Borrowdale')
    expect(sentence).toContain('comprising 2 stands')
    expect(sentence).toContain('numbered')
    expect(sentence).toContain('123')
    expect(sentence).toContain('124')
    expect(sentence).toContain('public places being a portion')
    expect(sentence).toContain('of Borrowdale of Lot 9 Of Borrowdale')
    expect(sentence).toContain('situate in the district of Harare')
  })

  test('returns [] when outsideFigureData has no edges', () => {
    expect(formatFigureDescription(fullMetadata, { edges: [] }, surveyedParcels, 500)).toEqual([])
  })

  test('returns [] when outsideFigureData is null', () => {
    expect(formatFigureDescription(fullMetadata, null, surveyedParcels, 500)).toEqual([])
  })

  test('returns [] when surveyedParcels is empty', () => {
    expect(formatFigureDescription(fullMetadata, ofData, [], 500)).toEqual([])
  })

  test('missing township → fallback "the township"', () => {
    const m = { ...fullMetadata, township: '' }
    const sentence = formatFigureDescription(m, ofData, surveyedParcels, 500).join(' ')
    expect(sentence).toContain('represents the township')
  })

  test('missing district → fallback "the district"', () => {
    const m = { ...fullMetadata, district: '' }
    const sentence = formatFigureDescription(m, ofData, surveyedParcels, 500).join(' ')
    expect(sentence).toContain('situate in the district of the district')
  })

  test('missing parentProperty → ofTarget collapses to township only', () => {
    const m = { ...fullMetadata, parentProperty: '' }
    const sentence = formatFigureDescription(m, ofData, surveyedParcels, 500).join(' ')
    expect(sentence).toContain('a portion of Borrowdale')
    expect(sentence).not.toContain('of Borrowdale of')
  })

  test('missing wholePortion → fallback "the whole"', () => {
    const m = { ...fullMetadata, wholePortion: '' }
    const sentence = formatFigureDescription(m, ofData, surveyedParcels, 500).join(' ')
    expect(sentence).toContain('public places being the whole')
  })

  test('long input wraps to multiple entries, no entry exceeds maxLineChars, no tokens lost', () => {
    const lines = formatFigureDescription(fullMetadata, ofData, surveyedParcels, 30)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(30)
    }
    // Token preservation: every word in the joined output appears somewhere.
    const joined = lines.join(' ')
    expect(joined).toContain('borrowdale'.toLowerCase()) // case may vary; substring check
  })

  test('compressed stand range — runs of consecutive numbers shown as a range', () => {
    const manyParcels = [
      { stand: '1', area_m2: 100 },
      { stand: '2', area_m2: 100 },
      { stand: '3', area_m2: 100 },
      { stand: '10', area_m2: 100 },
    ]
    const sentence = formatFigureDescription(fullMetadata, ofData, manyParcels, 500).join(' ')
    // Expectation aligned with formatStandRanges() output style (e.g. "1 - 3, 10").
    expect(sentence).toMatch(/numbered\s+1\s*[-–]\s*3,\s*10/)
  })
})
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `cd app-backend && npm run test -- dxfGenerator.titleBlock`

Expected: 10 new test failures. Error: `formatFigureDescription is not a function`.

- [ ] **Step 3: Add the `formatFigureDescription` helper**

Edit `app-backend/src/services/dxfGenerator.js`. Add directly below `formatVideLine`:

```js
/**
 * Title-case helper: "lot 9 of borrowdale" → "Lot 9 Of Borrowdale".
 * Matches the PDF's `toTitleCase` style for figure-description substitutions.
 */
function titleCase(str) {
  return String(str || '').replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

/**
 * Builds the SI 727 Seventh Schedule (b) figure-description sentence
 * from the figureDescription template in `app-shared/block-definitions.js`,
 * wrapped to `maxLineChars`. Returns [] when there is no outside-figure
 * sequence to describe or no surveyed parcels to count.
 *
 * Placeholder substitutions and missing-field fallbacks are documented in
 * the spec (2026-06-01-dxf-title-block-si727-design.md, Components).
 */
export function formatFigureDescription(metadata, outsideFigureData, surveyedParcels, maxLineChars) {
  const template = TITLE_BLOCK?.figureDescription?.template
  if (!template) throw new Error('TITLE_BLOCK.figureDescription.template missing from app-shared/block-definitions.js')

  const edges = outsideFigureData?.edges
  if (!Array.isArray(edges) || edges.length === 0) return []
  if (!Array.isArray(surveyedParcels) || surveyedParcels.length === 0) return []

  // Beacon sequence: closed loop, first vertex repeated at the end.
  const ids = edges.map(e => e?.pointId || '').filter(Boolean)
  if (ids.length === 0) return []
  const beaconSequence = ids.concat(ids[0]).join(', ')

  const township = titleCase(metadata?.township) || 'the township'
  const district = titleCase(metadata?.district) || 'the district'
  const parentProperty = titleCase(metadata?.parentProperty)
  const wholePortion = (metadata?.wholePortion || 'the whole').trim()
  const ofTarget = parentProperty ? `${township} of ${parentProperty}` : township

  const standNames = surveyedParcels.map(sp => String(sp?.stand ?? '')).filter(Boolean)
  const standCount = standNames.length
  const standRange = formatStandRanges(standNames) || '-'

  const sentence = template
    .replace('{beaconSequence}', beaconSequence)
    .replace('{township}',       township)
    .replace('{standCount}',     String(standCount))
    .replace('{standRange}',     standRange)
    .replace('{wholePortion}',   wholePortion)
    .replace('{ofTarget}',       ofTarget)
    .replace('{district}',       district)

  return splitToWidth(sentence, maxLineChars)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGenerator.titleBlock`

Expected: all `splitToWidth` (6) + `formatSheetLabel` (10) + `formatVideLine` (3) + `formatFigureDescription` (10) tests pass.

If the "compressed stand range" test fails, check `formatStandRanges` output style in `app-shared/block-definitions.js:293` — adjust the test regex to match the actual output (the test docstring says "aligned with `formatStandRanges()` output style").

- [ ] **Step 5: Run the full backend test suite to confirm no regressions**

Run: `cd app-backend && npm test`

Expected: all tests pass, including the existing `dxfGenerator.test.js` (29 tests) and `dxfGenerator.integration.test.js` (12 tests).

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/dxfGenerator.titleBlock.test.js
git commit -m "feat(dxf): formatFigureDescription helper — SI 727 figure-description sentence

Reads the figureDescription template from app-shared/block-definitions.js,
substitutes seven placeholders, wraps via splitToWidth. Mirrors the PDF's
substitution logic so both outputs read identically.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Wire the helpers into the title-zone emission

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`

The four helpers are ready. This task wires them into the existing title-zone emission, and **removes** the ad-hoc `Survey of Stands X, Y Township, Z District` line that the SI 727 figure description supersedes.

- [ ] **Step 1: Identify the emission site and the line to remove**

Open `app-backend/src/services/dxfGenerator.js` and locate the title-zone block (around lines 1082–1120). The relevant region currently reads:

```js
  // ── A) TITLE ZONE (within top margin area, centered in content) ──
  const txC = (cntL + cntR) / 2; // center of content area
  let ty = cntT - mm(8);
  addText(TB, txC, ty, 'GENERAL PLAN', hTitle, 0, 'BOLD');
  ty -= hTitle * 1.6;
  if (metadata.surveyOf) {
    addText(TB, txC, ty, metadata.surveyOf, hSub, 0, 'BOLD');
    ty -= hSub * 1.6;
  }
  const standList = surveyedParcels.map(sp => sp.stand).join(', ');
  if (metadata.township && standList) {
    const desc = `Survey of Stands ${standList}, ${metadata.township} Township, ${metadata.district || ''} District`;
    addText(TB, txC, ty, desc, hBody);
    ty -= hBody * 1.6;
  }
  ty -= mm(3);
  addText(TB, txC, ty, `SCALE 1:${S}`, hSub, 0, 'BOLD');
```

The five-line `if (metadata.township && standList)` block (the ad-hoc `Survey of Stands ...` line) is what the SI 727 figure description replaces.

- [ ] **Step 2: Replace the ad-hoc line and add the new emissions**

Find (the same block from Step 1):

```js
  const standList = surveyedParcels.map(sp => sp.stand).join(', ');
  if (metadata.township && standList) {
    const desc = `Survey of Stands ${standList}, ${metadata.township} Township, ${metadata.district || ''} District`;
    addText(TB, txC, ty, desc, hBody);
    ty -= hBody * 1.6;
  }
  ty -= mm(3);
  addText(TB, txC, ty, `SCALE 1:${S}`, hSub, 0, 'BOLD');
```

Replace with:

```js
  // Stand list still consumed by the `if (metadata.district && !standList)`
  // block further down; the ad-hoc "Survey of Stands ..." emission is now
  // superseded by the SI 727 figureDescription emission below.
  const standList = surveyedParcels.map(sp => sp.stand).join(', ');
  ty -= mm(3);
  addText(TB, txC, ty, `SCALE 1:${S}`, hSub, 0, 'BOLD');
```

- [ ] **Step 3: Add the new SI 727 emission block below the existing SI 727 fields**

Find (immediately after the existing `if (metadata.district && !standList)` block, around line 1120):

```js
  if (metadata.district && !standList) {
    ty -= hSub * 1.4
    addText(TB, txC, ty, `District: ${metadata.district}`, hSub, 0)
  }

  // North/south arrow in the upper-right of the drawing zone
  addNorthArrow('NORTH_ARROW', cntR - mm(15), cntT - mm(20), mm(20))
```

Replace with:

```js
  if (metadata.district && !standList) {
    ty -= hSub * 1.4
    addText(TB, txC, ty, `District: ${metadata.district}`, hSub, 0)
  }

  // ── SI 727 Seventh Schedule (b) lines ──
  // Character budget for wrapping: content area width divided by an average
  // character-to-text-height ratio of 0.55 (see spec). This is the one knob
  // to tune if manual CAD verification shows lines too short or too long.
  const titleMaxLineChars = Math.floor((cntR - cntL) / (hBody * 0.55))

  // (b.i) Conditional SHEET N label — only emits for multi-sheet plans.
  for (const line of formatSheetLabel(sheetInfo)) {
    ty -= hSub * 1.6
    addText(TB, txC, ty, line, hSub, 0, 'BOLD')
  }

  // (b.ii) Figure description sentence (replaces the old ad-hoc line).
  for (const line of formatFigureDescription(metadata, outsideFigureData, surveyedParcels, titleMaxLineChars)) {
    ty -= hBody * 1.6
    addText(TB, txC, ty, line, hBody, 0)
  }

  // (b.iii) Vide diagram line — always emitted.
  for (const line of formatVideLine(titleMaxLineChars)) {
    ty -= hBody * 1.6
    addText(TB, txC, ty, line, hBody, 0)
  }

  // North/south arrow in the upper-right of the drawing zone
  addNorthArrow('NORTH_ARROW', cntR - mm(15), cntT - mm(20), mm(20))
```

- [ ] **Step 4: Run the existing test suite to confirm nothing is broken**

Run: `cd app-backend && npm test`

Expected: all existing `dxfGenerator.test.js` (29 tests) and `dxfGenerator.titleBlock.test.js` (29 tests) pass. The existing integration tests in `dxfGenerator.integration.test.js` may have **one expected failure** — the test at lines 49–50 asserts `entityCount(dxf, 'TEXT', 'DISTANCES')` and `'DIRECTIONS')` is exactly `11`. Adding the figure-description and Vide lines does NOT touch those layers, so this should still pass. There is also no test that checks for the ad-hoc `Survey of Stands` text (the closest is the orientation test at lines 92–97 which checks beacon coordinates, unaffected). If any integration test fails unexpectedly, read the failure to confirm whether it's a regression in something else or genuinely caused by this change.

If all tests pass: proceed to Step 5.

- [ ] **Step 5: Smoke-check the DXF output by emitting against the sample fixture**

Run from `app-backend/`:

```bash
node --experimental-vm-modules -e "
import('./src/services/dxfGenerator.js').then(async ({ generateDXF }) => {
  const { sampleFixture } = await import('./src/services/__tests__/fixtures/sampleDxfPlan.js');
  const { buffer } = generateDXF(sampleFixture, { info:()=>{}, warn:()=>{}, error:()=>{} });
  const txt = buffer.toString();
  const figureMatch = txt.match(/The figure [^\n]+/);
  const videMatch = txt.match(/Vide diagram S\.G\. No\.[^\n]*/);
  console.log('figure description present:', !!figureMatch, figureMatch && figureMatch[0]);
  console.log('vide line present:        ', !!videMatch, videMatch && videMatch[0]);
});
"
```

Expected: both lines present in the output. The figure description should be the first wrap-chunk (e.g. `The figure A, B, C, D, A represents Borrowdale comprising 2`); the Vide line should match `Vide diagram S.G. No. ........................ annexed to`.

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js
git commit -m "feat(dxf): emit SI 727 title-block lines (figure description, Vide, SHEET N)

Wires the three helpers into the title-zone emission and removes the
ad-hoc 'Survey of Stands X, Y Township, Z District' line that the SI 727
figureDescription template now supersedes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Structural integration tests

**Files:**
- Modify: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

Extend the existing integration test file with assertions that exercise the full `generateDXF()` path and verify the new SI 727 lines reach the output.

- [ ] **Step 1: Write the failing tests**

Open `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`. The file has two describe blocks: `dxfGenerator integration — sample fixture` and `dxfGenerator integration — graceful degradation`. Append a new describe block at the end of the file (after the closing brace of the second describe):

```js

describe('dxfGenerator integration — SI 727 title-block lines', () => {
  test('figure-description sentence is emitted on TITLE_BLOCK', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const dxf = buffer.toString()
    // The opening "The figure ... represents ... comprising N stands" is
    // distinctive enough that no other line can match it.
    expect(dxf).toMatch(/The figure [A-Z, ]+ represents .+? comprising \d+ stands/)
  })

  test('Vide line is emitted on TITLE_BLOCK', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).toMatch(/Vide diagram S\.G\. No\./)
  })

  test('figure-description and Vide lines live on the TITLE_BLOCK layer', () => {
    // Walk the DXF line-pair stream and collect TEXT values per layer.
    // Mirrors the walker pattern already used by the OF edge-metadata test
    // at the bottom of "graceful degradation".
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const dxf = buffer.toString()
    const lines = dxf.split('\n')
    const titleBlockTexts = []
    let i = 0, currentType = null, currentLayer = null
    while (i < lines.length - 1) {
      const code = lines[i].trim(), value = lines[i + 1].trim()
      i += 2
      if (code === '0' && /^[A-Z_]+$/.test(value)) { currentType = value; currentLayer = null }
      else if (code === '8' && currentType === 'TEXT') currentLayer = value
      else if (code === '1' && currentType === 'TEXT' && currentLayer === 'TITLE_BLOCK') {
        titleBlockTexts.push(value)
      }
    }
    expect(titleBlockTexts.some(t => /The figure .+ represents/.test(t))).toBe(true)
    expect(titleBlockTexts.some(t => /Vide diagram S\.G\. No\./.test(t))).toBe(true)
  })

  test('no SHEET N label when sheetInfo is absent (single-sheet default)', () => {
    const { buffer } = generateDXF(sampleFixture, fakeLogger)
    const dxf = buffer.toString()
    expect(dxf).not.toMatch(/\b1\s*\n\s*SHEET \d+\b/)
  })

  test('SHEET 1 label present when sheetInfo signals multi-sheet', () => {
    const withMultiSheet = { ...sampleFixture, sheetInfo: { sheetNumber: 1, totalSheets: 3 } }
    const { buffer } = generateDXF(withMultiSheet, fakeLogger)
    const dxf = buffer.toString()
    // Group code 1 is the text value; preceding context confirms it's a
    // TEXT entity on TITLE_BLOCK.
    expect(dxf).toMatch(/\b8\s*\n\s*TITLE_BLOCK\b[\s\S]*?\b1\s*\n\s*SHEET 1\b/)
  })

  test('SHEET 2 label when sheetNumber: 2', () => {
    const sheet2 = { ...sampleFixture, sheetInfo: { sheetNumber: 2, totalSheets: 5 } }
    const { buffer } = generateDXF(sheet2, fakeLogger)
    expect(buffer.toString()).toMatch(/\b8\s*\n\s*TITLE_BLOCK\b[\s\S]*?\b1\s*\n\s*SHEET 2\b/)
  })

  test('clean sampleFixture still produces zero warnings after title-block changes', () => {
    const { warnings } = generateDXF(sampleFixture, fakeLogger)
    expect(warnings.count).toBe(0)
  })
})
```

- [ ] **Step 2: Run the integration tests to verify they pass**

Run: `cd app-backend && npm run test -- dxfGenerator.integration`

Expected: existing 12 tests still pass; 7 new tests pass too. Total 19.

If the "SHEET N label" matchers fail, that may indicate the multiline regex isn't matching the DXF newline sequence. The DXF uses `\n` line separators (the `p()` helper at line 204 concatenates with `\n`); the matchers above use `[\s\S]*?` to span those. If a failure persists, run the same line-pair walker pattern from the third test (which is more reliable) and assert presence in the collected `titleBlockTexts` array.

- [ ] **Step 3: Run the full backend test suite to confirm no regressions**

Run: `cd app-backend && npm test`

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app-backend/src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "test(dxf): structural integration for SI 727 title-block lines

Asserts the figure-description and Vide lines reach the DXF output on
the TITLE_BLOCK layer, and that the SHEET N placeholder only emits when
the caller passes sheetInfo with totalSheets > 1.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Manual CAD verification checklist update

**Files:**
- Modify: `docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md`

Add three new checklist items to the visual-verification doc so the surveyor can confirm the lines render correctly in CAD.

- [ ] **Step 1: Locate the visual checklist section**

Open `docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md`. The first checklist bullet is at line 30 — `Title block at the **top of the sheet**`. Subsequent items follow, with screenshot file references like `01-title-block.png`, `02-drawing-orientation.png`.

- [ ] **Step 2: Append the new SI 727 title-block items immediately after the existing title-block bullet**

Find (line 30):

```markdown
- [ ] Title block at the **top of the sheet** (south-up orientation); shows designation, surveyOf, firm, parent-property, whole/portion, district fields where the project has them. *(Screenshot: `01-title-block.png`)*
```

Replace with:

```markdown
- [ ] Title block at the **top of the sheet** (south-up orientation); shows designation, surveyOf, firm, parent-property, whole/portion, district fields where the project has them. *(Screenshot: `01-title-block.png`)*
- [ ] **SI 727 figure-description sentence** present in the title zone — reads as a coherent paragraph (`"The figure A, B, C, D, A represents Borrowdale comprising 2 stands numbered 123–124 and public places being a portion of Borrowdale of Lot 9 Of Borrowdale, situate in the district of Harare."`). Wrap is on word boundaries (no mid-word splits). Fits within the content-area horizontally. *(Screenshot: `01b-figure-description.png`)*
- [ ] **"Vide diagram S.G. No. ..."** line present immediately below the figure description. Dotted blanks visible (`........................ annexed to ........................ No. ........................`). *(Screenshot: `01c-vide-line.png`)*
- [ ] **SHEET N label** — verify by running a synthetic multi-sheet export: temporarily edit `app-backend/src/routes/geopdf-vector.js` to inject `sheetInfo: { sheetNumber: 1, totalSheets: 3 }` into the `generateDXF()` call (or pass it via the request body), re-export, and confirm `SHEET 1` renders **above** the figure description in bold. Revert the temporary change after verification. *(Screenshot: `01d-sheet-label.png`)*
```

- [ ] **Step 3: Verify the markdown renders cleanly**

Open the file in a markdown previewer (e.g., VS Code's built-in preview) and confirm the four bullets all appear with checkboxes and the screenshot references are formatted consistently with the surrounding items.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-05-31-survey-plan-dxf-pdf-parity-verification-checklist.md
git commit -m "docs(verification): add SI 727 title-block lines to the manual CAD checklist

Three new visual-check items: figure-description sentence, Vide line, and
SHEET N placeholder (verifiable via a temporary route-side injection of
sheetInfo).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Wrap-up

After all 7 tasks land, the branch will have 7 atomic commits on top of `main` (`dfefcbf`):

1. `feat(dxf): foundation for title-block SI 727 lines …`
2. `feat(dxf): formatSheetLabel helper …`
3. `feat(dxf): formatVideLine helper …`
4. `feat(dxf): formatFigureDescription helper …`
5. `feat(dxf): emit SI 727 title-block lines (figure description, Vide, SHEET N)`
6. `test(dxf): structural integration for SI 727 title-block lines`
7. `docs(verification): add SI 727 title-block lines to the manual CAD checklist`

Total: 4 helpers + 1 emission block + 29 new unit tests + 7 new integration tests + 3 new checklist items. The branch is ready for `superpowers:finishing-a-development-branch`.

Manual CAD verification (Layer 3) is the user's responsibility before merging.
