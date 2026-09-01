// app-backend/src/services/__tests__/scaleTruth.test.js
import { describe, test, expect } from '@jest/globals';
import { generateGeoPDF } from '../pdfkitGeoPDF.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js';
import { measureDrawnScale } from './helpers/measureDrawnScale.js';

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

/** A plan is a scaled document: the drawing must match the ratio it prints. */
async function drawnVsStated(options) {
  const { pdfBuffer, scale } = await generateGeoPDF(options, quiet);
  const { denominator } = await measureDrawnScale(pdfBuffer);
  const stated = Number(String(scale).split(':')[1]);
  return { stated, drawn: denominator, error: Math.abs(denominator / stated - 1) };
}

describe('the PDF draws at the scale it states', () => {
  test('realistic fixture, auto', async () => {
    const { scale: _s, sheetSize: _ss, ...rest } = sampleRealisticPlan;
    const r = await drawnVsStated({ ...rest, planType: 'general-undeveloped' });
    // 1% covers coordinate-label rounding, nothing more. Before this change the
    // error was 30.6%: stated 1:600, drawn 1:417.
    expect(r.error).toBeLessThan(0.01);
  }, 120000);

  test('a declared scale is honoured metrically, not just in the caption', async () => {
    const { scale: _s, sheetSize: _ss, ...rest } = sampleRealisticPlan;
    const fine   = await drawnVsStated({ ...rest, planType: 'general-undeveloped', scale: '1:1000' });
    const coarse = await drawnVsStated({ ...rest, planType: 'general-undeveloped', scale: '1:2000' });

    expect(fine.error).toBeLessThan(0.01);
    expect(coarse.error).toBeLessThan(0.01);
    // Halving the scale must halve the drawing. Before this change both runs
    // produced an identical 720 x 468 mm figure.
    expect(coarse.drawn / fine.drawn).toBeCloseTo(2, 1);
  }, 180000);

  test('minimal fixture, auto', async () => {
    const { scale: _s, sheetSize: _ss, ...rest } = sampleMinimalPlan;
    const r = await drawnVsStated({ ...rest, planType: 'general-undeveloped' });
    expect(r.error).toBeLessThan(0.01);
  }, 120000);
});
