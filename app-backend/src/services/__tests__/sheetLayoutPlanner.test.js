import { describe, test, expect } from '@jest/globals';
import { planSheetLayout } from '../../../../app-shared/sheetLayoutPlanner.js';
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} };
const fakeMeasure = (str, { size }) => String(str).length * size * 0.55;

// ISO_A2 = 594 x 420 mm = 1684 x 1190 pt (1 pt = 25.4/72 mm).
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
    expect(measureCalls).toBeGreaterThanOrEqual(4);
  });
});
