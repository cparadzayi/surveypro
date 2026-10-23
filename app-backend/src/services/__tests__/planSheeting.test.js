import { describe, test, expect } from '@jest/globals';
import { floorDevelopedDenominator, resolvePlanSheeting, drawingAreaMm, narrowestStandWidthM, TOPOLOGY_GATED_FRACTION, FIGURE_MARGIN_MM } from '../../../../app-shared/planSheeting.js';

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

describe('resolvePlanSheeting — Reg 32(3) mandate removed', () => {
  test('the mandate no longer exists: small-stand townships are not pinned to 1:500', () => {
    const result = resolvePlanSheeting({
      extentM: { widthM: 300, heightM: 200 },
      parcels: stands(40, 150),
      planType: 'general-developed',
    });

    expect(result).not.toHaveProperty('mandate');
    expect(result.candidates.length).toBeGreaterThan(0);
    // Auto-fit respects legibility; it is not forced onto any single denominator.
    expect(result.candidates.every((c) => c.scaleDenominator === 500)).toBe(false);
  });

  test('never emits a multi-sheet (needsTiling) candidate — single-sheet only', () => {
    const result = resolvePlanSheeting({
      extentM: { widthM: 50000, heightM: 40000 },
      parcels: stands(10, 875),
      planType: 'general-undeveloped',
    });
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.needsTiling === false)).toBe(true);
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

  test('never emits any tiling candidate for general plans', () => {
    const tilingFlags = resolvePlanSheeting(MAGLAS).candidates.map(c => c.needsTiling);
    expect(tilingFlags.every((f) => f === false)).toBe(true);
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

  test('a declared scale on a small-stand township is honoured (no mandate override)', () => {
    const r = resolvePlanSheeting({
      extentM: { widthM: 200, heightM: 150 },
      parcels: stands(40, 150),
      planType: 'general-developed',
      declaredScale: 2000,
    });
    expect(r).not.toHaveProperty('mandate');
    for (const c of r.candidates) expect(c.scaleDenominator).toBe(2000);
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
    // Margin-inset sheet less the title band, less the clearance the figure keeps
    // from the left/right/bottom margins (FIGURE_MARGIN_MM = 10):
    //   500 - 50 - 150 = 300 wide  - 2*10 = 280; 400 - 50 - 50 - 55 = 245 high - 10 = 235.
    expect(drawingAreaMm('SI727_500x400')).toEqual({ widthMm: 280, heightMm: 235 });
    expect(drawingAreaMm('SI727_1000x800')).toEqual({ widthMm: 780, heightMm: 635 });
  });

  test('a measured title band overrides the estimate', () => {
    expect(drawingAreaMm('SI727_500x400', { titleBandMm: 46.2 }).heightMm)
      .toBeCloseTo(243.8, 6);   // 400 - 100 - 46.2 - 10
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
  test('an extent too large for any sheet yields a best-effort single-sheet candidate (no tiling)', () => {
    const r = resolvePlanSheeting({
      extentM: { widthM: 50000, heightM: 40000 },
      parcels: stands(10, 875),
      planType: 'general-undeveloped',
    });
    expect(r.candidates.length).toBeGreaterThan(0);
    expect(r.candidates.every(c => c.needsTiling === false)).toBe(true);
    expect(r.candidates[0].reason).toMatch(/best-effort single sheet/i);
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

// ── Topology-gated fraction: the 0.98 lever that admits 1:750 on landscape ──
describe('resolvePlanSheeting — topology-gated fraction', () => {
  const parcels = stands(12, 100);
  const extentM = { widthM: 350, heightM: 400 };

  function onSheet1000(result) {
    return result.candidates.filter((c) => c.sheetSize === 'SI727_1000x800');
  }

  test('without topologyGatedFraction the default answer is unchanged (1:1000 on 1000x800)', () => {
    const r = resolvePlanSheeting({ extentM, parcels, planType: 'general-developed' });
    const onSheet = onSheet1000(r);
    expect(onSheet.length).toBeGreaterThan(0);
    expect(onSheet[0].scaleDenominator).toBe(1000);
  });

  test('with TOPOLOGY_GATED_FRACTION the first 1000x800 candidate is 1:750', () => {
    const r = resolvePlanSheeting({
      extentM,
      parcels,
      planType: 'general-developed',
      topologyGatedFraction: TOPOLOGY_GATED_FRACTION,
    });
    const onSheet = onSheet1000(r);
    expect(onSheet.length).toBeGreaterThan(0);
    expect(onSheet[0].scaleDenominator).toBe(750);
  });

  test('TOPOLOGY_GATED_FRACTION is 0.98 (the documented constant)', () => {
    expect(TOPOLOGY_GATED_FRACTION).toBe(0.98);
  });

  test('topologyGatedFraction: null keeps default (gate is opt-in only)', () => {
    const r = resolvePlanSheeting({
      extentM,
      parcels,
      planType: 'general-developed',
      topologyGatedFraction: null,
    });
    const onSheet = onSheet1000(r);
    expect(onSheet[0].scaleDenominator).toBe(1000);
  });
});

describe('drawingAreaMm — the figure keeps clear of the drawing margins', () => {
  test('takes the clearance off both sides of the width and the bottom of the height', () => {
    // SI727_1000x800: 1000 - 50 - 150 = 800 wide; 800 - 50 - 50 - band tall.
    const a = drawingAreaMm('SI727_1000x800', { titleBandMm: 55 });
    expect(a.widthMm).toBe(800 - 2 * FIGURE_MARGIN_MM);
    expect(a.heightMm).toBe(700 - 55 - FIGURE_MARGIN_MM);
  });

  test('the clearance is a readable gap', () => {
    expect(FIGURE_MARGIN_MM).toBeGreaterThanOrEqual(8);
  });

  test('a figure that exactly filled the old area no longer fits', () => {
    const a = drawingAreaMm('SI727_1000x800', { titleBandMm: 55 });
    expect(a.widthMm).toBeLessThan(800);
  });
});

describe('developed-township floor — never finer than 1:500', () => {
  const small = { extentM: { widthM: 120, heightM: 80 }, parcels: stands(12, 4000) };

  test('auto-fit on a small figure picks nothing finer than 1:500', () => {
    // Undeveloped, the same figure fits a finer scale; developed it must not.
    const undeveloped = resolvePlanSheeting({ ...small, planType: 'general-undeveloped' });
    const developed = resolvePlanSheeting({ ...small, planType: 'general-developed' });
    expect(Math.min(...undeveloped.candidates.map((c) => c.scaleDenominator))).toBeLessThan(500);
    expect(Math.min(...developed.candidates.map((c) => c.scaleDenominator))).toBeGreaterThanOrEqual(500);
  });

  test('a declared finer scale is raised to 1:500', () => {
    const r = resolvePlanSheeting({ ...small, planType: 'general-developed', declaredScale: 400 });
    expect(r.candidates.every((c) => c.scaleDenominator === 500)).toBe(true);
  });

  test('a declared scale at or coarser than 1:500 is honoured', () => {
    const r = resolvePlanSheeting({ ...small, planType: 'general-developed', declaredScale: 1000 });
    expect(r.candidates.every((c) => c.scaleDenominator === 1000)).toBe(true);
  });

  test('the floor applies to developed plans only', () => {
    expect(floorDevelopedDenominator('general-developed', 400)).toBe(500);
    expect(floorDevelopedDenominator('general-developed', 750)).toBe(750);
    expect(floorDevelopedDenominator('general-undeveloped', 400)).toBe(400);
    expect(floorDevelopedDenominator(null, 250)).toBe(250);
  });
});
