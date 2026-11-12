/**
 * The party-wall servitude statement must reach the DXF.
 *
 * The shared planner has always reserved a slot for it (the PDF draws it there),
 * but the DXF emitter never drew anything at that slot, so a General Plan's
 * servitude tables were missing from every DXF export.
 */
import { describe, test, expect } from '@jest/globals';
import { generateDXF } from '../dxfGenerator.js';
import { sampleRealisticPlan } from './fixtures/sampleRealisticPlan.js';

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
const rows = [
  { stands: '100, 101', boundary: '100A - 101B' },
  { stands: '102, 103', boundary: '102C - 103D' },
];
const withRows = (planType) => ({
  ...sampleRealisticPlan,
  planType,
  metadata: { ...sampleRealisticPlan.metadata, servitudeStatement: { rows } },
});
const dxfText = (buf) => buf.toString('latin1');

describe('DXF party-wall servitude statement', () => {
  test('is drawn on a general plan: heading, column headers and every row', () => {
    const t = dxfText(generateDXF(withRows('general-developed'), logger).buffer);
    expect(t).toContain('Party-wall servitudes data');
    expect(t).toContain('STAND NUMBER');
    expect(t).toContain('BOUNDARY');
    for (const r of rows) {
      expect(t).toContain(r.stands);
      expect(t).toContain(r.boundary);
    }
  }, 120000);

  test('is absent when the plan has no party-wall rows', () => {
    const t = dxfText(generateDXF({ ...sampleRealisticPlan, planType: 'general-developed' }, logger).buffer);
    expect(t).not.toContain('Party-wall servitudes data');
  }, 120000);

  test('a very long statement is split into continuation boxes rather than left on the schedule', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ stands: `${300 + 2 * i}, ${301 + 2 * i}`, boundary: `${300 + 2 * i}A - ${301 + 2 * i}B` }));
    const plan = {
      ...sampleRealisticPlan, planType: 'general-developed',
      metadata: { ...sampleRealisticPlan.metadata, servitudeStatement: { rows: many } },
    };
    const result = generateDXF(plan, logger);
    const t = dxfText(result.buffer);
    // Either the rows were split to fit, or the sheet grew -- never printed over other blocks.
    expect(t.includes("(cont'd)") || result.sheetSize !== 'SI727_800x500').toBe(true);
    for (const r of many) expect(t).toContain(r.boundary);   // no row lost
  }, 180000);
});

describe('DXF party-wall servitude statement: the dash between two beacons', () => {
  // The statement's rows join the two beacons with an en dash. The DXF is written as UTF-8, so the en dash was
  // E2 80 93, which a Windows-1252 viewer showed as "1692B â€“ 1693A".
  const dashRows = [
    { stands: '1692, 1693', boundary: '1692B – 1693A' },
    { stands: '1694, 1695', boundary: '1694A—1695C' },
  ];
  const buf = generateDXF(withRows('general-developed'), logger).buffer;
  const out = generateDXF({ ...sampleRealisticPlan, planType: 'general-developed',
    metadata: { ...sampleRealisticPlan.metadata, servitudeStatement: { rows: dashRows } } }, logger).buffer;

  test('is lettered as a plain hyphen, "1692B - 1693A"', () => {
    const t = dxfText(out);
    expect(t).toContain('1692B - 1693A');
    expect(t).toContain('1694A-1695C');
  }, 120000);

  test('leaves no UTF-8 dash bytes to be misread as "â€“"', () => {
    expect(Buffer.from(out).includes(Buffer.from([0xe2, 0x80, 0x93]))).toBe(false);
    expect(Buffer.from(out).includes(Buffer.from([0xe2, 0x80, 0x94]))).toBe(false);
    expect(dxfText(out)).not.toContain('â\u0080\u0093');
    expect(buf.length).toBeGreaterThan(0);
  }, 120000);
});
