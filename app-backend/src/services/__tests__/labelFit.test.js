// app-backend/src/services/__tests__/labelFit.test.js
import { describe, test, expect } from '@jest/globals';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { generateGeoPDF } from '../pdfkitGeoPDF.js';
import { sampleMaglasPlan } from './fixtures/sampleMaglasPlan.js';
import { measureDrawnScale } from './helpers/measureDrawnScale.js';

const quiet = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const PT_PER_MM = 72 / 25.4;

// Measured on the current renderer, 2026-09-01, before the scale-truth change:
// `node --experimental-vm-modules node_modules/jest/bin/jest.js labelFit` with
// this constant set to Infinity printed "[labelFit] 0 labels wider than their
// stand" (fixture rendered at its pinned 1:1000 scale on SI727_500x400).
// A non-zero baseline is a pre-existing defect, not a licence to grow it.
const BASELINE_OVERFLOWING = 0;

/** Narrowest width of a polygon in ground metres (its "thickness"). */
function narrowestWidthM(ring) {
  const v = ring.slice(0, -1);
  let thickness = Infinity;
  for (let i = 0; i < v.length; i++) {
    const j = (i + 1) % v.length;
    const dx = v[j][0] - v[i][0];
    const dy = v[j][1] - v[i][1];
    const len = Math.hypot(dx, dy);
    if (!Number.isFinite(len) || len < 1e-9) continue;
    let maxPerp = 0;
    for (let k = 0; k < v.length; k++) {
      if (k === i || k === j) continue;
      const perp = Math.abs((v[k][0] - v[i][0]) * dy - (v[k][1] - v[i][1]) * dx) / len;
      if (Number.isFinite(perp)) maxPerp = Math.max(maxPerp, perp);
    }
    if (maxPerp > 0) thickness = Math.min(thickness, maxPerp);
  }
  return thickness;
}

describe('stand labels fit the stands they name', () => {
  test('no stand number is wider on paper than its own stand', async () => {
    const { pdfBuffer } = await generateGeoPDF(
      { ...sampleMaglasPlan, planType: 'general-undeveloped' }, quiet,
    );
    const { mmPerMetre } = await measureDrawnScale(pdfBuffer);

    // Ground width of each stand, by designation.
    const widthByStand = new Map();
    for (const f of sampleMaglasPlan.parcels.features) {
      const stand = String(f.properties?.stand ?? '').trim();
      const ring = f.geometry?.type === 'Polygon' ? f.geometry.coordinates?.[0] : null;
      if (!stand || !ring || ring.length < 4) continue;
      widthByStand.set(stand, narrowestWidthM(ring));
    }

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(pdfBuffer), useSystemFonts: false, verbosity: 0,
    }).promise;
    const page = await doc.getPage(1);

    const overflowing = [];
    for (const it of (await page.getTextContent()).items) {
      const text = (it.str || '').trim();
      if (!widthByStand.has(text)) continue;          // only stand-number labels
      const labelMm = it.width / PT_PER_MM;
      const standMm = widthByStand.get(text) * mmPerMetre;
      if (labelMm > standMm) overflowing.push({ text, labelMm, standMm });
    }

    // Baseline: record what the CURRENT renderer does. Task 5 shrinks every
    // stand on paper while the label keeps its point size, so this number is
    // the thing that must not grow.
    console.log(`[labelFit] ${overflowing.length} labels wider than their stand`);
    expect(overflowing.length).toBeLessThanOrEqual(BASELINE_OVERFLOWING);
  }, 600000);
});
