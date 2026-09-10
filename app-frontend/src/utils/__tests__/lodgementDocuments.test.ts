import { describe, it, expect } from 'vitest';
import { LODGEMENT_DOCUMENTS, lodgementDocumentsFor, resolveLodgementDocuments, markRecordSectionsPresent, type ManifestFile } from '../lodgementDocuments';
import type { RecordComposition } from '../recordComposition';

describe('LODGEMENT_DOCUMENTS', () => {
  it('lists the 12 canonical items in order, with Diagram before General Plan', () => {
    expect(LODGEMENT_DOCUMENTS).toEqual([
      'Field book',
      'Coordinate List and Calculations',
      'Diagram',
      'General Plan',
      'Working Plan',
      'Report on Survey',
      'Dispensation Certificate',
      'Checklist',
      'DSG Certificate (1/96)',
      'Permit/Instruction and layout',
      'Beacon receipt',
      'Searches',
    ]);
  });
});

const f = (name: string, relDir: string): ManifestFile => ({ name, relDir });

describe('resolveLodgementDocuments — generated docs (folder + keyword)', () => {
  it('ticks a generated item only when BOTH its folder and keyword match', () => {
    const files = [
      f('MAG1_FieldBook.pdf', 'output/field-book'),
      f('MAG1_CoordinateList.pdf', 'output/coordinate-list'),
      f('Comprehensive_Latest.pdf', 'output/calculations'),
      f('GENERAL-PLAN-Maglas.pdf', 'output/general-plans'),
      f('DSG-1-96.pdf', 'output/certificates'),
    ];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Field book']).toBe(true);
    expect(by['Coordinate List and Calculations']).toBe(true);
    expect(by['General Plan (1)']).toBe(true);
    expect(by['DSG Certificate (1/96)']).toBe(true);
    expect(by['Working Plan']).toBe(false);
  });

  it('ticks General Plan for the real plan-type-slug filenames (developed/undeveloped)', () => {
    // Plans are saved as `<planType>-<designation>.pdf`; the general-plans folder
    // receives general-developed / general-undeveloped / general-plan slugs, all
    // of which are General Plan products.
    const developed = [f('general-developed-STANDS_271-339_346-349_MAGLAS.pdf', 'output/general-plans')];
    const undeveloped = [f('general-undeveloped-LOT_5_BORROWDALE.pdf', 'output/general-plans')];
    const byDev = Object.fromEntries(resolveLodgementDocuments(developed).map(r => [r.label, r.present]));
    const byUndev = Object.fromEntries(resolveLodgementDocuments(undeveloped).map(r => [r.label, r.present]));
    expect(byDev['General Plan (1)']).toBe(true);
    expect(byUndev['General Plan (1)']).toBe(true);
  });

  it('does NOT tick a generated item when the keyword matches but the folder is wrong', () => {
    // A field-book-named file sitting in the calculations folder must not tick "Field book".
    const files = [f('MAG1_FieldBook.pdf', 'output/calculations')];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Field book']).toBe(false);
  });

  it('does NOT let a stray "196" in an unrelated folder tick the DSG certificate', () => {
    const files = [f('coords_196_points.pdf', 'output/coordinate-list')];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['DSG Certificate (1/96)']).toBe(false);
  });

  it('ticks Dispensation Certificate from a generated file in output/certificates', () => {
    const files = [f('DispensationDeveloped.pdf', 'output/certificates')];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Dispensation Certificate']).toBe(true);
  });

  it('does NOT tick Dispensation Certificate from a /dispensation/ file under input/ any more (now folder-gated)', () => {
    const files = [f('my-dispensation.pdf', 'input')];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Dispensation Certificate']).toBe(false);
  });
});

describe('resolveLodgementDocuments — external docs (input/ keyword)', () => {
  it('ticks an external item when a matching file is anywhere under input/', () => {
    const files = [
      f('beacon-receipt-scan.jpg', 'input'),
      f('title-search.pdf', 'input/searches'),
    ];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Beacon receipt']).toBe(true);
    expect(by['Searches']).toBe(true);
  });

  it('does NOT tick an external item when the keyword file is under output/ instead of input/', () => {
    const files = [f('permit-layout.pdf', 'output/general-plans')];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Permit/Instruction and layout']).toBe(false);
  });
});

describe('resolveLodgementDocuments — empty', () => {
  it('returns all-unticked, preserving order, for no files', () => {
    const result = resolveLodgementDocuments([]);
    expect(result.map(r => r.label)).toEqual(LODGEMENT_DOCUMENTS);
    expect(result.every(r => r.present === false)).toBe(true);
  });
});

describe('markRecordSectionsPresent', () => {
  it("forces the record's own sections present, leaves others unchanged", () => {
    const base = resolveLodgementDocuments([]); // all absent
    const marked = markRecordSectionsPresent(base);
    const by = Object.fromEntries(marked.map(r => [r.label, r.present]));
    expect(by['Field book']).toBe(true);
    expect(by['Coordinate List and Calculations']).toBe(true);
    expect(by['General Plan']).toBe(false);
    expect(by['Beacon receipt']).toBe(false);
  });
});

const confirmedComposition = (d: boolean, g: boolean): RecordComposition => ({
  includesDiagrams: d,
  includesGeneralPlans: g,
  source: 'confirmed',
});

describe('lodgementDocumentsFor', () => {
  it('drops General Plan from a diagrams-only record', () => {
    const labels = lodgementDocumentsFor(confirmedComposition(true, false));
    expect(labels).toContain('Diagram');
    expect(labels).not.toContain('General Plan');
    expect(labels).toContain('Working Plan');
  });

  it('drops Diagram from a general-plans-only record', () => {
    const labels = lodgementDocumentsFor(confirmedComposition(false, true));
    expect(labels).not.toContain('Diagram');
    expect(labels).toContain('General Plan');
  });

  it('keeps both for a both record', () => {
    const labels = lodgementDocumentsFor(confirmedComposition(true, true));
    expect(labels).toContain('Diagram');
    expect(labels).toContain('General Plan');
  });

  it('keeps both when nothing is confirmed, so an unconfigured project never regresses', () => {
    expect(lodgementDocumentsFor(null)).toEqual(LODGEMENT_DOCUMENTS);
    expect(lodgementDocumentsFor(undefined)).toEqual(LODGEMENT_DOCUMENTS);
  });

  it('never touches the nine non-plan items', () => {
    const labels = lodgementDocumentsFor(confirmedComposition(true, false));
    expect(labels).toEqual([
      'Field book',
      'Coordinate List and Calculations',
      'Diagram',
      'Working Plan',
      'Report on Survey',
      'Dispensation Certificate',
      'Checklist',
      'DSG Certificate (1/96)',
      'Permit/Instruction and layout',
      'Beacon receipt',
      'Searches',
    ]);
  });
});

describe('resolveLodgementDocuments — the Diagram rule', () => {
  it('ticks Diagram from a plan-type-slug filename in output/diagrams', () => {
    const files = [f('diagram-STAND_2283_MAGLAS.pdf', 'output/diagrams')];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Diagram (3)']).toBe(true);
  });

  it('does NOT tick Diagram for a diagram-named file in the wrong folder', () => {
    // The parent diagram number appears in general plan filenames; folder-gating
    // is what stops it ticking the Diagram row.
    const files = [f('general-plan-parent-diagram-4471.pdf', 'output/general-plans')];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Diagram']).toBe(false);
  });

  it('counts three lodged copies for each diagram file', () => {
    // Three copies of every diagram are lodged, so the enclosed count is the file
    // count times three -- not the file count.
    const files = [
      f('diagram-STAND_207.pdf', 'output/diagrams'),
      f('diagram-STAND_208.pdf', 'output/diagrams'),
      f('diagram-STAND_209.pdf', 'output/diagrams'),
    ];
    const labels = resolveLodgementDocuments(files).map(r => r.label);
    expect(labels).toContain('Diagrams (9)');
  });

  it('keeps the singular noun for one diagram file, still counting its three copies', () => {
    const files = [f('diagram-STAND_207.pdf', 'output/diagrams')];
    const labels = resolveLodgementDocuments(files).map(r => r.label);
    expect(labels).toContain('Diagram (3)');
  });

  it('counts general plans one copy per file, with no multiplier', () => {
    const files = [
      f('general-undeveloped-MAGLAS.pdf', 'output/general-plans'),
      f('general-developed-MAGLAS.pdf', 'output/general-plans'),
    ];
    const labels = resolveLodgementDocuments(files).map(r => r.label);
    expect(labels).toContain('General Plan (2)');
  });

  it('leaves an absent row uncounted and unadorned', () => {
    const labels = resolveLodgementDocuments([]).map(r => r.label);
    expect(labels).toContain('Diagram');
    expect(labels).toContain('General Plan');
  });

  it('never counts the nine non-plan rows', () => {
    const files = [f('MAG1_FieldBook.pdf', 'output/field-book')];
    const labels = resolveLodgementDocuments(files).map(r => r.label);
    expect(labels).toContain('Field book');
  });

  it('honours the composition when building the list', () => {
    const files = [f('diagram-STAND_207.pdf', 'output/diagrams')];
    const labels = resolveLodgementDocuments(files, confirmedComposition(false, true)).map(r => r.label);
    // Counted rows render as "Diagram (3)", so match on the prefix rather than exact text.
    expect(labels.some(l => l.startsWith('Diagram'))).toBe(false);
  });
});
