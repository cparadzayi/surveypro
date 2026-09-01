import { describe, test, expect } from '@jest/globals';
import { generateGeoPDF } from '../pdfkitGeoPDF.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';
import { measureDrawnScale } from './helpers/measureDrawnScale.js';

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };

describe('measureDrawnScale — the instrument itself', () => {
  test('both axes agree, so the measurement is not a one-direction artefact', async () => {
    const { pdfBuffer } = await generateGeoPDF({ ...sampleRealisticPlan }, quiet);
    const m = await measureDrawnScale(pdfBuffer);

    // A uniform transform must give the same points-per-metre either way.
    expect(m.axisAgreement).toBeLessThan(0.005);
    expect(m.denominator).toBeGreaterThan(1);
    expect(Number.isFinite(m.mmPerMetre)).toBe(true);
  }, 60000);
});
