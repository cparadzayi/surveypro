import { describe, test, expect } from '@jest/globals';
import { generateGeoPDF } from '../pdfkitGeoPDF.js';
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} };

async function extractTextPositions(pdfBuffer) {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBuffer), useSystemFonts: false });
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
});
