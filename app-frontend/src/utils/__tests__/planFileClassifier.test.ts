import { describe, it, expect } from 'vitest';
import {
  classifyPlanFile,
  tallyPlanFamily,
  type ManifestFile,
} from '../planFileClassifier';

const f = (name: string, pageCount?: number): ManifestFile =>
  pageCount === undefined
    ? { name, relDir: 'output/general-plans' }
    : { name, relDir: 'output/general-plans', pageCount };

describe('classifyPlanFile', () => {
  it('reads a general plan PDF sheet count from its page count', () => {
    expect(classifyPlanFile(f('general-undeveloped-MAGLAS.pdf', 3), 'general')).toEqual({
      role: 'sheet',
      sheets: 3,
    });
  });

  it('reports an unknown general plan sheet count as null, never as 1', () => {
    // Guessing 1 would silently under-report a 3-sheet plan to the Surveyor-General.
    expect(classifyPlanFile(f('general-undeveloped-MAGLAS.pdf'), 'general')).toEqual({
      role: 'sheet',
      sheets: null,
    });
  });

  it('treats a diagram as exactly one sheet, ignoring any page count', () => {
    expect(classifyPlanFile(f('diagram-STAND_207.pdf'), 'diagram')).toEqual({
      role: 'sheet',
      sheets: 1,
    });
    expect(classifyPlanFile(f('diagram-STAND_207.pdf', 7), 'diagram')).toEqual({
      role: 'sheet',
      sheets: 1,
    });
  });

  it('classifies a DXF as cad, carrying no sheets', () => {
    expect(classifyPlanFile(f('general-undeveloped-MAGLAS.dxf'), 'general')).toEqual({
      role: 'cad',
      sheets: 0,
    });
  });

  it('classifies the statistics summary as summary, never as a sheet', () => {
    expect(classifyPlanFile(f('general-undeveloped-MAGLAS-summary.pdf'), 'general')).toEqual({
      role: 'summary',
      sheets: 0,
    });
  });

  it('returns null for anything that is not a plan product', () => {
    expect(classifyPlanFile(f('beacon-receipt-scan.jpg'), 'general')).toBeNull();
    expect(classifyPlanFile(f('notes.txt'), 'diagram')).toBeNull();
  });
});

describe('tallyPlanFamily', () => {
  it('tallies the worked example for general plans', () => {
    // Two plans, one of three sheets and one of one, each with a DXF twin and a summary.
    const files = [
      f('general-undeveloped-MAGLAS.pdf', 3),
      f('general-undeveloped-MAGLAS.dxf'),
      f('general-undeveloped-MAGLAS-summary.pdf'),
      f('general-developed-MAGLAS.pdf', 1),
      f('general-developed-MAGLAS.dxf'),
    ];
    expect(tallyPlanFamily(files, 'general')).toEqual({
      plans: 2,
      sheets: 4,
      copies: 2,
      dxf: 2,
    });
  });

  it('tallies three diagrams at three copies each', () => {
    const files = [
      f('diagram-STAND_207.pdf'),
      f('diagram-STAND_207.dxf'),
      f('diagram-STAND_208.pdf'),
      f('diagram-STAND_208.dxf'),
      f('diagram-STAND_209.pdf'),
      f('diagram-STAND_209.dxf'),
    ];
    expect(tallyPlanFamily(files, 'diagram')).toEqual({
      plans: 3,
      sheets: 3,
      copies: 9,
      dxf: 3,
    });
  });

  it('reports sheets as null when ANY contributing plan count is unknown', () => {
    // A partial sum would read as authoritative while being short.
    const files = [f('general-a.pdf', 3), f('general-b.pdf')];
    expect(tallyPlanFamily(files, 'general').sheets).toBeNull();
    expect(tallyPlanFamily(files, 'general').plans).toBe(2);
  });

  it('counts no plans when only a DXF is present', () => {
    expect(tallyPlanFamily([f('general-undeveloped-MAGLAS.dxf')], 'general')).toEqual({
      plans: 0,
      sheets: 0,
      copies: 0,
      dxf: 1,
    });
  });

  it('returns an all-zero tally for no files', () => {
    expect(tallyPlanFamily([], 'general')).toEqual({ plans: 0, sheets: 0, copies: 0, dxf: 0 });
  });

  it('does not count the summary as a plan', () => {
    const files = [f('general-a-summary.pdf')];
    expect(tallyPlanFamily(files, 'general').plans).toBe(0);
  });
});
