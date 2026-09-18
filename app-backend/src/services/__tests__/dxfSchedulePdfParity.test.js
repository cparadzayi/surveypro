/**
 * The DXF must draw the Schedule of Areas at the same density as the PDF.
 *
 * Both read SCHEDULE_OF_AREAS.singleColumn.rowHeight — or they are supposed to.
 * dxfGenerator built its bottom-zone font bundle with a hardcoded `rH: pt(15)`,
 * mirroring a literal the PDF used to carry too. When the PDF moved to 13pt the
 * DXF kept drawing 15pt rows: on the reported Maglas sheet the two formats came
 * out of the SAME export run with 12.9pt and 15.0pt row pitch respectively, and
 * the taller DXF tables (133 rows x 15pt + chrome = 721mm) no longer fitted the
 * 690mm band, so their tops collapsed flush instead of staggering under the
 * title block the way the PDF's do.
 *
 * This measures the pitch actually emitted rather than reading the constant, so
 * it fails for any future divergence however it is introduced.
 */
import { describe, test, expect } from '@jest/globals';
import { generateDXF } from '../dxfGenerator.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';
import BLOCKS from '../../../../app-shared/block-definitions.js';

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const PT_PER_MM = 2.83465;

/** TEXT/MTEXT entities as {layer, text, x, y}. */
function readTextEntities(buffer) {
  const lines = buffer.toString('latin1').split(/\r?\n/);
  const out = [];
  let cur = null;
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = lines[i].trim(), val = lines[i + 1];
    if (code === '0') {
      if (cur && (cur.type === 'TEXT' || cur.type === 'MTEXT')) out.push(cur);
      cur = { type: val.trim() };
    } else if (cur) {
      if (code === '8') cur.layer = val.trim();
      if (code === '1') cur.text = val;
      if (code === '10') cur.x = parseFloat(val);
      if (code === '20') cur.y = parseFloat(val);
    }
  }
  if (cur && (cur.type === 'TEXT' || cur.type === 'MTEXT')) out.push(cur);
  return out;
}

describe('DXF schedule density matches the PDF', () => {
  test('emitted row pitch equals SCHEDULE_OF_AREAS rowHeight at the drawn scale', () => {
    const result = generateDXF(sampleRealisticPlan, fakeLogger);
    const scaleDenom = Number(String(result.scale).split(':')[1]);
    expect(Number.isFinite(scaleDenom)).toBe(true);

    // Schedule rows are stand numbers drawn in the bottom zone, which shares the
    // TITLE_BLOCK layer. Take the stand values the fixture actually contains.
    const stands = new Set(
      sampleRealisticPlan.parcels.features
        .map((f) => String(f.properties.stand || '').trim())
        .filter((s) => s && !/outside figure/i.test(s)),
    );
    const rows = readTextEntities(result.buffer)
      .filter((e) => e.layer === 'TITLE_BLOCK' && stands.has((e.text || '').trim()));
    expect(rows.length).toBeGreaterThan(3);      // need a few to measure a pitch

    // Pitch of the tallest column, in ground metres, then back to paper points.
    const byX = new Map();
    for (const r of rows) {
      const k = Math.round(r.x * 10) / 10;
      byX.set(k, [...(byX.get(k) || []), r.y]);
    }
    const column = [...byX.values()].sort((a, b) => b.length - a.length)[0].sort((a, b) => b - a);
    const pitchGround = (column[0] - column[column.length - 1]) / (column.length - 1);
    const pitchPt = (pitchGround * 1000) / scaleDenom * PT_PER_MM;

    expect(pitchPt).toBeCloseTo(BLOCKS.SCHEDULE_OF_AREAS.singleColumn.rowHeight, 1);
  }, 60000);
});
