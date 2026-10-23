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
