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
 * KNOWN GAP (Phase 2): both generators now START from the same resolver answer,
 * but on dense plans each can still END elsewhere, because escalation is driven
 * by each generator's own drawing-area model. Measured on Maglas: the resolver
 * says 1:1250 on SI727_800x500; PDF's 90% margin loop overrides to 1:2000
 * because its real figureBounds allows 246mm of height where the resolver's
 * reserve model assumes 340mm. Unifying that model is Phase 2 of the spec. The
 * end-to-end assertions below therefore hold for plans that do not escalate.
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
import { resolvePlanSheeting, drawingAreaMm } from '../../../../app-shared/planSheeting.js';
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
    test(`${name}: DXF reports the scale the resolver chose`, () => {
      const options = autoOptions(fixture, 'general-undeveloped');
      const dxf = generateDXF({ ...options, sheetSize: 'SI727_500x400' }, quiet);

      // Compare against the sheet the DXF actually landed on: a block-placement
      // failure escalates the sheet and re-enters the resolver, which is the
      // ladder being walked as designed.
      const expected = resolvePlanSheeting({
        extentM: dxfExtentM(fixture),
        parcels: fixture.parcels,
        planType: 'general-undeveloped',
        declaredSheet: dxf.sheetSize,
      }).candidates.find(c => c.sheetSize === dxf.sheetSize);

      expect(expected).toBeDefined();
      expect(dxf.scale).toBe(expected.scaleLabel);
    }, 120000);
  }

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
});

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

    const denominator = Number(String(pdf.scale).split(':')[1]);
    const { widthM, heightM } = dxfExtentM(sampleMaglasPlan);
    const area = drawingAreaMm(pdf.sheetSize);
    const fill = Math.max(
      (widthM / denominator) * 1000 / area.widthMm,
      (heightM / denominator) * 1000 / area.heightMm,
    );

    // Pre-fix this was 0.088. Anything below ~a third of the sheet is the
    // postage-stamp failure returning.
    expect(fill).toBeGreaterThan(0.5);
  }, 600000);
});
