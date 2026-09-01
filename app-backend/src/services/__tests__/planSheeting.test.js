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
