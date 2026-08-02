# Beacon Adjustment Report Sketch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the SI 727 s.67(5) graphical comparison sketch to `beaconAdjustmentReport.js` (the Compare tool's own standalone "Download Report" export), styled to match that file's own existing visual conventions, immediately after its existing tabular Edge Compliance section.

**Architecture:** Reuse the pure, already-shipped `beaconComparisonSketchLayout.ts` geometry helpers unchanged. Reuse the already-shipped, now-exported `formatSignedDMS`. Draw with this file's own established visual package (bordered box, tick-marked scale bar via `beaconReportGeometry.js`'s `scaleBarMetres`, south arrow via the existing `_arrowhead` helper) rather than importing the other report's look. Same black-rays-always / red-circled-failures convention as the shipped feature, unchanged.

**Tech Stack:** Vue 3 + TypeScript/JavaScript, Vitest, jsPDF 3.0.4 (frontend only — no backend changes).

## Global Constraints

- All work is in `app-frontend`. Run tests with `npx vitest run <file>` for filtered runs, `npm test` for the full suite.
- jsPDF documents in this file use **millimetres** as the unit (`new jsPDF({ unit: 'mm', ... })`).
- **Ray lines are always plain black** — never colour-coded by pass/fail. Pass/fail is shown only by circling the failing figure(s) in red. This is a fixed, user-confirmed rule already enforced (and tested) in the shipped feature — do not deviate from it here.
- Colour convention: historical distance black (`setTextColor(0,0,0)`), current-survey distance red (`setTextColor(220,0,0)`) — same RGB already used throughout this file (e.g. `addScheduleLandscape`'s `textColor: [220, 38, 38]` for survey columns — note: this file uses `[220,38,38]` in some places and `[220,0,0]` conceptually elsewhere; use `[220, 0, 0]` for the new ray annotations to match the shipped `beaconComparisonSection.ts` sketch's exact RGB, since this is the same visual rule carried over, not a new one invented for this file).
- End every task by committing. Commit messages end with the repo's trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

### Task 1: Export `formatSignedDMS`

**Files:**
- Modify: `app-frontend/src/utils/beaconComparisonSection.ts`
- Test: `app-frontend/src/utils/__tests__/beaconComparisonSection.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `formatSignedDMS(deg: number): string`, now exported (was module-private), for Task 2 to import.

- [ ] **Step 1: Write the failing test**

Append to `app-frontend/src/utils/__tests__/beaconComparisonSection.test.ts`:

```ts
import { formatSignedDMS } from '../beaconComparisonSection';

describe('formatSignedDMS (exported for reuse by beaconAdjustmentReport.js)', () => {
  it('prefixes a minus sign for negative input instead of wrapping into [0,360)', () => {
    expect(formatSignedDMS(-2)).toBe('-2°00\'00.0"');
  });

  it('formats positive input identically to formatDMS', () => {
    expect(formatSignedDMS(2)).toBe('2°00\'00.0"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonSection.test.ts`
Expected: FAIL — `formatSignedDMS` is not exported from the module, so the import fails
(TypeScript/test-runner error, not a runtime assertion failure).

- [ ] **Step 3: Add the export**

In `app-frontend/src/utils/beaconComparisonSection.ts`, find:

```ts
function formatSignedDMS(deg: number): string {
```

Change to:

```ts
export function formatSignedDMS(deg: number): string {
```

Do not change the function body — it is already correct (used by the shipped sketch feature).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconComparisonSection.test.ts`
Expected: PASS (17 existing tests + 2 new = 19).

- [ ] **Step 5: Commit**

```bash
git add app-frontend/src/utils/beaconComparisonSection.ts app-frontend/src/utils/__tests__/beaconComparisonSection.test.ts
git commit -m "refactor(beacon-comparison): export formatSignedDMS for reuse by beaconAdjustmentReport.js

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Add the comparison sketch to `beaconAdjustmentReport.js`

**Files:**
- Modify: `app-frontend/src/utils/beaconAdjustmentReport.js`
- Test: `app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts` (new — this file has no existing tests)

**Interfaces:**
- Consumes: `computeExtent`, `pickSketchScale`, `makeSketchTransform`, `midpointOffset` from `beaconComparisonSketchLayout.ts`; `formatSignedDMS` from `beaconComparisonSection.ts` (Task 1); `scaleBarMetres` (already imported in this file from `beaconReportGeometry.js`); the existing `this._arrowhead(...)` method (already present, unchanged).
- Produces: no new exports — `addEdgeComplianceSketch` is a new method on the existing (unexported) `BeaconAdjustmentReport` class, called only from `generate()`.

- [ ] **Step 1: Write the failing tests**

Create `app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';

// generateBeaconAdjustmentReport calls doc.save(...) directly (a browser download side
// effect) rather than returning the document, so these tests intercept jsPDF's
// constructor-level methods the same way beaconComparisonSection.test.ts's renderCapturing
// does: patch jsPDF.prototype before constructing, capture calls, then let save() run
// (jsdom's default test environment has no real download mechanism, so save() is a no-op
// side effect here, not something we need to prevent).
import { generateBeaconAdjustmentReport } from '../beaconAdjustmentReport';

function makeResult(overrides: Partial<any> = {}) {
  const pts = [
    { id: 1, name: '86B', yH: 50000.0, xH: 2200000.0, yS: 50000.02, xS: 2200000.03,
      dY: 0.02, dX: 0.03, vY: 0.001, vX: -0.001, resDist: 0.001, resBrg: 90, wMax: 0.4, finalStatus: 'ACCEPT',
      yT: 50000.01, xT: 2200000.02, tvY: 0.001, tvX: -0.001, tResid: 0.001, tBrg: 90, rY: 0.8, rX: 0.8 },
    { id: 2, name: '87A', yH: 50140.0, xH: 2200150.0, yS: 50140.01, xS: 2200150.02,
      dY: 0.01, dX: 0.02, vY: 0.001, vX: -0.001, resDist: 0.001, resBrg: 90, wMax: 0.3, finalStatus: 'ACCEPT',
      yT: 50140.005, xT: 2200150.01, tvY: 0.001, tvX: -0.001, tResid: 0.001, tBrg: 90, rY: 0.85, rX: 0.85 },
    { id: 3, name: '87B', yH: 50060.0, xH: 2200070.0, yS: 50060.03, xS: 2200070.01,
      dY: 0.03, dX: 0.01, vY: 0.001, vX: -0.001, resDist: 0.001, resBrg: 90, wMax: 0.5, finalStatus: 'ACCEPT',
      yT: 50060.015, xT: 2200070.005, tvY: 0.001, tvX: -0.001, tResid: 0.001, tBrg: 90, rY: 0.82, rX: 0.82 },
  ];
  const edgeRow = (from: string, to: string, distOk: boolean, dirOk: boolean) => ({
    from, to, dH: 140.0, dS: 140.05, dDiff: 0.05, dAllow: 0.04,
    distOk, brgH: 130.5, brgS: 130.502, dirDiffSec: -7200, dirAllowSec: 45.0, dirOk,
    pass: distOk && dirOk,
  });
  return {
    adj: {
      params: { TY: 0.02, TX: -0.01, scale: 1.0001, ppm: 100, rotDeg: 0.001, se: { TY: 0.01, TX: 0.01, scale: 1e-4, ppm: 10, rotSec: 5 } },
      stats: { sig0: 0.01, s0: 0.02, DOF: 2, chi2: 3, chi2L: 0.1, chi2U: 6 },
    },
    pts,
    log: [{ iter: 1, n: 3, s0: 0.02, chi2: 3, chi2L: 0.1, chi2U: 6 }],
    converged: true,
    loo: { rows: [], rmsLoo: 0.01, maxLoo: 0.02, note: null },
    edges: {
      rows: [edgeRow('86B', '87A', true, true), edgeRow('86B', '87B', false, false), edgeRow('87A', '87B', true, true)],
      summary: { totalLines: 3, distPass: 2, dirPass: 2, bothPass: 2, meanScale: 1.0001, meanSwingDeg: -0.001 },
    },
    surveyClass: 'B',
    ...overrides,
  };
}

function renderCapturing(result: any) {
  const written: string[] = [];
  const lines: Array<{ color: [number, number, number]; x1: number; y1: number; x2: number; y2: number }> = [];
  const ellipses: Array<{ color: [number, number, number] }> = [];
  let currentDrawColor: [number, number, number] = [0, 0, 0];

  const originalText = jsPDF.prototype.text;
  const originalSetDrawColor = jsPDF.prototype.setDrawColor;
  const originalLine = jsPDF.prototype.line;
  const originalCircle = jsPDF.prototype.circle;
  const originalEllipse = jsPDF.prototype.ellipse;

  (jsPDF.prototype as any).text = function (text: any, ...rest: any[]) {
    written.push(Array.isArray(text) ? text.join(' ') : String(text));
    return originalText.apply(this, [text, ...rest] as any);
  };
  (jsPDF.prototype as any).setDrawColor = function (...args: any[]) {
    if (args.length >= 3) currentDrawColor = [args[0], args[1], args[2]];
    else if (args.length === 1) currentDrawColor = [args[0], args[0], args[0]];
    return originalSetDrawColor.apply(this, args as any);
  };
  (jsPDF.prototype as any).line = function (x1: number, y1: number, x2: number, y2: number, ...rest: any[]) {
    lines.push({ color: currentDrawColor, x1, y1, x2, y2 });
    return originalLine.apply(this, [x1, y1, x2, y2, ...rest] as any);
  };
  // jsPDF's own circle() is implemented internally as this.ellipse(x,y,r,r,style) (confirmed
  // against node_modules/jspdf/dist/jspdf.node.js during the shipped sketch feature's review)
  // -- without this guard, every beacon-marker circle (drawn via doc.circle in the new method,
  // AND the historical/survey dots this file's OWN addDisplacementPlot draws elsewhere) would
  // also land in the `ellipses` capture meant only for tolerance-violation circling.
  let inCircleCall = false;
  (jsPDF.prototype as any).circle = function (...args: any[]) {
    inCircleCall = true;
    try {
      return originalCircle.apply(this, args as any);
    } finally {
      inCircleCall = false;
    }
  };
  (jsPDF.prototype as any).ellipse = function (...args: any[]) {
    if (!inCircleCall) ellipses.push({ color: currentDrawColor });
    return originalEllipse.apply(this, args as any);
  };
  // jsPDF's own save() writes to the DOM in a browser; under Vitest's default environment
  // it may throw or no-op. Stub it so the report-generation call completes without a real
  // download, matching how this file is actually invoked (CompareView.vue's button handler
  // doesn't await anything after calling it either).
  const originalSave = jsPDF.prototype.save;
  (jsPDF.prototype as any).save = function () { return this; };

  try {
    generateBeaconAdjustmentReport(result, { surveyorName: 'Test', plsNumber: '1', location: 'X', priorSurvey: 'SR 1/2026', date: '2026-08-02', critW: 2.576 });
  } finally {
    jsPDF.prototype.text = originalText;
    jsPDF.prototype.setDrawColor = originalSetDrawColor;
    jsPDF.prototype.line = originalLine;
    jsPDF.prototype.circle = originalCircle;
    jsPDF.prototype.ellipse = originalEllipse;
    jsPDF.prototype.save = originalSave;
  }
  return { written, lines, ellipses };
}

describe('addEdgeComplianceSketch (via generateBeaconAdjustmentReport)', () => {
  it('renders the sketch heading, beacon names, and distance/swing figures', () => {
    const { written } = renderCapturing(makeResult());
    expect(written).toContain('Comparison Sketch — SI 727 §67(5)');
    expect(written).toContain('86B');
    expect(written).toContain('87A');
    expect(written).toContain('87B');
    expect(written).toContain('140.000'); // historical distance
    expect(written).toContain('140.050'); // survey distance
    expect(written.some((w) => /SI 727 Class B/.test(w))).toBe(true);
  });

  it('draws every ray in plain black regardless of pass/fail, and circles only the failing figures', () => {
    const { lines, ellipses } = renderCapturing(makeResult());
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => l.color[0] === 0 && l.color[1] === 0 && l.color[2] === 0)).toBe(true);
    // 3 edges: 86B-87A and 87A-87B pass both checks (0 circles each); 86B-87B fails both
    // (2 circles: distance figure + swing figure) -> 2 ellipses total.
    expect(ellipses.length).toBe(2);
  });

  it('renders a negative swing with an explicit minus sign, not wrapped into [0,360)', () => {
    const { written } = renderCapturing(makeResult());
    expect(written.some((w) => w.startsWith('-2°'))).toBe(true);
    expect(written.some((w) => w.startsWith('357°') || w.startsWith('358°'))).toBe(false);
  });

  it('does nothing (no sketch heading) when there are no edges', () => {
    const { written } = renderCapturing(makeResult({ edges: { rows: [], summary: { totalLines: 0, distPass: 0, dirPass: 0, bothPass: 0, meanScale: null, meanSwingDeg: null } } }));
    expect(written).not.toContain('Comparison Sketch — SI 727 §67(5)');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconAdjustmentReport.test.ts`
Expected: FAIL — `'Comparison Sketch — SI 727 §67(5)'` never appears in `written` (the method
doesn't exist yet).

- [ ] **Step 3: Add the imports**

At the top of `app-frontend/src/utils/beaconAdjustmentReport.js`, change:

```js
import { f3, f4, f4s, formatDMS } from '@/utils/surveyMath'
import { planScaleMmPerM, chooseExaggeration, scaleBarMetres, sanitizeReportFilename } from '@/utils/beaconReportGeometry'
```

to:

```js
import { f3, f4, f4s, formatDMS } from '@/utils/surveyMath'
import { planScaleMmPerM, chooseExaggeration, scaleBarMetres, sanitizeReportFilename } from '@/utils/beaconReportGeometry'
import { computeExtent, pickSketchScale, makeSketchTransform, midpointOffset } from '@/utils/beaconComparisonSketchLayout'
import { formatSignedDMS } from '@/utils/beaconComparisonSection'
```

- [ ] **Step 4: Add the `addEdgeComplianceSketch` method**

Insert this new method immediately after the existing `addEdgeCompliance(result) { ... }`
method (i.e. between it and `addFooters()`):

```js
  addEdgeComplianceSketch(result) {
    const edges = result.edges
    if (!edges || !edges.rows.length) return

    const byName = {}
    for (const p of result.pts) byName[p.name] = { y: p.yH, x: p.xH }
    const names = new Set()
    for (const row of edges.rows) { names.add(row.from); names.add(row.to) }
    const points = Array.from(names)
      .map((name) => ({ name, pt: byName[name] }))
      .filter((p) => !!p.pt)
    if (points.length < 2) return

    this.doc.addPage('a4', 'portrait'); this.y = this.margin
    this.sectionTitle('Comparison Sketch — SI 727 §67(5)')

    const boxX = this.margin, boxYtop = this.y, boxW = this.pw - 2 * this.margin, boxH = 170
    this.doc.setDrawColor(120); this.doc.setLineWidth(0.3); this.doc.rect(boxX, boxYtop, boxW, boxH)

    const pad = 16
    const areaMm = { width: boxW - 2 * pad, height: boxH - 2 * pad }
    const extent = computeExtent(points.map((p) => p.pt))
    const { denom, label } = pickSketchScale(extent, areaMm)
    const originMm = { x: boxX + pad, y: boxYtop + pad }
    const transform = makeSketchTransform(extent, areaMm, denom, originMm)
    const positioned = new Map(points.map((p) => [p.name, transform(p.pt)]))

    // Rays -- always plain black, drawn before annotations so text sits on top.
    this.doc.setDrawColor(0, 0, 0); this.doc.setLineWidth(0.25)
    for (const row of edges.rows) {
      const a = positioned.get(row.from), b = positioned.get(row.to)
      if (!a || !b) continue
      this.doc.line(a.mmX, a.mmY, b.mmX, b.mmY)
    }

    // Beacon points + outward-offset name labels.
    const cx = points.reduce((s, p) => s + (positioned.get(p.name)?.mmX ?? 0), 0) / points.length
    const cy = points.reduce((s, p) => s + (positioned.get(p.name)?.mmY ?? 0), 0) / points.length
    this.doc.setFontSize(7); this.doc.setTextColor(20, 20, 20)
    for (const p of points) {
      const pos = positioned.get(p.name)
      this.doc.setDrawColor(0, 0, 0)
      this.doc.circle(pos.mmX, pos.mmY, 1.3, 'S')
      let ux = pos.mmX - cx, uy = pos.mmY - cy
      const ulen = Math.hypot(ux, uy) || 1
      ux /= ulen; uy /= ulen
      this.doc.text(p.name, pos.mmX + ux * 3.5, pos.mmY + uy * 3.5)
    }

    // Per-ray annotations: historical distance (black), survey distance (red), signed
    // swing (black), stacked beside the ray midpoint, alternating sides to reduce
    // overlap. Failing distance/direction figures get circled in red, independently.
    this.doc.setFontSize(5.5)
    edges.rows.forEach((row, idx) => {
      const a = positioned.get(row.from), b = positioned.get(row.to)
      if (!a || !b) return
      const side = idx % 2 === 0 ? 1 : -1
      const base = midpointOffset(a, b, 2.2, side)

      const histText = row.dH.toFixed(3)
      const survText = row.dS.toFixed(3)
      const swingText = formatSignedDMS(row.dirDiffSec / 3600)

      this.doc.setTextColor(0, 0, 0)
      this.doc.text(histText, base.mmX, base.mmY)
      this.doc.setTextColor(220, 0, 0)
      this.doc.text(survText, base.mmX, base.mmY + 2.0)
      this.doc.setTextColor(0, 0, 0)
      this.doc.text(swingText, base.mmX, base.mmY + 4.0)

      if (!row.distOk) {
        const w = this.doc.getTextWidth(survText)
        this.doc.setDrawColor(220, 0, 0); this.doc.setLineWidth(0.12)
        this.doc.ellipse(base.mmX + w / 2, base.mmY + 2.0 - 0.9, w / 2 + 0.8, 1.5, 'S')
      }
      if (!row.dirOk) {
        const w = this.doc.getTextWidth(swingText)
        this.doc.setDrawColor(220, 0, 0); this.doc.setLineWidth(0.12)
        this.doc.ellipse(base.mmX + w / 2, base.mmY + 4.0 - 0.9, w / 2 + 0.8, 1.5, 'S')
      }
    })

    // Tick-marked scale bar (bottom-left), matching addDisplacementPlot's own style.
    const mmPerM = 1000 / denom
    const barM = scaleBarMetres(mmPerM, 40), barMm = barM * mmPerM
    const sbx = boxX + pad, sby = boxYtop + boxH - 8
    this.doc.setDrawColor(40); this.doc.setLineWidth(0.5)
    this.doc.line(sbx, sby, sbx + barMm, sby)
    this.doc.line(sbx, sby - 1.2, sbx, sby + 1.2)
    this.doc.line(sbx + barMm, sby - 1.2, sbx + barMm, sby + 1.2)
    this.doc.setFontSize(7); this.doc.setTextColor(40)
    this.doc.text('0', sbx, sby + 4); this.doc.text(`${barM} m`, sbx + barMm, sby + 4, { align: 'right' })

    // South arrow (bottom-right), matching addDisplacementPlot's own style.
    const ax = boxX + boxW - pad - 4
    const ay0 = boxYtop + boxH - pad - 16, ay1 = boxYtop + boxH - pad
    this.doc.setDrawColor(40); this.doc.setLineWidth(0.6); this.doc.line(ax, ay0, ax, ay1)
    this._arrowhead(ax, ay0, ax, ay1, false, [40, 40, 40])
    this.doc.setFontSize(8); this.doc.setTextColor(40); this.doc.text('S', ax, ay1 + 4, { align: 'center' })

    // Callout + SI 727 summary under the box.
    this.y = boxYtop + boxH + 6
    this.doc.setFontSize(8); this.doc.setFont('helvetica', 'normal'); this.doc.setTextColor(60)
    this.doc.text(
      `Scale ${label}. Black = historical, Red = current survey, Circled = outside SI 727 tolerance.`,
      this.margin, this.y, { maxWidth: this.pw - 2 * this.margin })
    this.y += 6
    const s = edges.summary
    this.doc.setTextColor(20)
    this.doc.text(
      `SI 727 Class ${result.surveyClass || 'B'} · ${s.bothPass} of ${s.totalLines} lines pass both checks`,
      this.margin, this.y)
    this.y += 12
  }
```

- [ ] **Step 5: Call it from `generate()`**

Find:

```js
  generate(result, meta) {
    this.addHeader(meta)
    this.addTransformStats(result)
    this.addSnoopingLog(result)
    this.addDisplacementPlot(result)
    this.addCertification(result, meta)
    this.addScheduleLandscape(result)
    this.addTransformationResiduals(result)
    this.addReliabilityValidation(result)
    this.addEdgeCompliance(result)
    this.addFooters()
    return this.doc
  }
```

Add the new call right after `this.addEdgeCompliance(result)`:

```js
  generate(result, meta) {
    this.addHeader(meta)
    this.addTransformStats(result)
    this.addSnoopingLog(result)
    this.addDisplacementPlot(result)
    this.addCertification(result, meta)
    this.addScheduleLandscape(result)
    this.addTransformationResiduals(result)
    this.addReliabilityValidation(result)
    this.addEdgeCompliance(result)
    this.addEdgeComplianceSketch(result)
    this.addFooters()
    return this.doc
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd app-frontend && npx vitest run src/utils/__tests__/beaconAdjustmentReport.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Run the full frontend suite to confirm no regressions**

Run: `cd app-frontend && npm test`
Expected: all suites green except the two pre-existing, unrelated failures
(`coordinate-list.test.ts`, `parcelDetection.test.ts`) — any OTHER failure is a regression.

- [ ] **Step 8: Commit**

```bash
git add app-frontend/src/utils/beaconAdjustmentReport.js app-frontend/src/utils/__tests__/beaconAdjustmentReport.test.ts
git commit -m "feat(beacon-comparison): add the comparison sketch to the Beacon Adjustment Report

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- Sketch added as a new section immediately after the existing Edge Compliance table, table
  unchanged → Task 2, `generate()` call ordering. ✓
- Styled to match this file's own conventions (bordered box, tick-marked scale bar via
  `scaleBarMetres`, south arrow via `_arrowhead`, `sectionTitle` heading) rather than the
  other file's look → Task 2's method body. ✓
- Reuses `beaconComparisonSketchLayout.ts` unchanged → imported, not modified. ✓
- Black-rays-always / red-circled-failures / black-historical-red-survey / signed-swing
  convention identical to the shipped feature → Task 2, and directly tested (the
  black-ray/ellipse-count test mirrors the proven technique from the shipped feature's fix). ✓
- `formatSignedDMS` exported for reuse → Task 1. ✓
- No persistence change, no UI change, no changes to the other generator → confirmed; no
  such files appear in either task. ✓

**Placeholder scan:** No TBD/TODO; every step has complete, runnable code.

**Type/signature consistency:** `computeExtent`/`pickSketchScale`/`makeSketchTransform`/
`midpointOffset` are called with the exact same argument shapes as in the shipped feature
(`beaconComparisonSection.ts`). `formatSignedDMS(deg)` signature matches its Task 1 export
exactly. The new test file's `renderCapturing` mirrors the proven pattern from
`beaconComparisonSection.test.ts`'s fix commit, adapted for this file's `jsPDF.prototype`-patching
approach (necessary because `generateBeaconAdjustmentReport` constructs its own `jsPDF`
instance internally rather than accepting one, unlike `renderBeaconComparison`).

**Scope check:** Two small, tightly-scoped tasks (a one-line export, then one new method +
its wiring) — proportionate to the narrowed scope agreed after walking back the earlier
"merge the two generators" proposal.
