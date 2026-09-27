// Run with `npm test` (Jest 30 ESM needs --experimental-vm-modules; npx jest will fail).
import { describe, test, expect } from '@jest/globals';
import { generateGeoPDF } from '../pdfkitGeoPDF.js';
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';
import { sampleMaglasPlan } from './fixtures/sampleMaglasPlan.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} };

async function extractTextPositions(pdfBuffer) {
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: false,
    verbosity: 0,
  });
  const pdf = await loadingTask.promise;
  const items = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const it of content.items) {
      if (!it.str || !it.str.trim()) continue;
      const tx = it.transform;
      items.push({
        page: p,
        text: it.str,
        x: Math.round(tx[4] * 10) / 10,
        y: Math.round(tx[5] * 10) / 10,
        size: Math.round(it.height * 10) / 10,
        font: it.fontName,
      });
    }
  }
  items.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x || a.text.localeCompare(b.text));
  return items;
}

describe('PDF text+position snapshot', () => {
  test('minimal fixture', async () => {
    const { pdfBuffer } = await generateGeoPDF(sampleMinimalPlan, fakeLogger);
    const items = await extractTextPositions(pdfBuffer);
    expect(items).toMatchSnapshot();
  }, 30000);

  test('realistic fixture', async () => {
    const { pdfBuffer } = await generateGeoPDF(sampleRealisticPlan, fakeLogger);
    const items = await extractTextPositions(pdfBuffer);
    expect(items).toMatchSnapshot();
  }, 30000);

  // 600000, matching labelFit: this case takes ~260s, and passed under the old
  // 60s only because the render never yields — the first genuine `await` on that
  // path would have turned it into a spurious red.
  //
  // This render is measured at 260–570 s and is wildly variable run to run (a
  // single observation above 900 s turned out to be noise, not a regression, so
  // do not "optimise" the placement engine based on one slow run). 600 s left
  // only a ~30 s margin over a typical 570 s, which is not a margin — it is a coin
  // flip. 1800 s is headroom. The other two fixtures render in ~3 s each, so a
  // real plan is nowhere near this slow; this fixture is an outlier that happens
  // to be the one we snapshot.
  test('Maglas fixture', async () => {
    const { pdfBuffer } = await generateGeoPDF(sampleMaglasPlan, fakeLogger);
    const items = await extractTextPositions(pdfBuffer);
    expect(items).toMatchSnapshot();
  }, 1800000);
});
