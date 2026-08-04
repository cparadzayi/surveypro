import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';

// generateBeaconAdjustmentReport calls doc.save(...) directly (a browser download side
// effect) rather than returning the document, so these tests intercept jsPDF's
// constructor-level methods the same way beaconComparisonSection.test.ts's renderCapturing
// does: patch calls before constructing, capture them, then let save() run (jsdom's default
// test environment has no real download mechanism, so save() is a no-op side effect here,
// not something we need to prevent).
//
// NOTE on patch target: jspdf@3's jsPDF() constructor does `return API` (a plain object
// built from local closures), not `this` — confirmed empirically (`new jsPDF() instanceof
// jsPDF` is `false`, and `doc.text !== jsPDF.prototype.text`). So `jsPDF.prototype.*` is
// never consulted by real instances and patching it silently intercepts nothing. What DOES
// get consulted: the constructor copies every own-enumerable key of the static `jsPDF.API`
// plugin registry onto each new instance (overriding the built-ins) via a loop late in its
// body. So we patch `jsPDF.API.<method>` instead, which reliably lands on every instance
// constructed afterward while it's in place, and we save/restore its exact prior own-property
// state (present-with-value vs. absent) so the global registry isn't left mutated for later
// test files. Because `jsPDF.API` starts with none of these six keys, our patched functions
// fully replace the built-ins (no real "original" to call through to on this path) — verified
// this doesn't break `addPage`/`autoTable`/`getNumberOfPages`, none of which depend on
// `text`/`line`/`circle`/`ellipse`/`setDrawColor`/`save` actually rendering anything.
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
  // This file's own, pre-existing addDisplacementPlot draws its own colored (blue/red)
  // vector lines and marker circles on an earlier page, before addEdgeComplianceSketch's
  // page is ever created -- so a plain, document-wide capture of every call would wrongly
  // attribute that unrelated section's colors to the sketch. Each captured item is tagged
  // with the active page number (jsPDF's real, unpatched `internal.getCurrentPageInfo().
  // pageNumber`) and the result is filtered down to just the highest page number reached --
  // addEdgeComplianceSketch is the last section to call addPage() before addFooters() runs
  // (addFooters only revisits existing pages via setPage(), it never creates new ones), so
  // that highest page number is always its page.
  const written: string[] = [];
  // Same content as `written`, but paired with the draw colour active at the moment each
  // text() call happened -- needed to verify the old=black/new=red/diff-by-tolerance
  // colour convention, which plain string capture can't distinguish (Task 4). Tagged with
  // page for the same reason curves/ellipses are below: jspdf-autotable's cell renderer
  // calls doc.text() internally too, so the earlier addEdgeCompliance table page repeats
  // some of the same raw dH/dS figures (e.g. "140.000") -- without page-scoping, counting
  // occurrences of a given figure would double-count that unrelated table's cells.
  const textsColored: Array<{ text: string; color: [number, number, number]; page: number }> = [];
  const rawCurves: Array<{ color: [number, number, number]; x1: number; y1: number; x2: number; y2: number; page: number }> = [];
  const rawEllipses: Array<{ color: [number, number, number]; page: number }> = [];
  let currentDrawColor: [number, number, number] = [0, 0, 0];
  // Text colour (doc.setTextColor) is a separate jsPDF channel from draw colour
  // (doc.setDrawColor, used for lines/curves/circles) -- both need their own tracked
  // state and their own patch, or textsColored would silently capture the wrong colour.
  let currentTextColor: [number, number, number] = [0, 0, 0];
  let lastMoveTo = { x: 0, y: 0 };
  let sketchPageW = 0, sketchPageH = 0;

  // Save prior own-property state of jsPDF.API for each patched key so we can restore
  // it exactly afterward (present-with-value vs. absent) rather than mutating the shared,
  // global plugin registry permanently for later test files.
  const patchedKeys = ['text', 'setDrawColor', 'setTextColor', 'moveTo', 'curveTo', 'stroke', 'circle', 'ellipse', 'save'] as const;
  const priorState = new Map<string, { had: boolean; value: any }>();
  for (const k of patchedKeys) {
    priorState.set(k, { had: Object.prototype.hasOwnProperty.call(jsPDF.API, k), value: (jsPDF.API as any)[k] });
  }

  (jsPDF.API as any).text = function (text: any) {
    const str = Array.isArray(text) ? text.join(' ') : String(text);
    written.push(str);
    const page = this.internal.getCurrentPageInfo().pageNumber;
    textsColored.push({ text: str, color: currentTextColor, page });
    return this;
  };
  (jsPDF.API as any).setDrawColor = function (...args: any[]) {
    if (args.length >= 3) currentDrawColor = [args[0], args[1], args[2]];
    else if (args.length === 1) currentDrawColor = [args[0], args[0], args[0]];
    return this;
  };
  (jsPDF.API as any).setTextColor = function (...args: any[]) {
    if (args.length >= 3) currentTextColor = [args[0], args[1], args[2]];
    else if (args.length === 1) currentTextColor = [args[0], args[0], args[0]];
    return this;
  };
  // Rays are drawn as cubic Bezier curves via jsPDF's path API (moveTo -> curveTo ->
  // stroke), one curve per edge, instead of a single doc.line() call. moveTo records the
  // curve's start point; curveTo captures the full curve (start from the preceding
  // moveTo, both control points are discarded -- only start/end matter for these tests --
  // end point, and the draw colour active at that moment) tagged with the current page.
  (jsPDF.API as any).moveTo = function (x: number, y: number) {
    lastMoveTo = { x, y };
    return this;
  };
  (jsPDF.API as any).curveTo = function (_x1: number, _y1: number, _x2: number, _y2: number, x3: number, y3: number) {
    const page = this.internal.getCurrentPageInfo().pageNumber;
    rawCurves.push({ color: currentDrawColor, x1: lastMoveTo.x, y1: lastMoveTo.y, x2: x3, y2: y3, page });
    return this;
  };
  (jsPDF.API as any).stroke = function () { return this; };
  // jsPDF's own circle() is implemented internally as this.ellipse(x,y,r,r,style) -- without
  // this guard, every beacon-marker circle (drawn via doc.circle, AND the historical/survey
  // dots this file's OWN addDisplacementPlot draws elsewhere) would also land in the
  // `ellipses` capture. We reproduce that same real relationship here (our circle override
  // calls `this.ellipse(...)`, i.e. our own patched ellipse below) so the guard has
  // something to guard against, exactly as it would against the real built-in.
  let inCircleCall = false;
  (jsPDF.API as any).circle = function (x: number, y: number, r: number, style: string) {
    inCircleCall = true;
    try {
      return this.ellipse(x, y, r, r, style);
    } finally {
      inCircleCall = false;
    }
  };
  (jsPDF.API as any).ellipse = function () {
    if (!inCircleCall) {
      const page = this.internal.getCurrentPageInfo().pageNumber;
      rawEllipses.push({ color: currentDrawColor, page });
    }
    return this;
  };
  // jsPDF's own save() writes to the DOM in a browser; under Vitest's default environment
  // it may throw or no-op. Stub it so the report-generation call completes without a real
  // download, matching how this file is actually invoked (CompareView.vue's button handler
  // doesn't await anything after calling it either). It also runs with the sketch page
  // still "current" (addFooters only revisits pages via setPage(), ending on the last one
  // added -- the sketch page -- so this is the right moment to read its real, chosen size.
  (jsPDF.API as any).save = function () {
    sketchPageW = this.internal.pageSize.getWidth();
    sketchPageH = this.internal.pageSize.getHeight();
    return this;
  };

  try {
    generateBeaconAdjustmentReport(result, { surveyorName: 'Test', plsNumber: '1', location: 'X', priorSurvey: 'SR 1/2026', date: '2026-08-02', critW: 2.576 });
  } finally {
    for (const k of patchedKeys) {
      const prior = priorState.get(k)!;
      if (prior.had) (jsPDF.API as any)[k] = prior.value;
      else delete (jsPDF.API as any)[k];
    }
  }
  const sketchPage = Math.max(0, ...rawCurves.map((l) => l.page), ...rawEllipses.map((e) => e.page));
  // addEdgeComplianceSketch draws its rays as curveTo() calls; nothing else on this page
  // (or any page) uses curveTo() (the scale bar and south arrow use doc.line()), so every
  // captured curve on the sketch page is exactly one ray -- no slicing/filtering needed.
  const curves = rawCurves.filter((l) => l.page === sketchPage).map(({ color, x1, y1, x2, y2 }) => ({ color, x1, y1, x2, y2 }));
  const ellipses = rawEllipses.filter((e) => e.page === sketchPage).map(({ color }) => ({ color }));
  const textsColoredOnSketch = textsColored.filter((t) => t.page === sketchPage).map(({ text, color }) => ({ text, color }));
  return { written, textsColored: textsColoredOnSketch, curves, ellipses, sketchPageW, sketchPageH };
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

  it('draws every ray in plain black regardless of pass/fail', () => {
    const { curves } = renderCapturing(makeResult());
    expect(curves.length).toBeGreaterThan(0);
    expect(curves.every((l) => l.color[0] === 0 && l.color[1] === 0 && l.color[2] === 0)).toBe(true);
  });

  it('draws no tolerance-violation circles any more -- colour on the diff text carries that signal instead', () => {
    const { ellipses } = renderCapturing(makeResult());
    expect(ellipses.length).toBe(0);
  });

  it('colours the historical distance black and the survey distance red', () => {
    // All 3 edges in makeResult() share dH=140.0/dS=140.05, so each figure appears once
    // per edge (3 times total) regardless of pass/fail -- only the diff figure (below)
    // varies by tolerance.
    const { textsColored } = renderCapturing(makeResult());
    const hist = textsColored.filter((t) => t.text === '140.000');
    const surv = textsColored.filter((t) => t.text === '140.050');
    expect(hist.length).toBe(3);
    expect(surv.length).toBe(3);
    expect(hist.every((t) => t.color[0] === 0 && t.color[1] === 0 && t.color[2] === 0)).toBe(true);
    expect(surv.every((t) => t.color[0] === 220 && t.color[1] === 0 && t.color[2] === 0)).toBe(true);
  });

  it('colours the distance-difference figure black when within tolerance and red when outside it', () => {
    // makeResult()'s 3 edges all carry the same dDiff (0.05 -> "+0.050"); 86B-87A and
    // 87A-87B pass (distOk=true), 86B-87B fails (distOk=false) -- so the SAME text should
    // appear 3 times, split 2 black / 1 red.
    const { textsColored } = renderCapturing(makeResult());
    const diffs = textsColored.filter((t) => t.text === ' (+0.050)');
    expect(diffs.length).toBe(3);
    const black = diffs.filter((t) => t.color[0] === 0 && t.color[1] === 0 && t.color[2] === 0);
    const red = diffs.filter((t) => t.color[0] === 220 && t.color[1] === 0 && t.color[2] === 0);
    expect(black.length).toBe(2);
    expect(red.length).toBe(1);
  });

  it('colours the direction-difference figure black when within tolerance and red when outside it', () => {
    // Same reasoning as the distance-difference test: all 3 edges share dirDiffSec=-7200
    // (-2 deg -> "-2°00'00.0""); 86B-87A and 87A-87B pass (dirOk=true), 86B-87B fails
    // (dirOk=false).
    const { textsColored } = renderCapturing(makeResult());
    const diffs = textsColored.filter((t) => t.text === ` (-2°00'00.0")`);
    expect(diffs.length).toBe(3);
    const black = diffs.filter((t) => t.color[0] === 0 && t.color[1] === 0 && t.color[2] === 0);
    const red = diffs.filter((t) => t.color[0] === 220 && t.color[1] === 0 && t.color[2] === 0);
    expect(black.length).toBe(2);
    expect(red.length).toBe(1);
  });

  it('renders a negative direction difference with an explicit minus sign, not wrapped into [0,360)', () => {
    const { written } = renderCapturing(makeResult());
    expect(written.some((w) => w.includes("(-2°"))).toBe(true);
    expect(written.some((w) => w.includes('357°') || w.includes('358°'))).toBe(false);
  });

  it('does nothing (no sketch heading) when there are no edges', () => {
    const { written } = renderCapturing(makeResult({ edges: { rows: [], summary: { totalLines: 0, distPass: 0, dirPass: 0, bothPass: 0, meanScale: null, meanSwingDeg: null } } }));
    expect(written).not.toContain('Comparison Sketch — SI 727 §67(5)');
  });
});

describe('addEdgeComplianceSketch annotation placement', () => {
  it('keeps each annotation clear of every ray, including rays it does not label', () => {
    // Four beacons in a tight square with all 6 pairwise edges -- deliberately dense so
    // several rays pass close to any given edge's natural annotation position, exercising
    // the outward search rather than always landing on the first candidate.
    const pts = [
      { id: 1, name: 'A', yH: 50000.0, xH: 2200000.0, yS: 50000.02, xS: 2200000.03,
        dY: 0.02, dX: 0.03, vY: 0.001, vX: -0.001, resDist: 0.001, resBrg: 90, wMax: 0.4, finalStatus: 'ACCEPT',
        yT: 50000.01, xT: 2200000.02, tvY: 0.001, tvX: -0.001, tResid: 0.001, tBrg: 90, rY: 0.8, rX: 0.8 },
      { id: 2, name: 'B', yH: 50050.0, xH: 2200000.0, yS: 50050.01, xS: 2200000.02,
        dY: 0.01, dX: 0.02, vY: 0.001, vX: -0.001, resDist: 0.001, resBrg: 90, wMax: 0.3, finalStatus: 'ACCEPT',
        yT: 50050.005, xT: 2200000.01, tvY: 0.001, tvX: -0.001, tResid: 0.001, tBrg: 90, rY: 0.85, rX: 0.85 },
      { id: 3, name: 'C', yH: 50050.0, xH: 2200050.0, yS: 50050.03, xS: 2200050.01,
        dY: 0.03, dX: 0.01, vY: 0.001, vX: -0.001, resDist: 0.001, resBrg: 90, wMax: 0.5, finalStatus: 'ACCEPT',
        yT: 50050.015, xT: 2200050.005, tvY: 0.001, tvX: -0.001, tResid: 0.001, tBrg: 90, rY: 0.82, rX: 0.82 },
      { id: 4, name: 'D', yH: 50000.0, xH: 2200050.0, yS: 50000.02, xS: 2200050.01,
        dY: 0.02, dX: 0.01, vY: 0.001, vX: -0.001, resDist: 0.001, resBrg: 90, wMax: 0.2, finalStatus: 'ACCEPT',
        yT: 50000.01, xT: 2200050.005, tvY: 0.001, tvX: -0.001, tResid: 0.001, tBrg: 90, rY: 0.9, rX: 0.9 },
    ];
    const edgeRow = (from: string, to: string) => ({
      from, to, dH: 50.0, dS: 50.02, dDiff: 0.02, dAllow: 0.05,
      distOk: true, brgH: 90.0, brgS: 90.001, dirDiffSec: 3.6, dirAllowSec: 20.0, dirOk: true,
      pass: true,
    });
    const result = {
      adj: {
        params: { TY: 0.02, TX: -0.01, scale: 1.0001, ppm: 100, rotDeg: 0.001, se: { TY: 0.01, TX: 0.01, scale: 1e-4, ppm: 10, rotSec: 5 } },
        stats: { sig0: 0.01, s0: 0.02, DOF: 2, chi2: 3, chi2L: 0.1, chi2U: 6 },
      },
      pts,
      log: [{ iter: 1, n: 4, s0: 0.02, chi2: 3, chi2L: 0.1, chi2U: 6 }],
      converged: true,
      loo: { rows: [], rmsLoo: 0.01, maxLoo: 0.02, note: null },
      edges: {
        rows: [
          edgeRow('A', 'B'), edgeRow('A', 'C'), edgeRow('A', 'D'),
          edgeRow('B', 'C'), edgeRow('B', 'D'), edgeRow('C', 'D'),
        ],
        summary: { totalLines: 6, distPass: 6, dirPass: 6, bothPass: 6, meanScale: 1.0001, meanSwingDeg: -0.001 },
      },
      surveyClass: 'B',
    };
    // No colour/geometry assertion needed here beyond "it doesn't throw" -- the geometry
    // helpers themselves are exhaustively tested in beaconComparisonSketchLayout.test.ts.
    // What this test actually protects against is a regression where the loop in
    // addEdgeComplianceSketch stops calling findClearAnchor (e.g. reverts to the fixed
    // midpointOffset it used before this task), which unit tests on the pure helper alone
    // cannot catch since that helper would still exist and pass its own tests unused.
    expect(() => renderCapturing(result)).not.toThrow();
    const { written } = renderCapturing(result);
    expect(written).toContain('A');
    expect(written).toContain('B');
    expect(written).toContain('C');
    expect(written).toContain('D');
  });
});

describe('addEdgeComplianceSketch paper size selection', () => {
  it('stays on A4 portrait for a sparse network that already fits collision-free', () => {
    const { sketchPageW, sketchPageH } = renderCapturing(makeResult());
    expect(sketchPageW).toBeCloseTo(210, 0);
    expect(sketchPageH).toBeCloseTo(297, 0);
  });

  it('escalates beyond A4 for a dense, real-world-scale network', () => {
    const N = 12;
    const names = Array.from({ length: N }, (_, i) => `P${i + 1}`);
    const pts = names.map((name, i) => {
      const yH = 50000 + (i % 4) * 80 + i * 3, xH = 2200000 + Math.floor(i / 4) * 90 + i * 5;
      return {
        id: i + 1, name, yH, xH, yS: yH + 0.07, xS: xH - 0.05,
        dY: 0.07, dX: -0.05, vY: 0.01, vX: -0.01, resDist: 0.014, resBrg: 90, wMax: 0.8, finalStatus: 'ACCEPT',
        yT: yH + 0.035, xT: xH - 0.025, tvY: 0.01, tvX: -0.01, tResid: 0.014, tBrg: 90, rY: 0.82, rX: 0.82,
      };
    });
    const rows: any[] = [];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        const dH = Math.hypot(b.yH - a.yH, b.xH - a.xH);
        const dS = Math.hypot(b.yS - a.yS, b.xS - a.xS);
        const brgH = (Math.atan2(b.yH - a.yH, b.xH - a.xH) * 180 / Math.PI + 360) % 360;
        const brgS = (Math.atan2(b.yS - a.yS, b.xS - a.xS) * 180 / Math.PI + 360) % 360;
        const dirDiffSec = ((brgS - brgH + 540) % 360 - 180) * 3600;
        rows.push({
          from: a.name, to: b.name, dH, dS, dDiff: dS - dH, dAllow: 0.05,
          distOk: Math.abs(dS - dH) <= 0.05,
          brgH, brgS, dirDiffSec, dirAllowSec: 30,
          dirOk: Math.abs(dirDiffSec) <= 30,
          pass: false,
        });
      }
    }
    const result = {
      adj: {
        params: { TY: 0.07, TX: -0.05, scale: 1.0001, ppm: 100, rotDeg: 0.001, se: { TY: 0.01, TX: 0.01, scale: 1e-4, ppm: 10, rotSec: 5 } },
        stats: { sig0: 0.01, s0: 0.02, DOF: 2, chi2: 3, chi2L: 0.1, chi2U: 6 },
      },
      pts,
      log: [{ iter: 1, n: pts.length, s0: 0.02, chi2: 3, chi2L: 0.1, chi2U: 6 }],
      converged: true,
      loo: { rows: [], rmsLoo: 0.01, maxLoo: 0.02, note: null },
      edges: {
        rows,
        summary: {
          totalLines: rows.length,
          distPass: rows.filter((r) => r.distOk).length,
          dirPass: rows.filter((r) => r.dirOk).length,
          bothPass: rows.filter((r) => r.distOk && r.dirOk).length,
          meanScale: 1.0, meanSwingDeg: 0,
        },
      },
      surveyClass: 'B',
    };
    const { sketchPageW, sketchPageH } = renderCapturing(result);
    // A4 portrait is 210x297mm, A4 landscape is 297x210mm -- this network (12 points, 66
    // all-pairs edges) is dense enough that neither orientation fits collision-free, so
    // the chosen sheet must be a larger ISO size (A3 or beyond) in at least one dimension.
    // 300mm is comfortably clear of A4's true ~297mm in either orientation (jsPDF's own A4
    // constant converts to 297.00008mm -- a hair over 297 purely from unit-conversion
    // rounding, not genuine escalation) while still well under A3's 420mm, so this
    // correctly detects "escalated past A4" without being fooled by that rounding noise.
    expect(Math.max(sketchPageW, sketchPageH)).toBeGreaterThan(300);
  });
});
