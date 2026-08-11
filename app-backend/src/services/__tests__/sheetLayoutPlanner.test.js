import { describe, test, expect } from '@jest/globals';
import { planSheetLayout } from '../sheetLayoutPlanner.js';
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js';
import BLOCKS from '../../../../app-shared/block-definitions.js';

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} };
const fakeMeasure = (str, { size }) => String(str).length * size * 0.55;

// SI727_500x400 = 594 x 420 mm = 1684 x 1190 pt (1 pt = 25.4/72 mm).
const A2_MAP_BOUNDS = { x: 14, y: 14, width: 1684 - 28, height: 1190 - 28 };

function plan(fixture) {
  return planSheetLayout({
    metadata: fixture.metadata,
    parcels: fixture.parcels,
    outsideFigureData: fixture.outsideFigureData,
    beacons: fixture.beacons,
    mapBounds: A2_MAP_BOUNDS,
    mapFeatureBounds: { x: 100, y: 100, width: 500, height: 400, pdfPoints: [] },
    scale: fixture.scale,
    extent: { minX: 50000, maxX: 50100, minY: 2200000, maxY: 2200060 },
    tickMarkBounds: [],
    figureBounds: { x: 100, y: 100, width: 500, height: 400 },
    polyPts: [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 500 }, { x: 100, y: 500 }, { x: 100, y: 100 }],
    measureText: fakeMeasure,
    logger: fakeLogger,
  });
}

describe('planSheetLayout — output shape', () => {
  test('returns all required block slots for the minimal fixture', () => {
    const r = plan(sampleMinimalPlan);
    for (const key of ['titleBlock', 'scheduleOfAreas', 'outsideFigureData', 'beaconDescription',
                       'scaleBar', 'surveyStatement', 'northArrow', 'sgSignature']) {
      expect(r[key]).toBeDefined();
      expect(typeof r[key].x).toBe('number');
      expect(typeof r[key].y).toBe('number');
      expect(typeof r[key].width).toBe('number');
      expect(typeof r[key].height).toBe('number');
    }
  });

  test('title block has fixed width 650pt', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.titleBlock.width).toBe(650);
  });

  // Regression guard: the planner must reserve the SAME dimensions the renderer
  // draws (BLOCKS.SURVEYOR_GENERAL_BOX). A hardcoded copy in the planner once
  // drifted (reserved 80pt while the box was drawn 110pt), so the S-G box
  // overflowed its slot into the bottom margin/footer. Sourcing from the shared
  // config keeps them locked together.
  test('sgSignature slot matches the drawn SURVEYOR_GENERAL_BOX dimensions', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.sgSignature.height).toBe(BLOCKS.SURVEYOR_GENERAL_BOX.height);
    expect(r.sgSignature.width).toBe(BLOCKS.SURVEYOR_GENERAL_BOX.width);
  });

  // Same drift guard for the fixed-bbox North Arrow and the (height-only) Scale
  // Bar — the planner must reserve exactly what the shared config declares.
  test('northArrow slot matches the drawn NORTH_ARROW bounding box', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.northArrow.width).toBe(BLOCKS.NORTH_ARROW.blockWidth);
    expect(r.northArrow.height).toBe(BLOCKS.NORTH_ARROW.blockHeight);
  });

  test('scaleBar reserved height matches SCALE_BAR.reservedHeight', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.scaleBar.height).toBe(BLOCKS.SCALE_BAR.reservedHeight);
  });

  test('schedule of areas: single column for the 2-stand fixture', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.scheduleOfAreas._schedNumCols ?? 1).toBe(1);
    expect(r.scheduleOfAreas.width).toBeCloseTo(260, 0);  // singleColumn total = 260pt
  });
});

describe('planSheetLayout — scale validation', () => {
  test('throws when scale is missing value', () => {
    expect(() => planSheetLayout({
      metadata: {}, parcels: { features: [] }, outsideFigureData: { edges: [] },
      beacons: { features: [] }, mapBounds: A2_MAP_BOUNDS, mapFeatureBounds: null,
      scale: { label: '1:500' }, extent: { minX: 0, maxX: 1, minY: 0, maxY: 1 },
      measureText: fakeMeasure, logger: fakeLogger,
    })).toThrow(/Scale parameter is required/);
  });
});

describe('planSheetLayout — measureText injection', () => {
  test('uses the injected measurer for OFD col1 sizing', () => {
    let measureCalls = 0;
    const countingMeasure = (str, { size }) => { measureCalls++; return String(str).length * size * 0.55; };
    planSheetLayout({
      metadata: sampleMinimalPlan.metadata,
      parcels: sampleMinimalPlan.parcels,
      outsideFigureData: sampleMinimalPlan.outsideFigureData,
      beacons: sampleMinimalPlan.beacons,
      mapBounds: A2_MAP_BOUNDS,
      mapFeatureBounds: { x: 100, y: 100, width: 500, height: 400, pdfPoints: [] },
      scale: sampleMinimalPlan.scale,
      extent: { minX: 50000, maxX: 50100, minY: 2200000, maxY: 2200060 },
      polyPts: [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 500 }, { x: 100, y: 500 }, { x: 100, y: 100 }],
      measureText: countingMeasure,
      logger: fakeLogger,
    });
    // Minimal fixture has 4 OFD edges; OFD col1 measurement is the only injected call site.
    expect(measureCalls).toBeGreaterThanOrEqual(4);
  });
});

describe('planSheetLayout — endorsement slot', () => {
  test('returns endorsement slot at right-margin position', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.endorsement).toBeDefined();
    // Per drawEndorsementBlock: top-left = (mapBounds.x + mapBounds.width, mapBounds.y),
    // width = 150mm in PDF points (150 * 2.835), height = 150 PDF points.
    expect(r.endorsement.x).toBeCloseTo(A2_MAP_BOUNDS.x + A2_MAP_BOUNDS.width, 0);
    expect(r.endorsement.y).toBeCloseTo(A2_MAP_BOUNDS.y, 0);
    expect(r.endorsement.width).toBeCloseTo(150 * 2.835, 1);
    expect(r.endorsement.height).toBeCloseTo(150, 0);
  });
});

describe('planSheetLayout — scheduleColumnWidthsPt override', () => {
  test('uses caller-provided widths when scheduleColumnWidthsPt is set', () => {
    // Wide widths: 50, 80, 60, 60, 50, 70 sum = 370 pt
    const customWidths = [50, 80, 60, 60, 50, 70];
    const r = planSheetLayout({
      metadata: sampleMinimalPlan.metadata,
      parcels: sampleMinimalPlan.parcels,
      outsideFigureData: sampleMinimalPlan.outsideFigureData,
      beacons: sampleMinimalPlan.beacons,
      mapBounds: A2_MAP_BOUNDS,
      mapFeatureBounds: { x: 100, y: 100, width: 500, height: 400, pdfPoints: [] },
      scale: sampleMinimalPlan.scale,
      extent: { minX: 50000, maxX: 50100, minY: 2200000, maxY: 2200060 },
      polyPts: [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 500 }, { x: 100, y: 500 }, { x: 100, y: 100 }],
      measureText: fakeMeasure,
      logger: fakeLogger,
      scheduleColumnWidthsPt: customWidths,
    });
    expect(r.scheduleOfAreas.width).toBeCloseTo(370, 0);
  });

  test('falls back to static widths (260 pt) when scheduleColumnWidthsPt is omitted', () => {
    const r = plan(sampleMinimalPlan);
    expect(r.scheduleOfAreas.width).toBeCloseTo(260, 0);
  });
});

describe('planSheetLayout — closed-polygon validation guard', () => {
  test('an open polygon is auto-closed before placement validation', () => {
    // Square polygon WITHOUT explicit closing vertex.
    const openSquare = [
      { x: 100, y: 100 }, { x: 500, y: 100 },
      { x: 500, y: 400 }, { x: 100, y: 400 },
    ];
    const closedSquare = [...openSquare, { x: 100, y: 100 }];

    const baseArgs = {
      metadata: sampleMinimalPlan.metadata,
      parcels: sampleMinimalPlan.parcels,
      outsideFigureData: sampleMinimalPlan.outsideFigureData,
      beacons: sampleMinimalPlan.beacons,
      mapBounds: A2_MAP_BOUNDS,
      scale: sampleMinimalPlan.scale,
      extent: { minX: 50000, maxX: 50100, minY: 2200000, maxY: 2200060 },
      measureText: fakeMeasure,
      logger: fakeLogger,
    };

    const rOpen = planSheetLayout({
      ...baseArgs,
      mapFeatureBounds: { x: 100, y: 100, width: 400, height: 300, pdfPoints: openSquare },
      polyPts: openSquare,
    });
    const rClosed = planSheetLayout({
      ...baseArgs,
      mapFeatureBounds: { x: 100, y: 100, width: 400, height: 300, pdfPoints: closedSquare },
      polyPts: closedSquare,
    });

    // Both inputs must produce identical placements — guard auto-closes the polygon
    // so edge-walk validation sees the same shape either way.
    expect(rOpen.titleBlock.x).toBeCloseTo(rClosed.titleBlock.x, 1);
    expect(rOpen.titleBlock.y).toBeCloseTo(rClosed.titleBlock.y, 1);
  });
});
