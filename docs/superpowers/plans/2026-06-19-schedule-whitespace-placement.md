# Whitespace-Driven Schedule Placement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Place the Schedule of Areas into the whitespace that actually exists for the figure's orientation + size — balancing it as tall columns on both side strips with the figure centred (the ideal General Plan look) — and remove intermediate grid ticks under placed tables while never overlapping the extreme ticks.

**Architecture:** Two new **pure, deterministic** functions in a shared module measure the figure's whitespace strips and choose a placement strategy (balance / pool / flat / escalate). The **PDF decides** (figure alignment + ordered target regions) and the **DXF consumes verbatim** — same lockstep contract as the existing scale/sheet/orientation handoff. Grid-tick emission is gated so extreme ticks survive as obstacles and intermediate ticks under tables are culled.

**Tech Stack:** Node.js (ESM), Fastify backend, Jest 30 (run via `node --experimental-vm-modules node_modules/jest/bin/jest.js`), `pdfkit`/`pdf-lib` (PDF), hand-rolled DXF writer, `ezdxf`+`matplotlib` (Python 3.13) for render checkpoints.

**Spec:** `docs/superpowers/specs/2026-06-19-schedule-whitespace-placement-design.md`

**Working dir for all commands:** `app-backend/` (the Jest config + `node_modules` live there).

---

## File Structure

- **Create** `app-backend/src/services/scheduleStrategy.js` — pure primitives `measureFigureWhitespace()` + `chooseScheduleStrategy()`. No I/O, no DXF/PDF deps. Single responsibility: "given a figure bbox + content area, where and how should the schedule go."
- **Create** `app-backend/src/services/__tests__/scheduleStrategy.test.js` — unit tests for both primitives.
- **Modify** `app-backend/src/services/dxfGenerator.js` — feed the figure bbox + content area into the strategy; honour `figureAlign`; gate `addGridReferences` tick emission; pass extreme-tick obstacles + `placedTables` through.
- **Modify** `app-backend/src/services/pdfkitGeoPDF.js` — call the same strategy; replace the `alignX` heuristic; feed both side strips into the split path; gate the PDF grid-tick renderer; return the decision for the DXF handoff.
- **Modify** `app-backend/src/services/dxfScheduleEmitter.js` — already consumes `placedTablesGround`; no logic change expected (verify only).

**Render checkpoint helper** (recreate as throwaway scratch during execution, delete after — do NOT commit): `_genfx.mjs` (generate the 240-stand fixture DXF) + `_render.py` (ezdxf→PNG). Exact contents in Appendix A.

---

### Task 1: Pure primitive — `measureFigureWhitespace()`

**Files:**
- Create: `app-backend/src/services/scheduleStrategy.js`
- Test: `app-backend/src/services/__tests__/scheduleStrategy.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// app-backend/src/services/__tests__/scheduleStrategy.test.js
import { describe, test, expect } from '@jest/globals';
import { measureFigureWhitespace } from '../scheduleStrategy.js';

describe('measureFigureWhitespace', () => {
  // contentArea is the usable drawing area in paper-mm: {x,y,w,h} with y UP.
  // figureBBox is the oriented figure bounding box in the same frame.
  const content = { x: 0, y: 0, w: 1000, h: 700 };

  test('figure centred horizontally → equal left and right strips', () => {
    const fig = { x: 350, y: 100, w: 300, h: 500 };
    const s = measureFigureWhitespace({ figureBBox: fig, contentArea: content });
    expect(s.left.w).toBeCloseTo(350, 5);
    expect(s.right.w).toBeCloseTo(350, 5);   // 1000 - (350+300)
    expect(s.left.h).toBeCloseTo(700, 5);    // side strips span full content height
    expect(s.right.x).toBeCloseTo(650, 5);
  });

  test('top and bottom strips are the height above/below the figure', () => {
    const fig = { x: 350, y: 100, w: 300, h: 500 };
    const s = measureFigureWhitespace({ figureBBox: fig, contentArea: content });
    expect(s.bottom.h).toBeCloseTo(100, 5);  // y 0..100
    expect(s.top.h).toBeCloseTo(100, 5);     // y 600..700
  });

  test('figure flush to the left edge → zero-width left strip, wide right strip', () => {
    const fig = { x: 0, y: 100, w: 300, h: 500 };
    const s = measureFigureWhitespace({ figureBBox: fig, contentArea: content });
    expect(s.left.w).toBeCloseTo(0, 5);
    expect(s.right.w).toBeCloseTo(700, 5);
  });

  test('reserved fixed-block bboxes shrink the overlapping strip', () => {
    const fig = { x: 350, y: 100, w: 300, h: 500 };
    // A title strip occupying the top 80mm of the RIGHT strip.
    const s = measureFigureWhitespace({
      figureBBox: fig, contentArea: content,
      fixedBlocks: [{ x: 650, y: 620, w: 350, h: 80 }],
    });
    expect(s.right.h).toBeCloseTo(620, 5); // 700 - 80 reserved at top
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns='scheduleStrategy'`
Expected: FAIL — "Cannot find module '../scheduleStrategy.js'".

- [ ] **Step 3: Write minimal implementation**

```javascript
// app-backend/src/services/scheduleStrategy.js

/**
 * Decompose the whitespace around a figure into the four canonical strips
 * (left / right / top / bottom), in the same paper-mm frame as the inputs.
 *
 * Frame convention: x to the right, y UP. contentArea + figureBBox are
 * {x, y, w, h} with (x, y) = lower-left corner.
 *
 * Side strips (left/right) span the FULL content height; top/bottom strips span
 * the figure's horizontal band. Any reserved fixed-block bbox that overlaps a
 * strip trims that strip from the overlapping edge (height for side strips).
 *
 * @returns {{left,right,top,bottom}} each { x, y, w, h }
 */
export function measureFigureWhitespace({ figureBBox, contentArea, fixedBlocks = [] }) {
  const c = contentArea, f = figureBBox;
  const left   = { x: c.x,           y: c.y, w: Math.max(0, f.x - c.x),               h: c.h };
  const right  = { x: f.x + f.w,     y: c.y, w: Math.max(0, (c.x + c.w) - (f.x + f.w)), h: c.h };
  const bottom = { x: f.x, y: c.y,        w: f.w, h: Math.max(0, f.y - c.y) };
  const top    = { x: f.x, y: f.y + f.h,  w: f.w, h: Math.max(0, (c.y + c.h) - (f.y + f.h)) };

  // Trim side strips by any reserved block that overlaps them (reserve from the top).
  for (const b of fixedBlocks) {
    for (const s of [left, right]) {
      const overlapX = b.x < s.x + s.w && b.x + b.w > s.x;
      if (overlapX) {
        const reservedTop = (b.y + b.h) - s.y;            // how far up the block reaches
        if (b.y + b.h >= s.y + s.h && reservedTop < s.h) {
          s.h = Math.min(s.h, s.h - (s.y + s.h - b.y));   // cut the reserved top band
        }
      }
    }
  }
  return { left, right, top, bottom };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns='scheduleStrategy'`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd app-backend && git add src/services/scheduleStrategy.js src/services/__tests__/scheduleStrategy.test.js
git commit -m "feat(schedule): measureFigureWhitespace — decompose figure whitespace into strips"
```

---

### Task 2: Pure primitive — `chooseScheduleStrategy()`

**Files:**
- Modify: `app-backend/src/services/scheduleStrategy.js`
- Test: `app-backend/src/services/__tests__/scheduleStrategy.test.js`

- [ ] **Step 1: Write the failing test (append to the same test file)**

```javascript
import { chooseScheduleStrategy } from '../scheduleStrategy.js';

describe('chooseScheduleStrategy', () => {
  const colW = 95;     // one schedule column-group width (mm)
  const rowH = 4;      // mm per row
  const headerH = 19;  // SCHEDULE_HEADER_HEIGHT_MM
  const tall = (w) => ({ x: 0, y: 0, w, h: 600 });   // tall side strip
  const flat = (h) => ({ x: 0, y: 0, w: 400, h });    // wide top/bottom strip

  test('both side strips usable → BALANCE, figure centred, two regions', () => {
    const d = chooseScheduleStrategy({
      strips: { left: tall(100), right: tall(100), top: flat(10), bottom: flat(10) },
      colW, rowH, headerH,
    });
    expect(d.mode).toBe('balance');
    expect(d.figureAlign).toBe('center');
    expect(d.regions).toHaveLength(2);
  });

  test('only one side strip usable → POOL on the wider side, figure pushed away', () => {
    const d = chooseScheduleStrategy({
      strips: { left: tall(30), right: tall(100), top: flat(10), bottom: flat(10) },
      colW, rowH, headerH,
    });
    expect(d.mode).toBe('pool');
    expect(d.regions).toHaveLength(1);
    expect(d.figureAlign).toBe('left'); // pool right ⇒ push figure left
  });

  test('no usable side strip but a tall top/bottom strip → FLAT', () => {
    const d = chooseScheduleStrategy({
      strips: { left: tall(10), right: tall(10), top: flat(120), bottom: flat(10) },
      colW, rowH, headerH,
    });
    expect(d.mode).toBe('flat');
  });

  test('nothing fits → ESCALATE', () => {
    const d = chooseScheduleStrategy({
      strips: { left: tall(10), right: tall(10), top: flat(10), bottom: flat(10) },
      colW, rowH, headerH,
    });
    expect(d.mode).toBe('escalate');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns='scheduleStrategy'`
Expected: FAIL — "chooseScheduleStrategy is not a function".

- [ ] **Step 3: Write minimal implementation (append to scheduleStrategy.js)**

```javascript
const MIN_ROWS_PER_TABLE = 3; // matches planScheduleSplit's minRowsPerTable

/**
 * Decide where + how the schedule goes, from the measured strips.
 * Precedence: balance (both sides) → pool (one side) → flat (top/bottom) → escalate.
 *
 * @returns {{ mode, figureAlign, regions }} where mode ∈
 *   'balance'|'pool'|'flat'|'escalate', figureAlign ∈ 'center'|'left'|'right',
 *   regions = ordered array of strip rects the split path should fill.
 */
export function chooseScheduleStrategy({ strips, colW, rowH, headerH }) {
  const minTableH = headerH + rowH * MIN_ROWS_PER_TABLE;
  const usableSide = (s) => s && s.w >= colW && s.h >= minTableH;
  const usableFlat = (s) => s && s.h >= minTableH && s.w >= colW;

  if (usableSide(strips.left) && usableSide(strips.right)) {
    return { mode: 'balance', figureAlign: 'center', regions: [strips.left, strips.right] };
  }
  if (usableSide(strips.left) || usableSide(strips.right)) {
    const right = usableSide(strips.right) &&
      (!usableSide(strips.left) || strips.right.w >= strips.left.w);
    const region = right ? strips.right : strips.left;
    return { mode: 'pool', figureAlign: right ? 'left' : 'right', regions: [region] };
  }
  if (usableFlat(strips.bottom) || usableFlat(strips.top)) {
    const region = usableFlat(strips.bottom) ? strips.bottom : strips.top;
    return { mode: 'flat', figureAlign: 'center', regions: [region] };
  }
  return { mode: 'escalate', figureAlign: 'center', regions: [] };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns='scheduleStrategy'`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
cd app-backend && git add src/services/scheduleStrategy.js src/services/__tests__/scheduleStrategy.test.js
git commit -m "feat(schedule): chooseScheduleStrategy — balance/pool/flat/escalate decision"
```

---

### Task 3: Wire `figureAlign` into the DXF figure offset (render checkpoint)

**Goal:** Make the DXF centre the figure when both side strips are usable, instead of its current fixed offset. The DXF computes its own figure position (the PDF's `alignX` does NOT reach it — verified by the centre experiment).

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`

- [ ] **Step 1: Locate the DXF figure-offset computation.**

Run: `grep -nE "figureBounds|figureOffset|alignX|contentArea|mapBounds|transformCoords" app-backend/src/services/dxfGenerator.js | head -30`
Identify where the figure's horizontal placement within `contentArea` is decided (the x-offset applied to projected points). Note the exact variable holding the content area + the figure bbox in DXF ground units.

- [ ] **Step 2: Import the strategy primitives + compute the decision.**

Add near the top of `dxfGenerator.js` (with the other `import`s):

```javascript
import { measureFigureWhitespace, chooseScheduleStrategy } from './scheduleStrategy.js'
```

After the figure bbox + content area are known (convert both to paper-mm via the existing `S` scale: `groundToMM = 1000 / S`), compute:

```javascript
// Whitespace-driven schedule placement decision (paper-mm frame).
const _toMM = 1000 / S
const _figBBoxMM = {
  x: (figMinX - contentL) * _toMM, y: (figMinY - contentB) * _toMM,
  w: (figMaxX - figMinX) * _toMM,  h: (figMaxY - figMinY) * _toMM,
}
const _contentMM = { x: 0, y: 0, w: contentW * _toMM, h: contentH * _toMM }
const _strips = measureFigureWhitespace({ figureBBox: _figBBoxMM, contentArea: _contentMM })
const _schedDecision = chooseScheduleStrategy({
  strips: _strips, colW: scheduleColWidthMM, rowH: rH / mm(1), headerH: SCHEDULE_HEADER_HEIGHT_MM,
})
```

*(Replace `figMinX/contentL/contentW/scheduleColWidthMM` with the actual variable names found in Step 1; the executor confirms these against the current code.)*

- [ ] **Step 3: Apply `figureAlign` to the figure x-offset.**

Where the figure x-offset is currently computed, branch on `_schedDecision.figureAlign`:
- `'center'` → offset = `(contentW - figW) / 2`
- `'left'`   → offset = `0` (flush left, pool right)
- `'right'`  → offset = `contentW - figW` (flush right, pool left)

- [ ] **Step 4: Render checkpoint (manual, not a unit test).**

Create the scratch helpers (Appendix A), then:

```bash
cd app-backend
node _genfx.mjs _fx.dxf
"C:\\Users\\mukan\\AppData\\Local\\Programs\\Python\\Python313\\python.exe" _render.py _fx.dxf _fx.png
```

Open `_fx.png`. Expected: the 240-stand figure is now **centred** (was centre-left). Schedule still on the right for now (Task 4 balances it). If the figure is not centred, fix the offset branch before continuing.

- [ ] **Step 5: Run the DXF suite to confirm no logic regression (snapshot WILL shift — that's Task 7).**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns='dxfGenerator.integration'`
Expected: PASS (snapshot test excluded by this pattern).

- [ ] **Step 6: Commit**

```bash
cd app-backend && git add src/services/dxfGenerator.js
git commit -m "feat(schedule): DXF figure honours whitespace-driven figureAlign"
```

---

### Task 4: Multi-region split — balance schedule across both side strips (render checkpoint)

**Goal:** When `mode === 'balance'`, place schedule sub-tables on BOTH the left and right strips (the ideal's look), via the existing split planner.

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js`
- Verify (no change expected): `app-backend/src/services/dxfScheduleEmitter.js`

- [ ] **Step 1: Find the DXF schedule emit call + the gaps it feeds the split path.**

Run: `grep -nE "emitScheduleOfAreasTopological|planScheduleSplit|availableGaps|placedTablesGround|computeWhitespaceZones" app-backend/src/services/dxfGenerator.js`
Identify the variable holding the candidate gap(s) the schedule is placed into today (currently the single pooled strip).

- [ ] **Step 2: Convert `_schedDecision.regions` (paper-mm) → DXF ground-unit gap rects** and pass them as the schedule's `availableGaps`/`placedTablesGround` source instead of the single slot. Each region rect: `{ x, y, width, height }` in ground units (`mm → ground` via `mm(1)` / `_toMM` inverse). Order: left region first, then right (so `planScheduleSplit` fills largest-first across both).

- [ ] **Step 3: Render checkpoint.**

```bash
cd app-backend && node _genfx.mjs _fx.dxf
"C:\\Users\\mukan\\AppData\\Local\\Programs\\Python\\Python313\\python.exe" _render.py _fx.dxf _fx.png
```

Open `_fx.png`. Expected: schedule columns now on **both** the left and right edges with the figure centred — matching `Downloads/_SCHED_ideal_full.png`. If only one side is filled, confirm both region rects are non-empty and ordered, and that `planScheduleSplit` received both gaps.

- [ ] **Step 4: Run the schedule + dxf integration suites.**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns='schedule|dxfGenerator.integration'`
Expected: PASS (snapshot excluded).

- [ ] **Step 5: Commit**

```bash
cd app-backend && git add src/services/dxfGenerator.js
git commit -m "feat(schedule): balance Schedule of Areas across both side strips"
```

---

### Task 5: Tick-mark handling — extreme = obstacle, intermediate = cull (render checkpoint)

**Goal:** Schedule never overlaps the extreme (top-most/bottom-most) grid ticks + labels (extreme = obstacle); intermediate ticks under a placed table are removed (intermediate = cull).

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js` (`addGridReferences` ~line 760)
- Test: `app-backend/src/services/__tests__/dxfGenerator.integration.test.js`

- [ ] **Step 0: Reserve the extreme-tick bands so tables never reach them (obstacle part).**

The extreme ticks sit at the very top and bottom of the figure's vertical edges. Reserve a band at each end of the side strips by shrinking them directly, right after `measureFigureWhitespace` in Task 3 and before `chooseScheduleStrategy`:

```javascript
// Reserve the extreme grid-tick band (tick length + its coordinate label) at the
// top AND bottom of each side strip so no schedule table overlaps an extreme tick.
const _tickBandMM = 5 /* tick length, mm */ + (gridLabelHeight * _toMM)
for (const s of [_strips.left, _strips.right]) {
  s.y += _tickBandMM
  s.h = Math.max(0, s.h - 2 * _tickBandMM)
}
```

This keeps `measureFigureWhitespace` simple (its `fixedBlocks` handles only the top title-strip reserve, per Task 1) and makes "schedule avoids the extreme ticks" a direct, testable strip adjustment. `gridLabelHeight` = the height used for the coordinate-tick TEXT in `addGridReferences` (confirm the variable name in Step 1 of Task 3).

- [ ] **Step 1: Write a failing integration test** (append in `dxfGenerator.integration.test.js`):

```javascript
test('no GRID tick LINE falls inside a placed schedule sub-table footprint', () => {
  // Uses the dense fixture so the schedule splits into side tables.
  const { buffer } = generateDXF(sampleMaglasPlan, fakeLogger)
  const dxf = buffer.toString()
  // Collect placed-table footprints (TITLE_BLOCK table borders) and GRID tick points.
  // Helper parseEntities(dxf, type, layer) already exists in this file.
  const ticks  = parseEntities(dxf, 'LINE', 'GRID')
  const tables = parseScheduleTableRects(dxf) // see Step 3 helper
  for (const t of ticks) {
    const inside = tables.some(r =>
      t.x1 >= r.x && t.x1 <= r.x + r.w && t.y1 >= r.y && t.y1 <= r.y + r.h)
    expect(inside).toBe(false)
  }
})
```

- [ ] **Step 2: Run it to confirm it fails** (intermediate ticks currently render under tables).

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns='dxfGenerator.integration' -t 'no GRID tick'`
Expected: FAIL — some tick is inside a table.

- [ ] **Step 3: Implement the tick gate in `addGridReferences`.**

Change `addGridReferences(layer, drawL, drawR, drawT, drawB, gridStepM)` to also accept `placedTables` (array of `{x,y,width,height}` ground rects). For each tick, compute `isExtreme` (the first/last tick index on that axis) and `insideTable` (point in any placedTable). Emit the tick **only if** `isExtreme || !insideTable`. Add the small helper `parseScheduleTableRects(dxf)` to the test file (parse TITLE_BLOCK rectangles bounding the sub-tables — borders are 4 LINEs per table).

- [ ] **Step 4: Pass `placedTables` into the `addGridReferences` call** (the schedule `placedTables` are known before the grid is drawn — if grid is currently drawn first, move the `addGridReferences` call to AFTER schedule emission).

- [ ] **Step 5: Run the test to verify it passes.**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns='dxfGenerator.integration' -t 'no GRID tick'`
Expected: PASS.

- [ ] **Step 6: Render checkpoint** — confirm extreme ticks survive and the grid still reads.

```bash
cd app-backend && node _genfx.mjs _fx.dxf
"C:\\Users\\mukan\\AppData\\Local\\Programs\\Python\\Python313\\python.exe" _render.py _fx.dxf _fx.png
```

- [ ] **Step 7: Commit**

```bash
cd app-backend && git add src/services/dxfGenerator.js src/services/__tests__/dxfGenerator.integration.test.js
git commit -m "feat(schedule): keep extreme grid ticks, cull intermediate ticks under tables"
```

---

### Task 6: Mirror to the PDF for lockstep (decide + return + tick gate)

**Goal:** The PDF makes the same decision and returns it; its grid-tick renderer applies the same cull gate. DXF already consumes the PDF's handed-off layout for scale/sheet/orientation — extend that contract so the figure align + schedule regions are consistent.

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF.js`

- [ ] **Step 1: In `calculateBlockPositions`/`_generateGeoPDFInner`, compute the same decision** using `measureFigureWhitespace` + `chooseScheduleStrategy` from the figure bbox (the projected `pdfPoints` min/max) and the content area, replacing the `alignX` heuristic at `pdfkitGeoPDF.js:11193` with `figureBounds.alignX = _schedDecision.figureAlign`.

- [ ] **Step 2: Feed `_schedDecision.regions` into the `_schedNeedsSplit` planner-side search** (`pdfkitGeoPDF.js` ~7175) so the PDF schedule also balances across both side strips.

- [ ] **Step 3: Apply the same tick cull gate** in the PDF grid-tick renderer (find via `grep -nE "tick|grid" pdfkitGeoPDF.js`): emit ticks after schedule placement; skip intermediate ticks inside a placed table; keep extremes.

- [ ] **Step 4: Run the parity + pdfkit suites.**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns='pdfkit|geopdf|parity'`
Expected: PASS (the parity test models the PDF-first handoff; if a warning set shifts, update it as in the scale-handoff change).

- [ ] **Step 5: Commit**

```bash
cd app-backend && git add src/services/pdfkitGeoPDF.js
git commit -m "feat(schedule): PDF makes the whitespace decision + culls ticks (PDF<->DXF lockstep)"
```

---

### Task 7: Regenerate snapshots, full-suite green, cleanup

**Files:**
- Modify: `app-backend/src/services/__tests__/__snapshots__/dxfGenerator.snapshot.test.js.snap`

- [ ] **Step 1: Regenerate the DXF snapshots (intentional — schedule positions changed).**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns='dxfGenerator.snapshot' -u`
Expected: "3 snapshots updated".

- [ ] **Step 2: Full relevant suite green.**

Run: `node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPatterns='dxf|schedule|pdfkit|geopdf|parity|scheduleStrategy'`
Expected: all suites pass (the pre-existing `si727LayoutCalculator` failures are NOT in this pattern and are unrelated).

- [ ] **Step 3: Delete scratch render files (do not commit them).**

```bash
cd app-backend && rm -f _genfx.mjs _render.py _fx.dxf _fx.png
```

- [ ] **Step 4: Commit the regenerated snapshots.**

```bash
cd app-backend && git add src/services/__tests__/__snapshots__/dxfGenerator.snapshot.test.js.snap
git commit -m "test(schedule): regenerate DXF snapshots for whitespace-driven placement"
```

---

## Appendix A — scratch render helpers (do NOT commit)

`app-backend/_genfx.mjs`:
```javascript
import { writeFileSync } from 'fs';
import { generateDXF } from './src/services/dxfGenerator.js';
import { sampleMaglasPlan } from './src/services/__tests__/fixtures/sampleMaglasPlan.js';
const { buffer } = generateDXF(sampleMaglasPlan, { info(){}, warn(){}, error(){} });
writeFileSync(process.argv[2], buffer); console.log('WROTE', process.argv[2], buffer.length);
```

`app-backend/_render.py`:
```python
import sys, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt, numpy as np, ezdxf
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
from ezdxf.addons.drawing.config import Configuration, ColorPolicy, BackgroundPolicy
from ezdxf import bbox
doc = ezdxf.readfile(sys.argv[1]); msp = doc.modelspace()
xs, ys = [], []
for e in msp:
    try:
        b = bbox.extents([e])
        if b.has_data: xs += [b.extmin.x, b.extmax.x]; ys += [b.extmin.y, b.extmax.y]
    except Exception: pass
xs, ys = np.array(xs), np.array(ys)
xlo, xhi = np.percentile(xs, [0, 100]); ylo, yhi = np.percentile(ys, [0, 100])
w, h = xhi-xlo, yhi-ylo; asp = w/h if h else 1
fig = plt.figure(figsize=(18, max(5, 18/asp))); ax = fig.add_axes([0,0,1,1])
cfg = Configuration(background_policy=BackgroundPolicy.WHITE, color_policy=ColorPolicy.BLACK)
Frontend(RenderContext(doc), MatplotlibBackend(ax), config=cfg).draw_layout(msp, finalize=False)
ax.set_xlim(xlo, xhi); ax.set_ylim(ylo, yhi); ax.set_aspect('equal'); ax.axis('off')
fig.savefig(sys.argv[2], dpi=120, facecolor='white'); print('WROTE', sys.argv[2])
```

(`ezdxf` + `matplotlib` already installed in the user's Python 3.13.)
