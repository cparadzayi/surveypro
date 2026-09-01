# Scale Truth and Canonical Drawing Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the PDF generator draw the figure at the scale it prints, using one canonical drawing-area model shared by the resolver, the PDF and the DXF.

**Architecture:** The scale becomes an input to the figure's size rather than a caption applied afterwards. `app-shared/planSheeting.js` gains the real available drawing area (margin-inset sheet less the title band) and a block-room ceiling; the PDF sizes its figure box to exactly `extent / S` and positions that box inside the available area, so the existing fit-to-box transform lands on `S` by construction. The DXF is already scale-true and only inherits the shared area.

**Tech Stack:** Node.js ESM, Fastify 5, Jest 30 (ESM mode), PDFKit, `pdfjs-dist` (test-side PDF introspection), `pdf-lib`.

**Spec:** `docs/superpowers/specs/2026-09-01-scale-truth-and-canonical-drawing-area-design.md`

## Global Constraints

- **Jest must run under `--experimental-vm-modules`.** Bare `npx jest` fails with "Cannot use import statement outside a module". From `app-backend`: `node --experimental-vm-modules node_modules/jest/bin/jest.js <pattern>`.
- **SI 727 Reg 63 margins, in millimetres:** `LEFT = 50`, `RIGHT = 150`, `TOP = 50`, `BOTTOM = 50`. The right margin is wide because SG endorsements live there.
- **SI 727 Section 62(1) sheet sizes, smallest first:** `SI727_500x400` (500×400), `SI727_800x500` (800×500), `SI727_1000x800` (1000×800). These three only.
- **Reg 32(3):** a township general plan is mandated at exactly 1:500 when the majority of stands are ≤200 m². The mandate overrides both a declared scale and the auto path.
- **Ladder ordering, agreed with the surveyor:** avoid tiling > smaller sheet > larger figure.
- **`MM_TO_PT = 2.834645669...`** (72/25.4). Already exported from `app-backend/src/services/pdfkitGeoPDF/geometry.js`.
- **Never modify `legacy/`.**
- **Branch:** work on `main`; push with `git push origin HEAD:nov-alpha` (origin/main is an unrelated project).

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `app-backend/src/services/__tests__/helpers/measureDrawnScale.js` | **Create.** Measures the scale a PDF was actually drawn at, from the emitted file | 1 |
| `app-backend/src/services/__tests__/measureDrawnScale.test.js` | **Create.** Proves the instrument is self-consistent | 1 |
| `app-shared/planSheeting.js` | **Modify.** Canonical available area + block-room ceiling | 2 |
| `app-backend/src/services/__tests__/planSheeting.test.js` | **Modify.** Resolver unit tests | 2 |
| `app-backend/src/services/dxfGenerator.js` | **Modify.** Consume the shared area; drop the dead fit model | 3 |
| `app-backend/src/services/__tests__/labelFit.test.js` | **Create.** Stand labels fit their stands | 4 |
| `app-backend/src/services/pdfkitGeoPDF/geometry.js` | **Modify.** Per-bounds inset factor; drop the 0.95 figure inset | 5 |
| `app-backend/src/services/pdfkitGeoPDF.js` | **Modify.** Size the figure box from the scale | 5 |
| `app-backend/src/services/__tests__/scaleTruth.test.js` | **Create.** The load-bearing test | 5 |
| `app-backend/src/services/__tests__/planSheeting.parity.test.js` | **Modify.** Re-point the fill guard; add drawn-size parity and band drift | 6 |
| `app-backend/src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap` | **Regenerate.** | 7 |

---

### Task 1: A drawn-scale measuring instrument

The rest of the plan depends on being able to measure what the PDF actually drew. Every previous attempt in this codebase measured a *model* of the page and validated the label instead of the geometry — that is the mistake this task exists to prevent.

The plan draws corner coordinate crosses labelled with their exact ground values (`Y = +50000`, `X = +2200000`). `pdfjs-dist` extracts both the label text and its position in points, so two labels on the same axis give points-per-ground-metre directly.

**Files:**
- Create: `app-backend/src/services/__tests__/helpers/measureDrawnScale.js`
- Test: `app-backend/src/services/__tests__/measureDrawnScale.test.js`

**Interfaces:**
- Consumes: `generateGeoPDF(options, logger) -> { pdfBuffer, scale, sheetSize, ... }` from `../pdfkitGeoPDF.js`.
- Produces: `measureDrawnScale(pdfBuffer) -> Promise<{ mmPerMetre, denominator, ptPerMetreY, ptPerMetreX, axisAgreement }>`. Tasks 4, 5 and 6 all import this.

- [ ] **Step 1: Write the helper**

```js
// app-backend/src/services/__tests__/helpers/measureDrawnScale.js
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const PT_PER_MM = 72 / 25.4;

/**
 * Measure the scale a PDF was actually DRAWN at, from the emitted file.
 *
 * The plan labels its corner coordinate crosses with exact ground values
 * ("Y = +50000"), so the distance in points between two labels of known ground
 * value IS the drawn scale. This measures the output; it does not model the
 * page. Nothing here may consult figureBounds, the resolver, or the reported
 * scale — that is precisely the mistake this helper exists to prevent.
 *
 * Y labels vary along the page x axis (easting = -y in this projection) and X
 * labels along the page y axis, so each axis is measured independently and the
 * two must agree for the result to be trusted.
 *
 * @param {Buffer} pdfBuffer
 * @returns {Promise<{mmPerMetre:number, denominator:number,
 *                    ptPerMetreY:number, ptPerMetreX:number,
 *                    axisAgreement:number}>}
 */
export async function measureDrawnScale(pdfBuffer) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const page = await doc.getPage(1);
  const items = (await page.getTextContent()).items
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({ text: i.str.trim(), x: i.transform[4], y: i.transform[5] }));

  // Widest pair wins: the longer the baseline, the less label-offset rounding
  // matters. Labels of equal ground value sit at equal positions, so any pair
  // with a non-zero ground separation is valid.
  const ptPerMetre = (pattern, positionOf) => {
    const points = [];
    for (const item of items) {
      const m = item.text.match(pattern);
      if (m) points.push({ ground: Number(m[1]), pos: positionOf(item) });
    }
    let best = null;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dg = Math.abs(points[i].ground - points[j].ground);
        if (dg === 0) continue;
        if (!best || dg > best.dg) {
          best = { dg, dp: Math.abs(points[i].pos - points[j].pos) };
        }
      }
    }
    return best ? best.dp / best.dg : null;
  };

  const ptPerMetreY = ptPerMetre(/^Y\s*=\s*\+?(-?\d+)/, (it) => it.x);
  const ptPerMetreX = ptPerMetre(/^X\s*=\s*\+?(-?\d+)/, (it) => it.y);

  if (!ptPerMetreY || !ptPerMetreX) {
    throw new Error(
      `measureDrawnScale: need two distinct Y and two distinct X coordinate ` +
      `labels; found ptPerMetreY=${ptPerMetreY} ptPerMetreX=${ptPerMetreX}`,
    );
  }

  const mean = (ptPerMetreY + ptPerMetreX) / 2;
  const axisAgreement = Math.abs(ptPerMetreY - ptPerMetreX) / mean;
  const mmPerMetre = mean / PT_PER_MM;

  return {
    mmPerMetre,
    denominator: 1000 / mmPerMetre,
    ptPerMetreY,
    ptPerMetreX,
    axisAgreement,
  };
}
```

- [ ] **Step 2: Write the failing test**

```js
// app-backend/src/services/__tests__/measureDrawnScale.test.js
import { describe, test, expect } from '@jest/globals';
import { generateGeoPDF } from '../pdfkitGeoPDF.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';
import { measureDrawnScale } from './helpers/measureDrawnScale.js';

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

describe('measureDrawnScale — the instrument itself', () => {
  test('both axes agree, so the measurement is not a one-direction artefact', async () => {
    const { pdfBuffer } = await generateGeoPDF({ ...sampleRealisticPlan }, quiet);
    const m = await measureDrawnScale(pdfBuffer);

    // A uniform transform must give the same points-per-metre either way.
    expect(m.axisAgreement).toBeLessThan(0.005);
    expect(m.denominator).toBeGreaterThan(1);
    expect(Number.isFinite(m.mmPerMetre)).toBe(true);
  }, 60000);
});
```

- [ ] **Step 3: Run the test**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js measureDrawnScale`
Expected: PASS. On the current code it measures 6.803 pt/m on both axes — a true 1:417 — while the plan prints 1:600. The instrument is correct; the renderer is not. That gap is what Task 5 closes.

If it fails with "need two distinct Y and two distinct X coordinate labels", the fixture rendered fewer than two corner crosses per axis. Use `sampleMaglasPlan` instead and note the change in the commit message — do **not** weaken the helper to accept one label.

- [ ] **Step 4: Commit**

```bash
git add app-backend/src/services/__tests__/helpers/measureDrawnScale.js app-backend/src/services/__tests__/measureDrawnScale.test.js
git commit -m "test(scale-truth): measure the scale a PDF was actually drawn at"
```

---

### Task 2: Canonical drawing area and the block-room ceiling

Spec §1 and §4. Replaces the resolver's `RESERVE_W 0.72 / RESERVE_H 0.85` guesswork with the real available rectangle, and moves the PDF's `MARGIN_FACTOR = 0.75` block-room budget into the shared model as a feasibility ceiling.

**Files:**
- Modify: `app-shared/planSheeting.js:40-67` (constants and `drawingAreaMm`), `:131-136` (`fitsOn`), `:147-158` (`resolvePlanSheeting` signature)
- Test: `app-backend/src/services/__tests__/planSheeting.test.js`

**Interfaces:**
- Produces: `drawingAreaMm(sheetName, { titleBandMm } = {}) -> { widthMm, heightMm }`; exported constants `TITLE_BAND_ESTIMATE_MM = 55` and `FIGURE_MAX_FRACTION = 0.75`; `resolvePlanSheeting({ ..., titleBandMm })`. Tasks 3, 5 and 6 consume these.

- [ ] **Step 1: Write the failing tests**

Add to `app-backend/src/services/__tests__/planSheeting.test.js`:

```js
describe('drawingAreaMm — the real available area', () => {
  test('is the margin-inset sheet less the title band', () => {
    // 500 - 50 - 150 = 300 wide; 400 - 50 - 50 - 55 = 245 high.
    expect(drawingAreaMm('SI727_500x400')).toEqual({ widthMm: 300, heightMm: 245 });
    expect(drawingAreaMm('SI727_1000x800')).toEqual({ widthMm: 800, heightMm: 645 });
  });

  test('a measured title band overrides the estimate', () => {
    expect(drawingAreaMm('SI727_500x400', { titleBandMm: 46.2 }).heightMm)
      .toBeCloseTo(253.8, 6);
  });
});

describe('resolvePlanSheeting — block-room ceiling', () => {
  test('rejects a candidate that would leave no room for the blocks', () => {
    // 300 x 195 m at 1:1000 is 300 x 195 mm — exactly the full 300 mm width of
    // the smallest sheet's available area. 100% fill leaves the Schedule of
    // Areas nowhere to go, so the finest feasible scale there is 1:1500
    // (200 x 130 mm, inside 75% of 300 x 245).
    const r = resolvePlanSheeting({
      extentM: { widthM: 300, heightM: 195 },
      parcels: stands(20, 5000),
      planType: 'general-undeveloped',
    });
    const onSmallest = r.candidates
      .filter((c) => c.sheetSize === 'SI727_500x400' && !c.needsTiling);

    expect(onSmallest.length).toBeGreaterThan(0);
    expect(onSmallest.every((c) => c.scaleDenominator >= 1500)).toBe(true);
  });

  test('every non-tiling candidate leaves at least a quarter of the area free', () => {
    const r = resolvePlanSheeting({
      extentM: { widthM: 500, heightM: 420 },
      parcels: stands(240, 875),
      planType: 'general-undeveloped',
    });
    for (const c of r.candidates.filter((x) => !x.needsTiling)) {
      const area = drawingAreaMm(c.sheetSize);
      const w = (500 / c.scaleDenominator) * 1000;
      const h = (420 / c.scaleDenominator) * 1000;
      expect(Math.max(w / area.widthMm, h / area.heightMm)).toBeLessThanOrEqual(0.75);
    }
  });
});
```

Add `drawingAreaMm` to the existing import at the top of the file if it is not already there.

- [ ] **Step 2: Run to verify they fail**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js planSheeting.test`
Expected: FAIL — `drawingAreaMm('SI727_500x400')` returns `{ widthMm: 216, heightMm: 255 }` under the old reserve fractions, and candidates at 100% fill are still offered.

- [ ] **Step 3: Implement**

In `app-shared/planSheeting.js`, replace the `RESERVE_W`/`RESERVE_H` block and `drawingAreaMm`:

```js
/**
 * Paper millimetres reserved at the top of the sheet for the title block.
 * Deliberately conservative: measured bands are 46.2 mm (DXF) and 51.9 mm (PDF)
 * on sampleRealisticPlan. Each renderer passes its own measured band when it
 * knows it; this estimate serves the preview, which is only ever a hint.
 */
export const TITLE_BAND_ESTIMATE_MM = 55;

/**
 * Share of the available area the figure may occupy. The remainder is the
 * budget for the Schedule of Areas, coordinate list and endorsement blocks.
 *
 * This is pdfkitGeoPDF's MARGIN_FACTOR, promoted rather than deleted. It is not
 * a fudge: it is the only measured block-room reservation in the system, and
 * without it an honest available area sends the resolver straight to a 100%-fill
 * candidate on the smallest sheet, which then fails block placement and
 * escalates — at a full re-render each time.
 */
export const FIGURE_MAX_FRACTION = 0.75;

/**
 * Figure-available drawing area for one sheet, in millimetres: the margin-inset
 * sheet less the title band. Stand-count independent by design.
 *
 * @param {string} sheetName
 * @param {{titleBandMm?: number}} [opts]
 * @returns {{ widthMm: number, heightMm: number }}
 */
export function drawingAreaMm(sheetName, { titleBandMm = TITLE_BAND_ESTIMATE_MM } = {}) {
  const sheet = SI727_GENERAL_PLAN_SHEET_SIZES.find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`Unknown SI 727 sheet size: ${sheetName}`);
  return {
    widthMm: sheet.width - MARGIN_LEFT - MARGIN_RIGHT,
    heightMm: sheet.height - MARGIN_TOP - MARGIN_BOTTOM - titleBandMm,
  };
}
```

Replace `fitsOn`:

```js
function fitsOn(sheetName, extentM, denominator, titleBandMm) {
  const area = drawingAreaMm(sheetName, { titleBandMm });
  return (extentM.widthM / denominator) * 1000 <= area.widthMm * FIGURE_MAX_FRACTION
      && (extentM.heightM / denominator) * 1000 <= area.heightMm * FIGURE_MAX_FRACTION;
}
```

In `resolvePlanSheeting`, add `titleBandMm = TITLE_BAND_ESTIMATE_MM` to the destructured parameters and pass it to both `fitsOn` call sites (the `fitting` loop and the `tiling` filter).

- [ ] **Step 4: Run the tests**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js planSheeting.test`
Expected: the new tests PASS.

Three existing tests encode the old reserve model and will need their expectations updated — read each failure before changing it, and change the assertion only where the *new* behaviour is correct:
- `'the best candidate fills at least half its drawing area (Maglas regression)'` — still passes (Maglas lands at 1:2500 on `SI727_500x400`, 68.6% fill), but verify rather than assume.
- `'every non-tiling candidate actually fits its drawing area'` — now must account for `FIGURE_MAX_FRACTION`.
- `'escalates the sheet, not the scale, when a declared scale will not fit'` — "fit" is stricter now, so the escalation target may move by one sheet.

- [ ] **Step 5: Check the third consumer**

The resolver has three call sites, not two: `app-backend/src/routes/surveyPlanPreview.js:261` also consumes it. `titleBandMm` is optional, so the route needs no change and keeps compiling — but its *recommendation* changes, by design, and there is **no test coverage for that route anywhere in the repo**.

Confirm by reading `surveyPlanPreview.js:255-290` that it uses only `candidates[0]`, `needsTiling`, `scaleLabel`, `sheetSize` and `reason` — all still present and unchanged in shape. If it reaches into anything this task altered, fix it here rather than leaving it for Task 5.

- [ ] **Step 6: Commit**

```bash
git add app-shared/planSheeting.js app-backend/src/services/__tests__/planSheeting.test.js
git commit -m "feat(sheeting): canonical drawing area with the block-room ceiling"
```

---

### Task 3: DXF inherits the shared area

Spec §3. The DXF is already scale-true (`mmToGround(mm, S) = mm * S / 1000`), and it already takes its scale from the resolver, so this task is deliberately small: confirm the new area flows through, and retire the fit model that is now dead weight.

**Files:**
- Modify: `app-backend/src/services/dxfGenerator.js:605-650`
- Test: `app-backend/src/services/__tests__/planSheeting.parity.test.js` (existing `DXF consumes the shared resolver` block)

**Interfaces:**
- Consumes: `resolvePlanSheeting`, `drawingAreaMm` from Task 2.
- Produces: no signature change. `generateDXF` still returns `{ scale, sheetSize, ... }`.

**Scope note — read before starting.** The spec says each renderer passes its own measured title band. The DXF's band (`dxfGenerator.js:1770`) is computed *after* the scale is chosen and depends on `surveyedFeatures`, which is sorted later still, so passing it to the resolver at `:619` would mean hoisting the parcel sort above the scale decision. The measured gap between the two renderers' bands is 5.6 mm — far below one ladder step — so the DXF keeps using `TITLE_BAND_ESTIMATE_MM` and the drift test in Task 6 guards the decision. Do not do the hoist.

- [ ] **Step 1: Write the failing test**

Add to the `DXF consumes the shared resolver` describe block in `planSheeting.parity.test.js`:

```js
test('DXF honours the block-room ceiling, not just the raw fit', () => {
  const { scale, sheetSize, ...rest } = sampleMaglasPlan;
  const dxf = generateDXF({ ...rest, planType: 'general-undeveloped' }, quiet);

  const denominator = Number(String(dxf.scale).split(':')[1]);
  const area = drawingAreaMm(dxf.sheetSize);
  const { widthM, heightM } = dxfExtentM(sampleMaglasPlan);
  const fill = Math.max(
    (widthM / denominator) * 1000 / area.widthMm,
    (heightM / denominator) * 1000 / area.heightMm,
  );

  expect(fill).toBeLessThanOrEqual(0.75);
  expect(fill).toBeGreaterThan(0.4); // and not absurdly small either
}, 120000);
```

- [ ] **Step 2: Run to verify it fails or passes for the right reason**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js planSheeting.parity -t "block-room ceiling"`
Expected: PASS once Task 2 has landed, because the DXF takes `_pick.scaleDenominator` straight from the resolver. If it FAILS, the DXF is overriding the resolver somewhere — find that override before continuing; do not adjust the threshold.

- [ ] **Step 3: Retire the dead fit model**

In `dxfGenerator.js`, `_figFit` (`selectFigureScale`) is now consulted only for the `minScaleToFit` / `fitScale` values in one diagnostic log line, and as a fallback that the resolver makes unreachable. Keep the call, but make the comment honest — replace the comment block above it with:

```js
  // Retained for the diagnostic log line below only. The shared resolver is the
  // authority for the scale (see _sheeting); this fit model does not participate
  // in the decision and must not be reintroduced into it.
```

- [ ] **Step 4: Run the DXF suites**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js dxf`
Expected: PASS. `dxfGenerator.snapshot.test.js` may move if the resolver now picks a different scale for a fixture — inspect the diff and confirm the new scale is the one the ceiling implies before regenerating.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/dxfGenerator.js app-backend/src/services/__tests__/planSheeting.parity.test.js
git commit -m "feat(dxf): honour the shared block-room ceiling"
```

---

### Task 4: Label-fit guard, before the geometry moves

Spec Risk 1. The figure is about to shrink ~3.6× linearly while every text element keeps its point size, so stand numbers become relatively ~3× larger against the parcels they sit inside. This test must exist *before* Task 5 so the baseline is honest.

**Files:**
- Create: `app-backend/src/services/__tests__/labelFit.test.js`

**Interfaces:**
- Consumes: `measureDrawnScale` (Task 1), `generateGeoPDF`.

- [ ] **Step 1: Write the test**

```js
// app-backend/src/services/__tests__/labelFit.test.js
import { describe, test, expect } from '@jest/globals';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { generateGeoPDF } from '../pdfkitGeoPDF.js';
import { sampleMaglasPlan } from './fixtures/sampleMaglasPlan.js';
import { measureDrawnScale } from './helpers/measureDrawnScale.js';

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const PT_PER_MM = 72 / 25.4;

// Replaced with the observed count in Step 3. Infinity here means "discover the
// baseline"; leaving it at Infinity would make this test assert nothing.
const BASELINE_OVERFLOWING = Infinity;

/** Narrowest width of a polygon in ground metres (its "thickness"). */
function narrowestWidthM(ring) {
  const v = ring.slice(0, -1);
  let thickness = Infinity;
  for (let i = 0; i < v.length; i++) {
    const j = (i + 1) % v.length;
    const dx = v[j][0] - v[i][0];
    const dy = v[j][1] - v[i][1];
    const len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len < 1e-9) continue;
    let maxPerp = 0;
    for (let k = 0; k < v.length; k++) {
      if (k === i || k === j) continue;
      const perp = Math.abs((v[k][0] - v[i][0]) * dy - (v[k][1] - v[i][1]) * dx) / len;
      if (Number.isFinite(perp)) maxPerp = Math.max(maxPerp, perp);
    }
    if (maxPerp > 0) thickness = Math.min(thickness, maxPerp);
  }
  return thickness;
}

describe('stand labels fit the stands they name', () => {
  test('no stand number is wider on paper than its own stand', async () => {
    const { pdfBuffer } = await generateGeoPDF(
      { ...sampleMaglasPlan, planType: 'general-undeveloped' }, quiet,
    );
    const { mmPerMetre } = await measureDrawnScale(pdfBuffer);

    // Ground width of each stand, by designation.
    const widthByStand = new Map();
    for (const f of sampleMaglasPlan.parcels.features) {
      const stand = String(f.properties?.stand ?? '').trim();
      const ring = f.geometry?.type === 'Polygon' ? f.geometry.coordinates?.[0] : null;
      if (!stand || !ring || ring.length < 4) continue;
      widthByStand.set(stand, narrowestWidthM(ring));
    }

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer), useSystemFonts: false, verbosity: 0,
    }).promise;
    const page = await doc.getPage(1);

    const overflowing = [];
    for (const it of (await page.getTextContent()).items) {
      const text = (it.str || '').trim();
      if (!widthByStand.has(text)) continue;          // only stand-number labels
      const labelMm = it.width / PT_PER_MM;
      const standMm = widthByStand.get(text) * mmPerMetre;
      if (labelMm > standMm) overflowing.push({ text, labelMm, standMm });
    }

    // Baseline: record what the CURRENT renderer does. Task 5 shrinks every
    // stand on paper while the label keeps its point size, so this number is
    // the thing that must not grow.
    console.log(`[labelFit] ${overflowing.length} labels wider than their stand`);
    expect(overflowing.length).toBeLessThanOrEqual(BASELINE_OVERFLOWING);
  }, 600000);
});
```

- [ ] **Step 2: Discover the baseline**

Run the test as written (with `BASELINE_OVERFLOWING = Infinity`) and read the count from the `[labelFit]` line.

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js labelFit`

- [ ] **Step 3: Pin the baseline**

Replace the placeholder with the observed number and a comment recording when and from what it was measured, e.g.:

```js
// Measured on the current renderer, 2026-09-01, before the scale-truth change.
// A non-zero baseline is a pre-existing defect, not a licence to grow it.
const BASELINE_OVERFLOWING = 0;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js labelFit`
Expected: PASS at exactly the pinned baseline.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/__tests__/labelFit.test.js
git commit -m "test(labels): guard stand-label fit before the figure shrinks"
```

---

### Task 5: The PDF draws at the scale

Spec §2. The core change. Everything before this was scaffolding; everything after is verification.

**Files:**
- Modify: `app-backend/src/services/pdfkitGeoPDF/geometry.js:518` (inset factor), `:553-580` (`calculateMapBounds`)
- Modify: `app-backend/src/services/pdfkitGeoPDF.js:4783-4790` (`drawScaleBar`), `:9599-9616` (`checkMarginConstraint`), `:9633-9782` (`calculateOptimalScale`), `:10517-10563` (extent expansion + alignment)
- Test: `app-backend/src/services/__tests__/scaleTruth.test.js`

**Interfaces:**
- Consumes: `measureDrawnScale` (Task 1), `drawingAreaMm` / `FIGURE_MAX_FRACTION` (Task 2).
- Produces: no public signature change. `generateGeoPDF` still returns `{ pdfBuffer, scale, sheetSize, tileGrid, warnings, ... }`.

- [ ] **Step 1: Write the failing test**

```js
// app-backend/src/services/__tests__/scaleTruth.test.js
import { describe, test, expect } from '@jest/globals';
import { generateGeoPDF } from '../pdfkitGeoPDF.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js';
import { measureDrawnScale } from './helpers/measureDrawnScale.js';

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

/** A plan is a scaled document: the drawing must match the ratio it prints. */
async function drawnVsStated(options) {
  const { pdfBuffer, scale } = await generateGeoPDF(options, quiet);
  const { denominator } = await measureDrawnScale(pdfBuffer);
  const stated = Number(String(scale).split(':')[1]);
  return { stated, drawn: denominator, error: Math.abs(denominator / stated - 1) };
}

describe('the PDF draws at the scale it states', () => {
  test('realistic fixture, auto', async () => {
    const { scale: _s, sheetSize: _ss, ...rest } = sampleRealisticPlan;
    const r = await drawnVsStated({ ...rest, planType: 'general-undeveloped' });
    // 1% covers coordinate-label rounding, nothing more. Before this change the
    // error was 30.6%: stated 1:600, drawn 1:417.
    expect(r.error).toBeLessThan(0.01);
  }, 120000);

  test('a declared scale is honoured metrically, not just in the caption', async () => {
    const { scale: _s, sheetSize: _ss, ...rest } = sampleRealisticPlan;
    const fine   = await drawnVsStated({ ...rest, planType: 'general-undeveloped', scale: '1:1000' });
    const coarse = await drawnVsStated({ ...rest, planType: 'general-undeveloped', scale: '1:2000' });

    expect(fine.error).toBeLessThan(0.01);
    expect(coarse.error).toBeLessThan(0.01);
    // Halving the scale must halve the drawing. Before this change both runs
    // produced an identical 720 x 468 mm figure.
    expect(coarse.drawn / fine.drawn).toBeCloseTo(2, 1);
  }, 180000);

  test('minimal fixture, auto', async () => {
    const { scale: _s, sheetSize: _ss, ...rest } = sampleMinimalPlan;
    const r = await drawnVsStated({ ...rest, planType: 'general-undeveloped' });
    expect(r.error).toBeLessThan(0.01);
  }, 120000);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js scaleTruth`
Expected: FAIL with `error` around `0.306` on the first test, and a ratio near `1` instead of `2` on the second.

- [ ] **Step 3: Make the inset a property of the bounds**

In `geometry.js`, inside `transformCoords`, replace the constant:

```js
  // A caller that has already sized its box to the exact figure passes
  // insetFactor: 0 — any inset would then shrink the drawing off its scale.
  const INSET_FACTOR = pdfBounds.insetFactor ?? 0.05;
```

- [ ] **Step 4: Stop pre-shrinking the figure boundary**

In `geometry.js`, `calculateMapBounds`, replace the `figureScale` block and the `figureBoundary` object with:

```js
  // The figure boundary is the available area, not a shrunken fraction of it.
  // The caller subtracts the title band and then sizes the figure box from the
  // resolved scale, so any fraction applied here would silently rescale the
  // drawing.
  const figureBoundary = { ...mainBoundary };
```

- [ ] **Step 5: Size the figure box from the scale**

In `pdfkitGeoPDF.js`, delete the entire extent-expansion block (the one opening with `// ── Expand extent proportionally when scale is stepped up ──`, around `:10517-10547`) and replace the `POLYGON ALIGNMENT OPTIMISATION` block that follows it with:

```js
  // ── Size the figure box from the resolved scale ──
  // The box IS the scale: transformCoords fits the extent into whatever box it
  // is given, so making the box exactly extent/S wide lands the drawing on S by
  // construction. insetFactor: 0 because the box carries no slack of its own.
  //
  // Horizontal alignment is unchanged in spirit: when the figure leaves a wide
  // strip, push it left so the slack forms one contiguous right-hand column,
  // which is where the Schedule of Areas prefers to sit.
  {
    const extWm = calculatedExtent.maxY - calculatedExtent.minY;
    const extHm = calculatedExtent.maxX - calculatedExtent.minX;
    const figW = (extWm / optimalScale.value) * 1000 * MM_TO_PT;
    const figH = (extHm / optimalScale.value) * 1000 * MM_TO_PT;

    const hSlack = figureBounds.width - figW;
    const vSlack = figureBounds.height - figH;
    const alignX = hSlack > 40 ? 'left' : 'center';

    figureBounds = {
      x: alignX === 'left' ? figureBounds.x : figureBounds.x + Math.max(0, hSlack) / 2,
      y: figureBounds.y + Math.max(0, vSlack) / 2,
      width: figW,
      height: figH,
      insetFactor: 0,
      alignX,
    };

    logger.info({
      msg: '[PDFKit] 📐 Figure box sized from the scale',
      scale: optimalScale.label,
      figure: `${(figW / MM_TO_PT).toFixed(1)}mm × ${(figH / MM_TO_PT).toFixed(1)}mm`,
      slack: `${(hSlack / MM_TO_PT).toFixed(1)}mm × ${(vSlack / MM_TO_PT).toFixed(1)}mm`,
      alignX,
    });
  }
```

Note: the `DYNAMIC MAP POSITIONING OPTIMIZATION` block above (`mapXOffset`) now only nudges an `x` this block overwrites. Leave it in place — removing it is out of scope — but do not reintroduce its offset into the box.

- [ ] **Step 6: Make scale selection consult the canonical area**

In `calculateOptimalScale`:

1. Delete `checkMarginConstraint` (`:9599-9616`) and every call to it.
2. Delete the `--- ENLARGE the figure to dominate the sheet ---` block and the `--- Apply 90% margin constraint ---` `while` loop.
3. Replace the auto-calculate branch's area with the canonical one, and return through the existing ceiling:

```js
  if (candidateIndex === -1) {
    // Auto: the finest prescribed scale whose figure fits the block-room budget.
    const area = drawingAreaMm(pageSizeName);
    const minRequired = Math.max(
      (extentWidth  * 1000) / (area.widthMm  * FIGURE_MAX_FRACTION),
      (extentHeight * 1000) / (area.heightMm * FIGURE_MAX_FRACTION),
    );
    candidateIndex = SI727_PRESCRIBED_SCALES.findIndex((s) => s.value >= minRequired);
    if (candidateIndex === -1) candidateIndex = SI727_PRESCRIBED_SCALES.length - 1;
  }
```

4. Keep the `authoritativeDenominator` branch, the `requestedScale` branch, the `forceMinDenominator` step-up, and `applyPlanTypeCeiling` exactly as they are — they encode Reg 32(3), the surveyor's declared scale, and the block-placement retry.
5. `calculateOptimalScale` needs the sheet name to look up the area: add a `pageSizeName` parameter and pass `pageSize.code` at the call site (`:10500`). Import `drawingAreaMm` and `FIGURE_MAX_FRACTION` from `../../../app-shared/planSheeting.js` alongside the existing `resolvePlanSheeting` import.

- [ ] **Step 7: Make the scale bar tell the truth**

In `drawScaleBar`, move the denominator parse above `metersPerPoint` and derive the latter from it:

```js
  // Extract scale denominator from scale.label (e.g., "1:500" → 500)
  let denominator = 1000; // Default fallback
  if (scale && scale.label) {
    const match = scale.label.match(/:(\d+)/);
    if (match) denominator = parseInt(match[1], 10);
  }

  // Ground metres per PDF point AT THE STATED SCALE. Deriving this from the box
  // (mapWidthMeters / _figW) made the bar agree with a drawing whose scale was
  // wrong, and disagree with the ratio printed beside it.
  const metersPerPoint = denominator * 0.000352778; // 1 pt = 0.352778 mm
```

Delete the now-unused `const mapWidthMeters = ...` and `const _figW = ...` if nothing else in the function uses them (`_ref` is separate — keep it).

- [ ] **Step 8: Run the scale-truth test**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js scaleTruth`
Expected: PASS, all three cases.

- [ ] **Step 9: Run the label-fit guard**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js labelFit`
Expected: PASS at the Task 4 baseline. **If it fails, stop.** A grown overflow count is the predicted regression, not a test to relax — report the count and the scale the plan resolved to before changing anything.

- [ ] **Step 10: Commit**

```bash
git add app-backend/src/services/pdfkitGeoPDF.js app-backend/src/services/pdfkitGeoPDF/geometry.js app-backend/src/services/__tests__/scaleTruth.test.js
git commit -m "fix(pdf): draw the figure at the scale the plan states"
```

---

### Task 6: Cross-renderer guards

Spec Testing. Re-points the guard that validated a label, and adds the two comparisons that keep the renderers honest to each other.

**Files:**
- Modify: `app-backend/src/services/__tests__/planSheeting.parity.test.js`

**Interfaces:**
- Consumes: `measureDrawnScale` (Task 1), `drawingAreaMm` (Task 2).

- [ ] **Step 0: Add the missing import**

`planSheeting.parity.test.js` already imports `generateGeoPDF`, `generateDXF`, `drawingAreaMm` and the fixtures. Add:

```js
import { measureDrawnScale } from './helpers/measureDrawnScale.js';
```

- [ ] **Step 1: Re-point the postage-stamp guard at drawn geometry**

Replace the body of the `auto never produces a postage-stamp figure` test (added in `242ec69`) — it currently computes fill from `pdf.scale` against the resolver's own model, so it validates the label:

```js
describe('auto never produces a postage-stamp figure', () => {
  test('Maglas on full auto fills a usable fraction of the sheet', async () => {
    const { scale, sheetSize, ...rest } = sampleMaglasPlan;
    const pdf = await generateGeoPDF({ ...rest, planType: 'general-undeveloped' }, quiet);

    // Measured from the emitted PDF, not from pdf.scale: the earlier version of
    // this test asserted the label and would have passed on a plan drawn at the
    // wrong size.
    const { mmPerMetre } = await measureDrawnScale(pdf.pdfBuffer);
    const { widthM, heightM } = dxfExtentM(sampleMaglasPlan);
    const area = drawingAreaMm(pdf.sheetSize);
    const fill = Math.max(
      (widthM * mmPerMetre) / area.widthMm,
      (heightM * mmPerMetre) / area.heightMm,
    );

    // Pre-fix the label implied 0.088. The ceiling caps the honest figure at
    // 0.75, so anything below a third is the postage-stamp failure returning.
    expect(fill).toBeGreaterThan(0.33);
    expect(fill).toBeLessThanOrEqual(0.76);
  }, 600000);
});
```

- [ ] **Step 2: Add drawn-size parity**

```js
test('PDF and DXF draw the same figure at the same size', async () => {
  const { scale, sheetSize, ...rest } = sampleRealisticPlan;
  const opts = { ...rest, planType: 'general-undeveloped' };

  const pdf = await generateGeoPDF(opts, quiet);
  const dxf = generateDXF(opts, quiet);
  const { mmPerMetre } = await measureDrawnScale(pdf.pdfBuffer);

  const dxfDenominator = Number(String(dxf.scale).split(':')[1]);
  const pdfDenominator = 1000 / mmPerMetre;

  // Phase 1's parity suite compared the two reported labels, which agreed while
  // the drawings did not: DXF is scale-true, PDF was not.
  expect(pdf.sheetSize).toBe(dxf.sheetSize);
  expect(pdfDenominator / dxfDenominator).toBeCloseTo(1, 2);
}, 180000);
```

- [ ] **Step 3: Add the title-band drift guard**

```js
test('the two renderers reserve title bands within 15mm of each other', async () => {
  let pdfBandPt = null;
  const capture = {
    info: (m) => {
      if (typeof m === 'string') {
        const hit = m.match(/Reserved ([\d.]+)pt title band/);
        if (hit) pdfBandPt = parseFloat(hit[1]);
      }
    },
    warn: () => {}, error: () => {}, debug: () => {},
  };
  const { scale, sheetSize, ...rest } = sampleRealisticPlan;
  await generateGeoPDF({ ...rest, planType: 'general-undeveloped' }, capture);

  const pdfBandMm = pdfBandPt / (72 / 25.4);

  // Measured 2026-09-01: PDF 51.9mm, DXF 46.2mm. TITLE_BAND_ESTIMATE_MM = 55 is
  // conservative above both. This guards the decision NOT to share the title
  // formatters — if either title block changes shape, the estimate must be
  // revisited rather than silently drifting.
  expect(pdfBandMm).toBeGreaterThan(30);
  expect(pdfBandMm).toBeLessThan(55);
}, 120000);
```

- [ ] **Step 4: Run the parity suite**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js planSheeting.parity`
Expected: PASS. Budget ~8 minutes; the Maglas cases dominate.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/__tests__/planSheeting.parity.test.js
git commit -m "test(scale-truth): guard drawn size, not the reported label"
```

---

### Task 7: Regenerate snapshots and verify the whole suite

**Files:**
- Regenerate: `app-backend/src/services/__tests__/__snapshots__/pdfkitGeoPDF.snapshot.test.js.snap`, and `dxfGenerator.snapshot.test.js.snap` if Task 3 moved it.

- [ ] **Step 1: Look at the change before accepting it**

Render one fixture to a file and open it. The snapshot diff will be total — every text position moves once the sheet and figure size change — so it cannot be reviewed line by line, and it is not the thing that tells you whether the output is good.

```bash
cd app-backend && node -e "
import('./src/services/pdfkitGeoPDF.js').then(async (m) => {
  const { sampleRealisticPlan: f } = await import('./src/services/__tests__/fixtures/sampleRealisticPlan.js');
  const { scale, sheetSize, ...rest } = f;
  const q = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  const { pdfBuffer, scale: s, sheetSize: sz } = await m.generateGeoPDF({ ...rest, planType: 'general-undeveloped' }, q);
  require('fs').writeFileSync('scale-truth-check.pdf', pdfBuffer);
  console.log('wrote scale-truth-check.pdf at', s, 'on', sz);
});
"
```

Check by eye: the figure is not crowded off the sheet, the Schedule of Areas has somewhere to sit, stand numbers are legible inside their stands, and the scale bar's graduations agree with a ruler held against the drawing at the stated ratio.

- [ ] **Step 2: Regenerate the snapshots**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js snapshot -u`

- [ ] **Step 3: Run the full backend suite**

Run: `cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js`
Expected: all suites pass. Budget ~40 minutes — the pre-change baseline was 65 suites / 896 tests / 6 snapshots in 2239 s, plus the new suites here.

Report the actual counts. Do not describe the suite as green without the summary line in hand.

- [ ] **Step 4: Run the frontend suite**

Run: `cd app-frontend && npm test`
Expected: pass. The baseline was 40 files / 349 tests.

- [ ] **Step 5: Commit**

```bash
git add app-backend/src/services/__tests__/__snapshots__/
git commit -m "test: regenerate position snapshots for the scale-true figure"
```

- [ ] **Step 6: Delete the scratch PDF**

```bash
rm -f app-backend/scale-truth-check.pdf
```

---

## Follow-ups this plan deliberately does not do

- **Re-confirm the sheet ordering with the surveyor.** "Smaller sheet > larger figure" now dominates the outcome more than scale truth does: same fixture, same ceiling, 200 × 130 mm on the small sheet versus 600 × 390 mm on the large one. That ordering was agreed when the numbers were hypothetical. Flipping it is a change to `resolvePlanSheeting`'s candidate ordering, not to this design.
- **Verify one output against `D:\para2026`.** Scale a known distance off a rendered plan by hand against the SG reference material, to confirm the 1% tolerance in Task 5 corresponds to a plan a surveyor would accept.
- **Tiled output.** `generateTiledGeoPDF` renders each tile through the same path, so it inherits the fix, but no test in this plan covers a tiled render.
- **The DXF's measured title band.** See the scope note in Task 3.
