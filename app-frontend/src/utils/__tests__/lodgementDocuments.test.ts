import { describe, it, expect } from 'vitest';
import { LODGEMENT_DOCUMENTS, resolveLodgementDocuments, markRecordSectionsPresent, type ManifestFile } from '../lodgementDocuments';

describe('LODGEMENT_DOCUMENTS', () => {
  it('lists the 11 canonical items in order', () => {
    expect(LODGEMENT_DOCUMENTS).toEqual([
      'Field book',
      'Coordinate List and Calculations',
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
    expect(by['General Plan']).toBe(true);
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
    expect(byDev['General Plan']).toBe(true);
    expect(byUndev['General Plan']).toBe(true);
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
