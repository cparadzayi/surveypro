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
 * COST NOTE: a full PDF render of a dense fixture costs 300-500s because every
 * needsScaleUp escalation re-renders the whole plan. The end-to-end parity
 * assertions therefore use the light `sampleRealisticPlan` (~20s); the dense
 * fixtures are covered DXF-side only, which is fast, plus the pure-resolver
 * suite in planSheeting.test.js.
 */
import { describe, test, expect } from '@jest/globals';
import { generateGeoPDF } from '../pdfkitGeoPDF.js';
import { generateDXF } from '../dxfGenerator.js';
import { resolvePlanSheeting } from '../../../../app-shared/planSheeting.js';
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
});

/** Ground extent of a fixture's outside figure, as the DXF generator derives it. */
function dxfExtentM(fixture) {
  const ys = [], xs = [];
  for (const c of fixture.outsideFigureData.coordinates) { ys.push(c.y); xs.push(c.x); }
  return { widthM: Math.max(...ys) - Math.min(...ys), heightM: Math.max(...xs) - Math.min(...xs) };
}
