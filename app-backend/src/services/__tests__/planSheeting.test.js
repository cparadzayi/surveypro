import { describe, test, expect } from '@jest/globals';
import { resolvePlanSheeting, drawingAreaMm, narrowestStandWidthM } from '../../../../app-shared/planSheeting.js';

/** Build a FeatureCollection of `count` square stands of the given area. */
function stands(count, areaM2) {
  const side = Math.sqrt(areaM2);
  return {
    type: 'FeatureCollection',
    features: Array.from({ length: count }, (_, i) => ({
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [[[0, 0], [side, 0], [side, side], [0, side], [0, 0]]],
      },
      properties: { stand: String(1000 + i), area_m2: areaM2 },
    })),
  };
}

describe('resolvePlanSheeting — Reg 32(3) mandate', () => {
  test('pins every candidate to 1:500 when the majority of stands are ≤200 m²', () => {
    const result = resolvePlanSheeting({
      extentM: { widthM: 300, heightM: 200 },
      parcels: stands(40, 150),
      planType: 'general-developed',
    });

    expect(result.mandate.mandatory500).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) {
      expect(c.scaleDenominator).toBe(500);
    }
  });
});

describe('resolvePlanSheeting — automatic selection', () => {
  // The reported bug: a 500m × 420m township of 875 m² stands was recommended
  // 1:10000, putting a 50 × 42 mm figure on a 1000 × 800 mm sheet.
  const MAGLAS = {
    extentM: { widthM: 500, heightM: 420 },
    parcels: stands(240, 875),
    planType: 'general-undeveloped',
  };

  test('the mandate does not apply to a township of large stands', () => {
    expect(resolvePlanSheeting(MAGLAS).mandate.mandatory500).toBe(false);
  });

  test('the best candidate fills at least half its drawing area (Maglas regression)', () => {
    const best = resolvePlanSheeting(MAGLAS).candidates[0];
    const area = drawingAreaMm(best.sheetSize);
    const figureWmm = (MAGLAS.extentM.widthM / best.scaleDenominator) * 1000;
    const figureHmm = (MAGLAS.extentM.heightM / best.scaleDenominator) * 1000;

    const fill = Math.max(figureWmm / area.widthMm, figureHmm / area.heightMm);
    expect(fill).toBeGreaterThanOrEqual(0.5);
  });

  test('every non-tiling candidate actually fits its drawing area', () => {
    for (const c of resolvePlanSheeting(MAGLAS).candidates.filter(c => !c.needsTiling)) {
      const area = drawingAreaMm(c.sheetSize);
      expect((MAGLAS.extentM.widthM / c.scaleDenominator) * 1000).toBeLessThanOrEqual(area.widthMm);
      expect((MAGLAS.extentM.heightM / c.scaleDenominator) * 1000).toBeLessThanOrEqual(area.heightMm);
    }
  });

  test('orders every non-tiling candidate ahead of every tiling one', () => {
    const tilingFlags = resolvePlanSheeting(MAGLAS).candidates.map(c => c.needsTiling);
    expect(tilingFlags).toEqual([...tilingFlags].sort((a, b) => Number(a) - Number(b)));
  });

  test('prefers the smaller sheet, then the larger figure within that sheet', () => {
    const order = ['SI727_500x400', 'SI727_800x500', 'SI727_1000x800'];
    const nonTiling = resolvePlanSheeting(MAGLAS).candidates.filter(c => !c.needsTiling);

    for (let i = 1; i < nonTiling.length; i++) {
      const prev = nonTiling[i - 1], cur = nonTiling[i];
      const prevSheet = order.indexOf(prev.sheetSize), curSheet = order.indexOf(cur.sheetSize);
      expect(prevSheet).toBeLessThanOrEqual(curSheet);
      if (prevSheet === curSheet) {
        expect(prev.scaleDenominator).toBeLessThanOrEqual(cur.scaleDenominator);
      }
    }
  });

  // Legibility bounds the denominator from ABOVE: drawing smaller is what
  // destroys the label. The legacy scaleSelector inverted this, deriving a
  // denominator *floor* from average beacon spacing — which forced a sparsely
  // beaconed plan coarser the more room it had.
  test('never recommends a scale too coarse for the narrowest stand to be labelled', () => {
    const r = resolvePlanSheeting(MAGLAS);
    expect(r.legibilityMaxDenominator).toBeLessThan(Infinity);
    for (const c of r.candidates) {
      expect(c.scaleDenominator).toBeLessThanOrEqual(r.legibilityMaxDenominator);
    }
  });

  test('the narrowest stand of a 25m × 35m grid measures 25m', () => {
    expect(narrowestStandWidthM(stands(4, 875))).toBeCloseTo(Math.sqrt(875), 6);
    expect(narrowestStandWidthM({
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[[0, 0], [25, 0], [25, 35], [0, 35], [0, 0]]] },
        properties: {},
      }],
    })).toBeCloseTo(25, 6);
  });
});

describe('resolvePlanSheeting — surveyor overrides', () => {
  const bigStands = stands(240, 875);

  test('honours a declared scale on every candidate rather than correcting it', () => {
    const r = resolvePlanSheeting({
      extentM: { widthM: 500, heightM: 420 },
      parcels: bigStands,
      planType: 'general-undeveloped',
      declaredScale: 1000,
    });
    expect(r.candidates.length).toBeGreaterThan(0);
    for (const c of r.candidates) expect(c.scaleDenominator).toBe(1000);
  });

  test('escalates the sheet, not the scale, when a declared scale will not fit', () => {
    // 500m × 420m at 1:1000 is 500 × 420mm — too big for SI727_500x400's
    // drawing area, so the ladder must start on a larger sheet at 1:1000.
    const best = resolvePlanSheeting({
      extentM: { widthM: 500, heightM: 420 },
      parcels: bigStands,
      planType: 'general-undeveloped',
      declaredScale: 1000,
    }).candidates.find(c => !c.needsTiling);

    expect(best.scaleDenominator).toBe(1000);
    expect(best.sheetSize).toBe('SI727_1000x800');
  });

  test('the Reg 32(3) mandate overrides a conflicting declared scale', () => {
    const r = resolvePlanSheeting({
      extentM: { widthM: 200, heightM: 150 },
      parcels: stands(40, 150),
      planType: 'general-developed',
      declaredScale: 2000,
    });
    expect(r.mandate.mandatory500).toBe(true);
    for (const c of r.candidates) expect(c.scaleDenominator).toBe(500);
    expect(r.candidates[0].reason).toMatch(/mandate/i);
  });

  test('a declared sheet starts the ladder there but may still climb', () => {
    const sheetsUsed = resolvePlanSheeting({
      extentM: { widthM: 500, heightM: 420 },
      parcels: bigStands,
      planType: 'general-undeveloped',
      declaredSheet: 'SI727_800x500',
    }).candidates.map(c => c.sheetSize);

    expect(sheetsUsed).not.toContain('SI727_500x400');
    expect(sheetsUsed).toContain('SI727_800x500');
    expect(sheetsUsed).toContain('SI727_1000x800');
  });
});

describe('resolvePlanSheeting — edge cases', () => {
  test('the mandate never applies to a working plan', () => {
    const r = resolvePlanSheeting({
      extentM: { widthM: 200, heightM: 150 },
      parcels: stands(40, 150),
      planType: 'working-plan',
    });
    expect(r.mandate.mandatory500).toBe(false);
  });

  test('an extent too large for any sheet still yields tiling candidates', () => {
    const r = resolvePlanSheeting({
      extentM: { widthM: 50000, heightM: 40000 },
      parcels: stands(10, 875),
      planType: 'general-undeveloped',
    });
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates.every(c => c.needsTiling)).toBe(true);
  });

  test('parcels without usable geometry impose no legibility ceiling', () => {
    const r = resolvePlanSheeting({
      extentM: { widthM: 300, heightM: 200 },
      parcels: { type: 'FeatureCollection', features: [] },
      planType: 'general-undeveloped',
    });
    expect(r.legibilityMaxDenominator).toBe(Infinity);
    expect(r.candidates.length).toBeGreaterThan(0);
  });
});
