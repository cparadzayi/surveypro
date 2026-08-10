// Parity test: PDF and DXF go through the same planSheetLayout entry point.
// Both formats inject their own measureText (PDFKit-backed vs 0.55 heuristic);
// the planner's algorithm is otherwise identical for both. Verify that the
// algorithm is deterministic and that the format-independent slots agree.

import { describe, test, expect } from '@jest/globals';
import { planSheetLayout } from '../sheetLayoutPlanner.js';
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';
import { sampleMaglasPlan } from './fixtures/sampleMaglasPlan.js';
import { generateGeoPDF } from '../pdfkitGeoPDF.js';
import { generateDXF } from '../dxfGenerator.js';

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} };
const A2_MAP_BOUNDS = { x: 14, y: 14, width: 1684 - 28, height: 1190 - 28 };

const pdfMeasure = (str, { size }) => String(str).length * size * 0.50;
const dxfMeasure = (str, { size }) => String(str).length * size * 0.55;

function plan(fixture, measureText) {
  return planSheetLayout({
    metadata: fixture.metadata,
    parcels: fixture.parcels,
    outsideFigureData: fixture.outsideFigureData,
    beacons: fixture.beacons,
    mapBounds: A2_MAP_BOUNDS,
    mapFeatureBounds: { x: 100, y: 100, width: 500, height: 400, pdfPoints: [] },
    scale: fixture.scale,
    extent: { minX: 50000, maxX: 50100, minY: 2200000, maxY: 2200060 },
    polyPts: [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 500 }, { x: 100, y: 500 }, { x: 100, y: 100 }],
    measureText,
    logger: fakeLogger,
  });
}

describe('planSheetLayout parity — PDF and DXF callers', () => {
  test.each([
    ['minimal', sampleMinimalPlan],
    ['realistic', sampleRealisticPlan],
  ])('same algorithm produces same titleBlock + endorsement position on %s', (_label, fixture) => {
    const pdf = plan(fixture, pdfMeasure);
    const dxf = plan(fixture, dxfMeasure);
    // Title block: fixed width 650pt, position is measurement-independent.
    expect(dxf.titleBlock.width).toBe(pdf.titleBlock.width);
    // Endorsement slot: fixed position (right-margin, 150mm × 150mm).
    expect(dxf.endorsement.x).toBeCloseTo(pdf.endorsement.x, 2);
    expect(dxf.endorsement.y).toBeCloseTo(pdf.endorsement.y, 2);
    expect(dxf.endorsement.width).toBeCloseTo(pdf.endorsement.width, 2);
    expect(dxf.endorsement.height).toBeCloseTo(pdf.endorsement.height, 2);
  });

  test.each([
    ['minimal', sampleMinimalPlan],
    ['realistic', sampleRealisticPlan],
  ])('determinism: same inputs yield identical output on %s', (_label, fixture) => {
    const a = plan(fixture, dxfMeasure);
    const b = plan(fixture, dxfMeasure);
    // Stringify-compare on the geometric slots (skip the `placedBlocks` array
    // and `mapFeatureBounds` echo which may contain non-comparable objects).
    const slotsOnly = (r) => ({
      titleBlock: r.titleBlock,
      scheduleOfAreas: { x: r.scheduleOfAreas.x, y: r.scheduleOfAreas.y, width: r.scheduleOfAreas.width, height: r.scheduleOfAreas.height },
      outsideFigureData: r.outsideFigureData,
      beaconDescription: r.beaconDescription,
      scaleBar: r.scaleBar,
      surveyStatement: r.surveyStatement,
      northArrow: r.northArrow,
      sgSignature: r.sgSignature,
      endorsement: r.endorsement,
    });
    expect(slotsOnly(a)).toEqual(slotsOnly(b));
  });
});

describe('3-v7 Maglas parity', () => {
  test('PDF and DXF both generate non-empty output on Maglas', async () => {
    // PDF-first handoff (see note in the warning-parity test below).
    const pdfResult = await generateGeoPDF(sampleMaglasPlan, fakeLogger);
    const dxfResult = generateDXF(
      { ...sampleMaglasPlan, scale: pdfResult.scale, sheetSize: pdfResult.sheetSize, orientation: pdfResult.orientation },
      fakeLogger,
    );
    expect(pdfResult.pdfBuffer.length).toBeGreaterThan(0);
    expect(dxfResult.buffer.length).toBeGreaterThan(0);
  }, 120000);

  test('dense Maglas: DXF resolves the schedule-over-figure overlap; PDF correctly escalates through every level but the fixture is still too dense to fit', async () => {
    // PDF↔DXF parity follows the real app flow: the PDF generates FIRST and
    // decides scale + sheet size + orientation (enlarging the figure to the
    // largest SI 727 scale that fits). The DXF then consumes those verbatim, so
    // both render the same layout. Passing the fixture to each independently
    // would let them diverge (PDF enlarges, DXF would honor the fixture scale).
    const pdfResult = await generateGeoPDF(sampleMaglasPlan, fakeLogger);
    const dxfResult = generateDXF(
      { ...sampleMaglasPlan, scale: pdfResult.scale, sheetSize: pdfResult.sheetSize, orientation: pdfResult.orientation },
      fakeLogger,
    );

    // PDF warnings are flat keys on `warnings` object
    const pdfWarnKeys = Object.keys(pdfResult.warnings || {})
      .filter(k => k.endsWith('OverlapsPolygon') || k === 'scheduleEscalationExhausted')
      .sort();

    // DXF warnings live under `warnings.summary` per existing convention
    const dxfWarnKeys = Object.keys(dxfResult.warnings?.summary || {})
      .filter(k => k.endsWith('OverlapsPolygon') || k === 'scheduleEscalationExhausted')
      .sort();

    // Log for visibility
    console.log('PDF warn keys:', pdfWarnKeys);
    console.log('DXF warn keys:', dxfWarnKeys);

    // Previously this test tracked a known, not-yet-fixed PDF-side defect
    // ("sub-project B"): dense Maglas's schedule splits into multiple
    // sub-tables (isScheduleWithFluidFallback), and that fluid multi-table
    // placement path didn't participate in paper-size escalation AT ALL —
    // the gate was blanket-suppressed for split schedules, so PDF never
    // even tried a larger sheet. Fixed in pdfkitGeoPDF.js's
    // calculateBlockPositions: the fluid search's own composite result is
    // now checked against the figure polygon, and needsScaleUp is promoted
    // if it still overlaps (see
    // docs/superpowers/specs/2026-08-10-split-schedule-escalation-gate-design.md).
    //
    // pdfWarnKeys still legitimately contains scheduleOfAreasOverlapsPolygon
    // for THIS fixture — that has NOT changed, and is not a residual bug.
    // Verified directly (full escalation trace, captured during
    // implementation): the fix now correctly escalates through every level —
    // ISO_A2 → ISO_A1 → ISO_A0 → scale step-up 1:1000→1:1250 — but Maglas's
    // 240-stand schedule composite (860×1850pt, ~30×65cm) is genuinely too
    // large to fit anywhere even at the largest sheet plus a scale step-up.
    // scheduleEscalationExhausted appears in pdfWarnKeys as the honest
    // signal of this — a real, quantified density limit, the same category
    // as sgSignature's documented residual gap from the prior fix
    // (2026-08-09-relocation-pass-figure-accuracy). DXF resolves this
    // fixture independently via its own post-emission escalation
    // (dxfGenerator.js) — unaffected either way by this PDF-side fix.
    expect(dxfWarnKeys).not.toContain('scheduleOfAreasOverlapsPolygon');
    expect(pdfWarnKeys).toContain('scheduleOfAreasOverlapsPolygon');
    expect(pdfWarnKeys).toContain('scheduleEscalationExhausted');
  }, 120000);
});
