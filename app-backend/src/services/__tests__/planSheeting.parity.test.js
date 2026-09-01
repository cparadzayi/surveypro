/**
 * PDF ↔ DXF sheeting parity.
 *
 * `selectFigureScale`'s docstring has long claimed both generators share it so
 * they "always resolve to the SAME scale". They never did — only dxfGenerator
 * imported it — and nothing tested the claim. Measured before this suite
 * existed: for the Maglas fixture with nothing declared, PDF resolved 1:1250
 * and DXF 1:1000; with a declared 1:1000 the PDF silently moved to 1:1250 while
 * the DXF honoured it.
 *
 * Both generators must now agree, because both consult the shared resolver in
 * app-shared/planSheeting.js.
 *
 * ESCALATION: when block placement fails, both generators climb the SI 727
 * sheet ladder and re-enter the resolver with a TIGHTER block-room budget
 * (BLOCK_ROOM_BUDGETS in app-shared/planSheeting.js), so the room a bigger
 * sheet buys is not immediately spent on a bigger figure. Both apply the same
 * rung for the same attempt number, so parity survives escalation by
 * construction — but the two generators can still need a DIFFERENT NUMBER of
 * escalations for the same plan, since each measures placement against its own
 * emitted blocks. The end-to-end parity assertions therefore use a fixture
 * whose escalation count matches on both sides.
 *
 * COST NOTE: a full PDF render of a dense fixture costs 300-500s because every
 * needsScaleUp escalation re-renders the whole plan. The end-to-end parity
 * assertions therefore use the light `sampleRealisticPlan` (~20s); the dense
 * fixtures are covered DXF-side only, which is fast, plus the pure-resolver
 * suite in planSheeting.test.js.
 */
import { describe, test, expect } from '@jest/globals';
import { generateGeoPDF } from '../pdfkitGeoPDF.js';
import { generateDXF } from '../dxfGenerator.js';
import { resolvePlanSheeting, drawingAreaMm, FIGURE_MAX_FRACTION } from '../../../../app-shared/planSheeting.js';
import { sampleMaglasPlan } from './fixtures/sampleMaglasPlan.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';
import { sampleDevelopedLargeStandsPlan } from './fixtures/sampleDevelopedLargeStandsPlan.js';
import { sampleUndevelopedSmallStandsPlan } from './fixtures/sampleUndevelopedSmallStandsPlan.js';

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

/** Strip any pinned scale/sheet so the auto path is what gets exercised. */
function autoOptions(fixture, planType) {
  const { scale, sheetSize, ...rest } = fixture;
  return { ...rest, planType };
}

describe('PDF ↔ DXF sheeting parity — end to end', () => {
  test('both generators resolve the same scale and sheet on auto', async () => {
    const options = autoOptions(sampleRealisticPlan, 'general-undeveloped');

    const pdf = await generateGeoPDF({ ...options }, quiet);
    const dxf = generateDXF({ ...options }, quiet);

    expect(dxf.scale).toBe(pdf.scale);
    expect(dxf.sheetSize).toBe(pdf.sheetSize);
  }, 180000);

  test('a declared scale is honoured identically by both generators', async () => {
    const options = { ...autoOptions(sampleRealisticPlan, 'general-undeveloped'), scale: '1:750' };

    const pdf = await generateGeoPDF({ ...options }, quiet);
    const dxf = generateDXF({ ...options }, quiet);

    expect(dxf.scale).toBe('1:750');
    expect(pdf.scale).toBe('1:750');
  }, 180000);
});

describe('DXF consumes the shared resolver', () => {
  const FIXTURES = [
    ['Maglas (240 large stands)', sampleMaglasPlan],
    ['realistic plan', sampleRealisticPlan],
    ['developed township, large stands', sampleDevelopedLargeStandsPlan],
    ['undeveloped township, small stands', sampleUndevelopedSmallStandsPlan],
  ];

  for (const [name, fixture] of FIXTURES) {
    test(`${name}: DXF renders a resolver candidate at a usable size`, () => {
      const options = autoOptions(fixture, 'general-undeveloped');
      const dxf = generateDXF({ ...options, sheetSize: 'SI727_500x400' }, quiet);

      // This used to assert the FINEST candidate for the landed sheet, on the
      // reasoning that a placement failure re-enters the resolver "as designed".
      // It no longer holds, and should not: escalation now TIGHTENS the
      // block-room budget (BLOCK_ROOM_BUDGETS) rather than re-resolving at the
      // default 0.75 or pinning the scale, precisely so the room bought by a
      // bigger sheet is not handed straight back to a bigger figure. The finest
      // candidate for the landed sheet is therefore the answer the renderer
      // deliberately declined to take.
      //
      // What IS invariant, and is what the tightening must never break:
      //   1. the rendered (scale, sheet) pair is a non-tiling candidate of the
      //      resolver for the sheet it landed on — the renderer never invents an
      //      off-ladder scale and never renders a figure too big for the paper.
      //      Checked at the DEFAULT budget, because a tightened budget can only
      //      ever yield a subset of the default's candidates for a given sheet.
      //   2. the resulting fill stays inside the guard band — the substantive
      //      half. Pinning the scale satisfied (1) while stranding Maglas at
      //      0.26 fill on the largest sheet, which is the bug being fixed.
      const { candidates, mandate } = resolvePlanSheeting({
        extentM: dxfExtentM(fixture),
        parcels: fixture.parcels,
        planType: 'general-undeveloped',
        declaredSheet: dxf.sheetSize,
        figureMaxFraction: FIGURE_MAX_FRACTION,
      });
      const match = candidates.find(
        (c) => c.sheetSize === dxf.sheetSize && !c.needsTiling && c.scaleLabel === dxf.scale,
      );
      expect(
        match ? match.scaleLabel : `${dxf.scale} on ${dxf.sheetSize} (candidates: ${
          candidates.filter(c => c.sheetSize === dxf.sheetSize && !c.needsTiling)
                    .map(c => c.scaleLabel).join(', ') || 'none'})`,
      ).toBe(dxf.scale);

      const fill = fillOf(fixture, dxf);
      expect(fill).toBeLessThanOrEqual(0.75);
      // Reg 32(3) fixes a mandated township at exactly 1:500 whatever that does
      // to the fill, so the floor is only meaningful on the auto-fitted path.
      if (!mandate.mandatory500) expect(fill).toBeGreaterThan(0.4);
    }, 120000);
  }

  test('DXF honours the block-room ceiling, not just the raw fit', () => {
    const { scale, sheetSize, ...rest } = sampleMaglasPlan;
    const dxf = generateDXF({ ...rest, planType: 'general-undeveloped' }, quiet);

    const fill = fillOf(sampleMaglasPlan, dxf);

    expect(fill).toBeLessThanOrEqual(0.75);
    expect(fill).toBeGreaterThan(0.4); // and not absurdly small either
  }, 120000);
});

/**
 * Share of the canonical drawing area the rendered figure occupies, from the
 * (scale, sheet) a generator reports. The single measure both fill guards use.
 */
function fillOf(fixture, rendered) {
  const denominator = Number(String(rendered.scale).split(':')[1]);
  const area = drawingAreaMm(rendered.sheetSize);
  const { widthM, heightM } = dxfExtentM(fixture);
  return Math.max(
    (widthM / denominator) * 1000 / area.widthMm,
    (heightM / denominator) * 1000 / area.heightMm,
  );
}

/** Ground extent of a fixture's outside figure, as the DXF generator derives it. */
function dxfExtentM(fixture) {
  const ys = [], xs = [];
  for (const c of fixture.outsideFigureData.coordinates) { ys.push(c.y); xs.push(c.x); }
  return { widthM: Math.max(...ys) - Math.min(...ys), heightM: Math.max(...xs) - Math.min(...xs) };
}

/**
 * The reported bug, guarded end to end.
 *
 * Measured before the shared resolver existed: auto put a 50 x 42mm figure on a
 * 1000 x 800mm sheet (8.8% fill) because the preview recommended 1:10000. This
 * asserts the whole wired path — frontend sends nothing, resolver decides,
 * renderer honours it — keeps the figure a usable size.
 */
describe('auto never produces a postage-stamp figure', () => {
  test('Maglas on full auto fills a usable fraction of the sheet', async () => {
    const { scale, sheetSize, ...rest } = sampleMaglasPlan;
    const pdf = await generateGeoPDF({ ...rest, planType: 'general-undeveloped' }, quiet);

    const fill = fillOf(sampleMaglasPlan, pdf);

    // Pre-fix this was 0.088. Anything below ~a third of the sheet is the
    // postage-stamp failure returning.
    expect(fill).toBeGreaterThan(0.5);
  }, 600000);
});
