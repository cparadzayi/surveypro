# Diagram Template Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the SurveyPro cadastral Diagram PDF with the SG reference template — SI 727 number formatting, vertex-letter beacon description, a two-directional scale bar, larger fonts, road-width labels, and "Constants".

**Architecture:** A new pure `formatSI` helper feeds the sides-table model and the renderer's width labels; `buildBeaconDescription` switches from station names to vertex letters; the `diagramPdf.js` renderer gets discrete text, scale-bar, and font edits; the frontend classifier modal enables the width field for roads. Backend pure helpers are TDD; renderer visuals are gated by the existing valid-PDF Jest guard plus manual visual acceptance against the template.

**Tech Stack:** Node ESM, PDFKit (built-in Helvetica), Jest (ESM runner), Vue 3 + TypeScript.

## Global Constraints

- Backend is ESM (`"type": "module"`). Run backend Jest as (from `app-backend`):
  `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>` — bare `npx jest` fails.
- **SI number format:** comma decimal separator, space between thousands groups; signed values prefix `"+ "` / `"- "` (sign then a space). Examples verbatim: `122,96`, `1 234,50`, `- 82 360,81`, `+ 2 156 833,10`, `+ 0,00`, `9 000`.
- PDFKit built-in Helvetica has no prime glyphs — use ASCII `°`, `'`, `"` only.
- **Do NOT change the figure-statement wording:** keep `"${area} of land called"` and the current casing of `"situate in the district of …"`. This reconciliation deliberately leaves the statement text alone.
- Commit message trailer on every commit:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Work on a feature branch, never commit reconciliation code directly to `main`.

---

### Task 1: `formatSI` pure number-format helper

**Files:**
- Create: `app-backend/src/services/diagram/numberFormat.js`
- Test: `app-backend/src/services/diagram/__tests__/numberFormat.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `formatSI(value, decimals = 2, { sign = false } = {}) → string`. Formats a number the SI 727 way (comma decimal, space thousands); with `sign`, prefixes `"+ "`/`"- "`. Non-numeric → treated as `0`.

- [ ] **Step 1: Write the failing test**

Create `app-backend/src/services/diagram/__tests__/numberFormat.test.js`:

```js
import { describe, test, expect } from '@jest/globals'
import { formatSI } from '../numberFormat.js'

describe('formatSI', () => {
  test('two decimals with a comma separator, no grouping under 1000', () => {
    expect(formatSI(122.96)).toBe('122,96')
  })
  test('groups thousands with a space', () => {
    expect(formatSI(1234.5)).toBe('1 234,50')
  })
  test('signed negative: minus, space, grouped, comma decimal', () => {
    expect(formatSI(-82360.81, 2, { sign: true })).toBe('- 82 360,81')
  })
  test('signed positive with multiple thousands groups', () => {
    expect(formatSI(2156833.1, 2, { sign: true })).toBe('+ 2 156 833,10')
  })
  test('signed zero is positive', () => {
    expect(formatSI(0, 2, { sign: true })).toBe('+ 0,00')
  })
  test('zero decimals still groups', () => {
    expect(formatSI(9000, 0)).toBe('9 000')
  })
  test('four decimals', () => {
    expect(formatSI(1.2345, 4)).toBe('1,2345')
  })
  test('non-numeric is treated as zero', () => {
    expect(formatSI(undefined)).toBe('0,00')
    expect(formatSI('abc', 2, { sign: true })).toBe('+ 0,00')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `app-backend`): `node --experimental-vm-modules node_modules/jest/bin/jest.js numberFormat`
Expected: FAIL — `Cannot find module '../numberFormat.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `app-backend/src/services/diagram/numberFormat.js`:

```js
/**
 * Format a number the SI 727 / Zimbabwe way: comma decimal separator and a
 * space between thousands groups of the integer part. With `sign`, prefix an
 * explicit "+"/"-" followed by a space (e.g. "- 82 360,81", "+ 0,00").
 * Non-numeric input is treated as 0.
 */
export function formatSI(value, decimals = 2, { sign = false } = {}) {
  const num = Number(value) || 0
  const neg = num < 0
  const fixed = Math.abs(num).toFixed(decimals)          // "82360.81" | "0"
  const [intPart, dec] = fixed.split('.')
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')  // "82 360"
  const body = dec != null ? `${grouped},${dec}` : grouped        // "82 360,81"
  return sign ? `${neg ? '-' : '+'} ${body}` : body
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `app-backend`): `node --experimental-vm-modules node_modules/jest/bin/jest.js numberFormat`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/numberFormat.js app-backend/src/services/diagram/__tests__/numberFormat.test.js
git commit -m "feat(diagram): SI 727 number formatter (comma decimal, space thousands)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Apply SI formatting in the sides table

**Files:**
- Modify: `app-backend/src/services/diagram/sidesTable.js` (imports; `formatDiagramArea` lines 20-27; `signed` lines 29-33; `buildSidesTable` `metres` line 55)
- Test: `app-backend/src/services/diagram/__tests__/sidesTable.test.js` (update expectations)

**Interfaces:**
- Consumes: `formatSI(value, decimals, { sign })` from Task 1.
- Produces: `buildSidesTable` rows and `formatDiagramArea` now emit SI-formatted strings — coordinate/const `y`/`x` like `+ 2 143 972,14` / `+ 0,00`; side `metres` like `20,79`; area like `4 047 square metres` / `1,2345 hectares`. Directions unchanged (`322 18 30`).

- [ ] **Step 1: Update the failing tests**

In `app-backend/src/services/diagram/__tests__/sidesTable.test.js`, replace the `formatDiagramArea` and `buildSidesTable` expectations so they assert SI output. Change these specific assertions:

`formatDiagramArea` block (lines 35-46) →

```js
describe('formatDiagramArea', () => {
  test('below 1 hectare: whole square metres, space-grouped, with unit', () => {
    expect(formatDiagramArea(4047)).toBe('4 047 square metres')
  })
  test("below 1 hectare uses banker's rounding on the whole metre", () => {
    expect(formatDiagramArea(4046.5)).toBe('4 046 square metres') // 4046 is even
  })
  test('1 hectare or more: hectares to 4 decimals (comma) with unit', () => {
    expect(formatDiagramArea(12345)).toBe('1,2345 hectares')
    expect(formatDiagramArea(15000)).toBe('1,5000 hectares')
  })
})
```

`buildSidesTable` const-row and coordinate-row assertions (lines 49-55) →

```js
  test('const row is SI-signed 0,00 / 0,00', () => {
    expect(buildSidesTable(geometry, beacons).constRow).toEqual({ y: '+ 0,00', x: '+ 0,00' })
  })
  test('coordinate rows carry full SI-signed coords to 2dp', () => {
    const t = buildSidesTable(geometry, beacons)
    expect(t.coordinateRows[0]).toMatchObject({ letter: 'A', y: '- 85 728,70', x: '+ 2 143 972,14' })
  })
```

(Leave the `toDMS`, directions, `beaconName`, and `buildFigureRepresents` tests unchanged. The `sideRows[0].metres` is not directly asserted; the directions test still expects `'322 18 30'`.)

- [ ] **Step 2: Run tests to verify they fail**

Run (from `app-backend`): `node --experimental-vm-modules node_modules/jest/bin/jest.js sidesTable`
Expected: FAIL — current code emits `+0.00`, `-85728.70`, `4047 square metres` (dot, no spaces).

- [ ] **Step 3: Implement — wire `formatSI` in**

In `app-backend/src/services/diagram/sidesTable.js`:

Add the import beside the existing imports at the top:

```js
import { formatSI } from './numberFormat.js'
```

Replace `formatDiagramArea` (lines 20-27) body so the numeric part is SI-formatted:

```js
export function formatDiagramArea(areaM2) {
  const a = Math.abs(Number(areaM2) || 0)
  const ha = a / 10000
  if (ha >= 1) {
    return `${formatSI(bankersRound(ha, 4), 4)} hectares`
  }
  return `${formatSI(bankersRound(a, 0), 0)} square metres`
}
```

Replace the local `signed` helper (lines 29-33) so it delegates to `formatSI`:

```js
function signed(value) {
  return formatSI(value, 2, { sign: true })
}
```

Replace the side `metres` field in `buildSidesTable` (line 55) from
`metres: Number(s.distance).toFixed(2),` to:

```js
      metres: formatSI(s.distance, 2),
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `app-backend`): `node --experimental-vm-modules node_modules/jest/bin/jest.js sidesTable`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/sidesTable.js app-backend/src/services/diagram/__tests__/sidesTable.test.js
git commit -m "feat(diagram): SI-format sides table metres, coordinates, constants, area

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Beacon description keyed by vertex letter

**Files:**
- Modify: `app-backend/src/services/diagram/beaconDescription.js` (`buildBeaconDescription`, lines 26-53)
- Test: `app-backend/src/services/diagram/__tests__/beaconDescription.test.js` (update expectations)

**Interfaces:**
- Consumes: `geometry.vertices[i].letter` (already present).
- Produces: `buildBeaconDescription(geometry, beacons, tolM?) → [{ names, description }]` where `names` now holds the **vertex letters** (e.g. `'A, B'`) in place of station names. Return shape unchanged, so `diagramPdf.js drawBeaconDescription` still consumes `.names` / `.description`.

- [ ] **Step 1: Update the failing tests**

In `app-backend/src/services/diagram/__tests__/beaconDescription.test.js`, the fixture `geometry` has vertices `A` and `B`. Update the three non-empty expectations so `names` are the vertex letters:

```js
  test('describes only beacons on the subject parcel, ignoring far ones', () => {
    const beacons = fc([
      beacon('A1', 2144000, -85000, { description: '12mm iron peg' }),
      beacon('B1', 2144060, -85000, { description: '12mm iron peg' }),
      beacon('FAR', 2200000, -90000, { description: '50mm pipe' }),
    ])
    expect(buildBeaconDescription(geometry, beacons)).toEqual([
      { names: 'A, B', description: '12mm iron peg' },
    ])
  })

  test('uses each beacon\'s description property, grouping distinct descriptions in vertex order', () => {
    const beacons = fc([
      beacon('A1', 2144000, -85000, { description: '12mm iron peg' }),
      beacon('B1', 2144060, -85000, { description: '50mm iron pipe' }),
    ])
    expect(buildBeaconDescription(geometry, beacons)).toEqual([
      { names: 'A', description: '12mm iron peg' },
      { names: 'B', description: '50mm iron pipe' },
    ])
  })

  test('infers the description from the name when none is provided', () => {
    const beacons = fc([
      beacon('84A', 2144000, -85000),   // default → 12mm iron peg in concrete
      beacon('B1', 2144060, -85000),    // [A-Z]\d → 50mm Iron Pipe in Concrete
    ])
    expect(buildBeaconDescription(geometry, beacons)).toEqual([
      { names: 'A', description: '12mm iron peg in concrete' },
      { names: 'B', description: '50mm Iron Pipe in Concrete' },
    ])
  })
```

(Leave the `returns [] when no beacon coincides` test unchanged.)

- [ ] **Step 2: Run tests to verify they fail**

Run (from `app-backend`): `node --experimental-vm-modules node_modules/jest/bin/jest.js beaconDescription`
Expected: FAIL — current code returns station names (`'A1, B1'`, `'A1'`, `'84A'`).

- [ ] **Step 3: Implement — collect vertex letters instead of names**

In `app-backend/src/services/diagram/beaconDescription.js`, inside the `for (const v of vertices)` loop, keep the beacon lookup (it still supplies the description) but push the vertex letter. Replace lines 45-49:

```js
    if (!best || used.has(best)) continue
    used.add(best)
    const p = best.properties ?? {}
    const name = String(p.name ?? p.beacon_name ?? p.id ?? '')
    const desc = String(p.description ?? p.beacon_type ?? '').trim() || inferDescription(name)
    if (!namesByDesc.has(desc)) { namesByDesc.set(desc, []); order.push(desc) }
    namesByDesc.get(desc).push(v.letter)
```

(Only the final `.push(...)` argument changes from `name` to `v.letter`; `name` is still used to infer the description.)

- [ ] **Step 4: Run tests to verify they pass**

Run (from `app-backend`): `node --experimental-vm-modules node_modules/jest/bin/jest.js beaconDescription`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagram/beaconDescription.js app-backend/src/services/diagram/__tests__/beaconDescription.test.js
git commit -m "feat(diagram): group beacon description by vertex letter, not station name

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Renderer text — "Constants", "Description of Beacons", road-width label

**Files:**
- Modify: `app-backend/src/services/diagramPdf.js` (add `formatSI` import; `drawTable` line 109; `drawBeaconDescription` line 143; `drawAdjoiningFeatures` label block lines 225-242)
- Test: `app-backend/src/services/__tests__/diagramPdf.test.js` (existing valid-PDF guard — must stay green)

**Interfaces:**
- Consumes: `formatSI` from Task 1; `ann.widthM` (number, optional) already on road/servitude annotations.
- Produces: no signature change; only rendered text.

- [ ] **Step 1: Add the `formatSI` import**

At the top of `app-backend/src/services/diagramPdf.js`, alongside the other `./diagram/...` imports, add:

```js
import { formatSI } from './diagram/numberFormat.js'
```

- [ ] **Step 2: "Const." → "Constants"**

In `drawTable`, line 109, change:

```js
  doc.text('Const.', cSg, ry)
```

to:

```js
  doc.text('Constants', cSg, ry)
```

- [ ] **Step 3: "Beacon description" → "Description of Beacons"**

In `drawBeaconDescription`, line 143, change the header text:

```js
  doc.save().font('Helvetica-Bold').fontSize(7).text('Description of Beacons', R.x, R.y)
```

- [ ] **Step 4: Road labels carry the width when present**

In `drawAdjoiningFeatures`, the label block currently reads (lines 225-227):

```js
    if (ann.label) {
      doc.save().font('Helvetica').fontSize(7).fillColor('#000000')
      const labelW = doc.widthOfString(ann.label)
```

Replace those three lines with a computed label text that appends the road width when set:

```js
    if (ann.label) {
      doc.save().font('Helvetica').fontSize(7).fillColor('#000000')
      const labelText = ann.role === 'road' && ann.widthM > 0
        ? `${ann.label} ${formatSI(ann.widthM, 2)}m`
        : ann.label
      const labelW = doc.widthOfString(labelText)
```

Then, in the same block, replace both `doc.text(ann.label, …)` calls with `labelText`:
- the rotated road/servitude call (line 242): `doc.text(labelText, lx - labelW / 2, ly - 3.5, { lineBreak: false })`
- the horizontal else-branch call (line 248): `doc.text(labelText, pos.x, pos.y)`

- [ ] **Step 5: Run the valid-PDF guard**

Run (from `app-backend`): `node --experimental-vm-modules node_modules/jest/bin/jest.js diagramPdf`
Expected: PASS (all `generateDiagramPDF` tests still green — valid `%PDF-` buffers, >2000 bytes).

- [ ] **Step 6: Commit**

```bash
git add app-backend/src/services/diagramPdf.js
git commit -m "feat(diagram): Constants + Description of Beacons labels; road width in label

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Controller visual acceptance (after this task):** generate a diagram and confirm the table shows "Constants", the beacon block reads "Description of Beacons", and a road with a width renders "<name> <width>m" along the edge.

---

### Task 5: Two-directional scale bar

**Files:**
- Modify: `app-backend/src/services/diagramPdf.js` (`drawScaleBar`, lines 281-301)
- Test: `app-backend/src/services/__tests__/diagramPdf.test.js` (valid-PDF guard — must stay green)

**Interfaces:**
- Consumes: existing `snapScaleBarSegment(metres)` helper (already used in `drawScaleBar`) and `layout.scaleBar` `{ x, y, width }`.
- Produces: no signature change.

- [ ] **Step 1: Rewrite `drawScaleBar`**

Replace the whole `drawScaleBar` function (lines 281-301) with a two-directional bar — one subdivided segment left of 0, then two equal segments right of 0:

```js
function drawScaleBar(doc, layout, denom) {
  const R = layout.scaleBar
  const ptPerM = (72 / 25.4) * 1000 / denom
  const barGroundM = (R.width / (72 / 25.4)) * denom / 1000
  // Bar = 1 subdivided segment LEFT of 0 + 2 equal segments RIGHT of 0 (SG style).
  const seg = snapScaleBarSegment(barGroundM / 3)
  const w = seg * ptPerM
  const barY = R.y + 10
  const x0 = R.x + w // ground zero, after the left (subdivided) segment
  doc.save().lineWidth(1).strokeColor('#000').font('Helvetica').fontSize(6.5)
  // Left segment subdivided into 5 alternating ticks (a fine ruler left of 0).
  const subN = 5
  const subW = w / subN
  for (let i = 0; i < subN; i++) {
    const sx = R.x + i * subW
    if (i % 2 === 0) doc.rect(sx, barY, subW, 4).fillAndStroke('#000', '#000')
    else doc.rect(sx, barY, subW, 4).stroke()
  }
  // Two equal segments right of 0, alternating fill (first empty to alternate).
  for (let i = 0; i < 2; i++) {
    const sx = x0 + i * w
    if (i % 2 === 0) doc.rect(sx, barY, w, 4).stroke()
    else doc.rect(sx, barY, w, 4).fillAndStroke('#000', '#000')
  }
  // Tick labels: seg | 0 | seg | 2*seg, centred under each tick.
  const lbl = (val, cx) => doc.fillColor('#000').text(String(Math.round(val)), cx - 8, R.y, { width: 16, align: 'center' })
  lbl(seg, R.x)
  lbl(0, x0)
  lbl(seg, x0 + w)
  lbl(2 * seg, x0 + 2 * w)
  doc.text('metres', x0 + 2 * w + 6, barY)
  doc.text(`Scale 1 : ${denom}`, R.x + R.width / 2 - 30, R.y + 20)
  doc.restore()
}
```

- [ ] **Step 2: Run the valid-PDF guard**

Run (from `app-backend`): `node --experimental-vm-modules node_modules/jest/bin/jest.js diagramPdf`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app-backend/src/services/diagramPdf.js
git commit -m "feat(diagram): two-directional SG scale bar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Controller visual acceptance (after this task):** generate a diagram and confirm the bar reads like `30  0  30  60  metres` with a subdivided segment left of 0; tune `subN` or segment count if it looks cramped.

---

### Task 6: Font sizes

**Files:**
- Modify: `app-backend/src/services/diagramPdf.js` (`drawTable` header/body sizes lines 86, 92; `drawBeaconDescription` lines 143-144; `drawStatement` lines 313, 320, 321; `drawReferenceGrid` line 357)
- Test: `app-backend/src/services/__tests__/diagramPdf.test.js` (valid-PDF guard — must stay green)

**Interfaces:**
- Consumes: nothing new.
- Produces: no signature change; only font sizes.

- [ ] **Step 1: Bump the statement + designation fonts**

In `drawStatement`:
- Line 313: `doc.save().font('Helvetica').fontSize(8).fillColor('#000')` → `fontSize(9)`.
- Line 320: make the designation dominant — change
  `doc.font('Helvetica-Bold').text(\`${designation}${parent}\`, R.x, R.y + 30, { width: R.width })`
  to `doc.font('Helvetica-Bold').fontSize(11).text(\`${designation}${parent}\`, R.x, R.y + 30, { width: R.width })`.
- Line 321: the follow-on `situate …` block currently `doc.font('Helvetica').fontSize(7).text(` → `fontSize(8)`.
  (Keep the wording `situate in the district of …` and `${area} of land called` exactly as-is — Global Constraints.)

- [ ] **Step 2: Bump the beacon-description + reference-grid fonts**

- `drawBeaconDescription` line 143: header `.fontSize(7)` → `.fontSize(8)`; line 144: body `doc.font('Helvetica').fontSize(7)` → `.fontSize(8)`.
- `drawReferenceGrid` line 357: `doc.font('Helvetica').fontSize(6.5).fillColor('#000')` → `.fontSize(7)`.

- [ ] **Step 3: Cautious table bump**

In `drawTable`:
- Line 86: header `doc.save().font('Helvetica-Bold').fontSize(7)` → `.fontSize(7.5)`.
- Line 92: body `doc.font('Helvetica').fontSize(6.5)` → `.fontSize(7)`.

- [ ] **Step 4: Run the valid-PDF guard**

Run (from `app-backend`): `node --experimental-vm-modules node_modules/jest/bin/jest.js diagramPdf`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/diagramPdf.js
git commit -m "feat(diagram): enlarge designation, statement, beacon-desc, reg-53, table fonts

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Controller visual acceptance (after this task) — the key visual gate:** generate the STAND 302 diagram (and one with the widest real coordinates). Check that (a) the designation is clearly dominant and does not overflow into "situate", and (b) the 7 pt table with SI-formatted signed coordinates (`+ 2 143 972,14`) does **not** clip into the DIAGRAM S.G. No. column. If the designation wraps badly, reduce it to 10 pt. If the table clips, either widen the coordinate column offsets `cY`/`cX` (lines 61) and the `verticals` (line 131) or fall back to `fontSize(6.5)` for the table body — legibility of the statement is the priority; the table stays as large as fits. Dispatch a fix task with the specific adjustment.

---

### Task 7: Frontend — allow a width on road annotations

**Files:**
- Modify: `app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue` (width `<label>` v-if line 25; `saveSideEditor` widthM guard line 2002)

**Interfaces:**
- Consumes: `activeSideEditor.role` / `.widthM` (existing modal state).
- Produces: road annotations may now carry `widthM`, which the renderer (Task 4) reads.

- [ ] **Step 1: Show the width field for roads too**

Line 25, change:

```html
          <label v-if="activeSideEditor.role === 'servitude'">Width (m)
```

to:

```html
          <label v-if="activeSideEditor.role === 'servitude' || activeSideEditor.role === 'road'">Width (m)
```

- [ ] **Step 2: Persist width for roads too**

In `saveSideEditor`, line 2002, change:

```js
    widthM: ed.role === 'servitude' && ed.widthM != null ? ed.widthM : undefined,
```

to:

```js
    widthM: (ed.role === 'servitude' || ed.role === 'road') && ed.widthM != null ? ed.widthM : undefined,
```

- [ ] **Step 3: Verify the build**

Run (from `app-frontend`): `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add app-frontend/src/views/modules/cadastral-standard/SurveyPlanMapView.vue
git commit -m "feat(diagram-ui): allow a width on road side-annotations

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

**Controller manual acceptance (after this task):** in the running app, classify a side as a road, enter a width, Save; confirm the classifier keeps the width on reload and the generated diagram renders `<road name> <width>m` along that edge.

---

## Notes for the executor

- Tasks 1-3 are pure-helper TDD (red → green → commit).
- Tasks 4-6 all edit `diagramPdf.js` sequentially; their automated gate is the existing valid-PDF Jest guard, and each has a **controller visual-acceptance** step against the template (`C:\Users\mukan\Desktop\tecno 7\DIAG TEMPLATE-Model-000.pdf`). Do these one at a time.
- Task 6 is the highest-risk visual task (font vs. table-fit) — verify it carefully and be ready to widen columns or fall back to 6.5 pt.
