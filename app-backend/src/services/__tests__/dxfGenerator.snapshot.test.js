import { describe, test, expect } from '@jest/globals';
import { generateDXF } from '../dxfGenerator.js';
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} };

function extractTextEntities(dxfString) {
  const items = [];
  const blocks = dxfString.split(/^\s*0\s*\n\s*TEXT\s*\n/m);
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    const layer = b.match(/\s*8\s*\n\s*([^\n]+)/)?.[1]?.trim() ?? '';
    const x = parseFloat(b.match(/\s*10\s*\n\s*([-\d.]+)/)?.[1] ?? 'NaN');
    const y = parseFloat(b.match(/\s*20\s*\n\s*([-\d.]+)/)?.[1] ?? 'NaN');
    const h = parseFloat(b.match(/\s*40\s*\n\s*([-\d.]+)/)?.[1] ?? 'NaN');
    const text = b.match(/\s*1\s*\n\s*([^\n]+)/)?.[1]?.trim() ?? '';
    if (!text) continue;
    items.push({
      layer, text,
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      h: Math.round(h * 10) / 10,
    });
  }
  items.sort((a, b) => a.layer.localeCompare(b.layer) || a.y - b.y || a.x - b.x || a.text.localeCompare(b.text));
  return items;
}

describe('DXF entity-list snapshot', () => {
  test('minimal fixture', () => {
    const { buffer } = generateDXF(sampleMinimalPlan, fakeLogger);
    const items = extractTextEntities(buffer.toString());
    expect(items).toMatchSnapshot();
  });

  test('realistic fixture', () => {
    const { buffer } = generateDXF(sampleRealisticPlan, fakeLogger);
    const items = extractTextEntities(buffer.toString());
    expect(items).toMatchSnapshot();
  });
});
