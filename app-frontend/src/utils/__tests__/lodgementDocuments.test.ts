import { describe, it, expect } from 'vitest';
import { LODGEMENT_DOCUMENTS, lodgementDocumentsFor, resolveLodgementDocuments, markRecordSectionsPresent, verifyAgainstManifest, buildLodgementWarnings, planRowDetail, countUnknownSheetPlans, type ManifestFile } from '../lodgementDocuments';
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
    const row = resolveLodgementDocuments(files).find(r => r.label === 'Diagram')!;
    expect(row.present).toBe(true);
    expect(row.displayLabel).toBe('Diagram');
    expect(row.detail).toEqual(['1 diagram, 3 copies', 'PDF 1']);
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
    const row = resolveLodgementDocuments(files).find(r => r.label === 'Diagram')!;
    expect(row.displayLabel).toBe('Diagrams');
    expect(row.detail).toEqual(['3 diagrams, 9 copies', 'PDF 3']);
  });

  it('keeps the singular noun for one diagram file, still counting its three copies', () => {
    const files = [f('diagram-STAND_207.pdf', 'output/diagrams')];
    const row = resolveLodgementDocuments(files).find(r => r.label === 'Diagram')!;
    expect(row.displayLabel).toBe('Diagram');
    expect(row.detail).toEqual(['1 diagram, 3 copies', 'PDF 1']);
  });

  it('counts general plans one copy per file, with no multiplier', () => {
    const files = [
      f('general-undeveloped-MAGLAS.pdf', 'output/general-plans'),
      f('general-developed-MAGLAS.pdf', 'output/general-plans'),
    ];
    const row = resolveLodgementDocuments(files).find(r => r.label === 'General Plan')!;
    expect(row.displayLabel).toBe('General Plans');
    expect(row.detail).toEqual(['2 general plans', 'PDF 2']);
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
    // Counted rows can render as the pluralised "Diagrams", so match on the prefix
    // rather than exact text.
    expect(labels.some(l => l.startsWith('Diagram'))).toBe(false);
  });
});

describe('resolveLodgementDocuments — only the lodgeable PDF sheet counts', () => {
  // One plan generation writes up to three files into the same folder:
  // `<base>.pdf`, `<base>.dxf` and `<base>-summary.pdf` (SurveyPlanMapView.vue).
  // Counting all three would have inflated the detail line to "3 general plans".
  it('counts one general plan once, despite its DXF twin and statistics summary', () => {
    const files = [
      f('general-undeveloped-MAGLAS.pdf', 'output/general-plans'),
      f('general-undeveloped-MAGLAS.dxf', 'output/general-plans'),
      f('general-undeveloped-MAGLAS-summary.pdf', 'output/general-plans'),
    ];
    const row = resolveLodgementDocuments(files).find(r => r.label === 'General Plan')!;
    expect(row.displayLabel).toBe('General Plan');
    expect(row.detail).toEqual(['1 general plan', 'PDF 1 · DXF 1']);
  });

  it('counts one diagram as three lodged copies, not six, when a DXF sits beside it', () => {
    const files = [
      f('diagram-STAND_2283_MAGLAS.pdf', 'output/diagrams'),
      f('diagram-STAND_2283_MAGLAS.dxf', 'output/diagrams'),
    ];
    const row = resolveLodgementDocuments(files).find(r => r.label === 'Diagram')!;
    expect(row.displayLabel).toBe('Diagram');
    expect(row.detail).toEqual(['1 diagram, 3 copies', 'PDF 1 · DXF 1']);
  });

  it('does NOT tick a plan row for a folder holding only a DXF', () => {
    const files = [f('general-undeveloped-MAGLAS.dxf', 'output/general-plans')];
    const row = resolveLodgementDocuments(files).find(r => r.label === 'General Plan');
    expect(row!.present).toBe(false);
    expect(row!.displayLabel).toBe('General Plan');
  });

  it('does NOT tick a plan row for a folder holding only a statistics summary', () => {
    const files = [f('diagram-STAND_207-summary.pdf', 'output/diagrams')];
    const row = resolveLodgementDocuments(files).find(r => r.label === 'Diagram');
    expect(row!.present).toBe(false);
  });

  it('still ticks an uncounted external row from a non-PDF scan', () => {
    // The filter must NOT reach the external rows: beacon receipts are photographed.
    const files = [f('beacon-receipt-scan.jpg', 'input')];
    const by = Object.fromEntries(resolveLodgementDocuments(files).map(r => [r.label, r.present]));
    expect(by['Beacon receipt']).toBe(true);
  });
});

describe('verifyAgainstManifest', () => {
  it('reports a declared family whose folder is empty', () => {
    const files = [f('general-undeveloped-MAGLAS.pdf', 'output/general-plans')];
    const v = verifyAgainstManifest(confirmedComposition(true, true), files);
    expect(v.expectedMissing).toEqual(['diagram']);
    expect(v.unexpectedPresent).toEqual([]);
  });

  it('reports files present for a family the record does not declare', () => {
    // The stale-trial case: a diagram left over from an abandoned attempt.
    const files = [
      f('general-undeveloped-MAGLAS.pdf', 'output/general-plans'),
      f('diagram-STAND_207.pdf', 'output/diagrams'),
    ];
    const v = verifyAgainstManifest(confirmedComposition(false, true), files);
    expect(v.expectedMissing).toEqual([]);
    expect(v.unexpectedPresent).toHaveLength(1);
    expect(v.unexpectedPresent[0].family).toBe('diagram');
    expect(v.unexpectedPresent[0].files.map(x => x.name)).toEqual(['diagram-STAND_207.pdf']);
  });

  it('reports nothing when the folders match the composition', () => {
    const files = [
      f('general-undeveloped-MAGLAS.pdf', 'output/general-plans'),
      f('diagram-STAND_207.pdf', 'output/diagrams'),
    ];
    const v = verifyAgainstManifest(confirmedComposition(true, true), files);
    expect(v.expectedMissing).toEqual([]);
    expect(v.unexpectedPresent).toEqual([]);
  });

  it('reports both directions at once', () => {
    const files = [f('diagram-STAND_207.pdf', 'output/diagrams')];
    const v = verifyAgainstManifest(confirmedComposition(false, true), files);
    expect(v.expectedMissing).toEqual(['general']);
    expect(v.unexpectedPresent.map(u => u.family)).toEqual(['diagram']);
  });

  it('stays silent when nothing is confirmed', () => {
    const files = [f('diagram-STAND_207.pdf', 'output/diagrams')];
    expect(verifyAgainstManifest(null, files)).toEqual({ expectedMissing: [], unexpectedPresent: [] });
  });

  it('tolerates an empty manifest without throwing', () => {
    const v = verifyAgainstManifest(confirmedComposition(true, false), []);
    expect(v.expectedMissing).toEqual(['diagram']);
  });

  it('reports a declared family whose folder holds only a DXF as missing', () => {
    // A lone .dxf is not a lodgeable plan sheet, so "you declared Diagrams but none
    // exist" must still fire -- otherwise an abandoned half-generation looks complete.
    const files = [
      f('general-undeveloped-MAGLAS.pdf', 'output/general-plans'),
      f('diagram-STAND_207.dxf', 'output/diagrams'),
    ];
    const v = verifyAgainstManifest(confirmedComposition(true, true), files);
    expect(v.expectedMissing).toEqual(['diagram']);
  });

  it('still surfaces a leftover DXF for a family the record does not declare', () => {
    // The unexpectedPresent direction deliberately matches ALL files: a stray DXF in
    // an undeclared family is evidence of an abandoned attempt, worth showing.
    const files = [
      f('general-undeveloped-MAGLAS.pdf', 'output/general-plans'),
      f('diagram-STAND_207.dxf', 'output/diagrams'),
    ];
    const v = verifyAgainstManifest(confirmedComposition(false, true), files);
    expect(v.unexpectedPresent).toHaveLength(1);
    expect(v.unexpectedPresent[0].files.map(x => x.name)).toEqual(['diagram-STAND_207.dxf']);
  });
});

describe('buildLodgementWarnings', () => {
  const noVerification = { expectedMissing: [], unexpectedPresent: [] };

  it('returns no warnings when nothing is missing or unexpected', () => {
    expect(buildLodgementWarnings([], noVerification)).toEqual([]);
  });

  it('lists missing documents as one bulleted warning', () => {
    const [warning] = buildLodgementWarnings(['Working Plan', 'Searches'], noVerification);
    expect(warning).toContain('2 document(s) not found');
    expect(warning).toContain('• Working Plan');
    expect(warning).toContain('• Searches');
  });

  it('names a declared family whose folder is empty', () => {
    const w = buildLodgementWarnings([], { expectedMissing: ['diagram'], unexpectedPresent: [] });
    expect(w[0]).toBe('This record is configured to enclose Diagrams, but none have been generated.');
  });

  it('lists unexpected files with their dates so a stale one is visible', () => {
    const when = new Date(2026, 7, 20).getTime(); // local midnight, 20 Aug 2026 (month is 0-indexed)
    const w = buildLodgementWarnings([], {
      expectedMissing: [],
      unexpectedPresent: [
        { family: 'diagram', files: [{ name: 'diagram-OLD.pdf', relDir: 'output/diagrams', mtimeMs: when }] },
      ],
    });
    expect(w[0]).toContain('1 diagram file(s)');
    expect(w[0]).toContain('diagram-OLD.pdf');
    expect(w[0]).toContain('20/08/2026');
  });

  it('says the date is unknown when the manifest carries no mtime', () => {
    const w = buildLodgementWarnings([], {
      expectedMissing: [],
      unexpectedPresent: [
        { family: 'general', files: [{ name: 'gp.pdf', relDir: 'output/general-plans' }] },
      ],
    });
    expect(w[0]).toContain('date unknown');
  });

  it('treats the backend zero-mtime sentinel as an unknown date', () => {
    const w = buildLodgementWarnings([], {
      expectedMissing: [],
      unexpectedPresent: [
        { family: 'diagram', files: [{ name: 'unreadable.pdf', relDir: 'output/diagrams', mtimeMs: 0 }] },
      ],
    });
    expect(w[0]).toContain('date unknown');
  });
});

const gp = (name: string, pageCount?: number): ManifestFile =>
  pageCount === undefined
    ? { name, relDir: 'output/general-plans' }
    : { name, relDir: 'output/general-plans', pageCount };

const dg = (name: string): ManifestFile => ({ name, relDir: 'output/diagrams' });

describe('planRowDetail', () => {
  it('states diagrams and their copies, never their sheets', () => {
    expect(planRowDetail('diagram', { plans: 3, sheets: 3, copies: 9, dxf: 3 })).toEqual([
      '3 diagrams, 9 copies',
      'PDF 3 · DXF 3',
    ]);
  });

  it('states general plans and their sheet total', () => {
    expect(planRowDetail('general', { plans: 2, sheets: 4, copies: 2, dxf: 2 })).toEqual([
      '2 general plans, 4 sheets',
      'PDF 2 · DXF 2',
    ]);
  });

  it('drops the sheets clause entirely when the count is unknown', () => {
    expect(planRowDetail('general', { plans: 2, sheets: null, copies: 2, dxf: 2 })).toEqual([
      '2 general plans',
      'PDF 2 · DXF 2',
    ]);
  });

  it('uses singular nouns for one of each', () => {
    expect(planRowDetail('general', { plans: 1, sheets: 1, copies: 1, dxf: 1 })).toEqual([
      '1 general plan, 1 sheet',
      'PDF 1 · DXF 1',
    ]);
    expect(planRowDetail('diagram', { plans: 1, sheets: 1, copies: 3, dxf: 0 })).toEqual([
      '1 diagram, 3 copies',
      'PDF 1',
    ]);
  });

  it('omits the DXF term when there is no DXF', () => {
    expect(planRowDetail('general', { plans: 1, sheets: 2, copies: 1, dxf: 0 })[1]).toBe('PDF 1');
  });

  it('returns no detail lines at all when nothing is enclosed', () => {
    expect(planRowDetail('general', { plans: 0, sheets: 0, copies: 0, dxf: 1 })).toEqual([]);
  });
});

describe('resolveLodgementDocuments — detail lines', () => {
  it('attaches detail to both plan rows and to no other row', () => {
    const files = [
      gp('general-undeveloped-MAGLAS.pdf', 3),
      gp('general-undeveloped-MAGLAS.dxf'),
      dg('diagram-STAND_207.pdf'),
      f('MAG1_FieldBook.pdf', 'output/field-book'),
    ];
    const rows = resolveLodgementDocuments(files);
    const byLabel = Object.fromEntries(rows.map(r => [r.label, r]));
    expect(byLabel['General Plan'].detail).toEqual(['1 general plan, 3 sheets', 'PDF 1 · DXF 1']);
    expect(byLabel['Diagram'].detail).toEqual(['1 diagram, 3 copies', 'PDF 1']);
    expect(byLabel['Field book'].detail).toBeUndefined();
  });

  it('leaves an unticked plan row without detail lines', () => {
    const rows = resolveLodgementDocuments([gp('general-undeveloped-MAGLAS.dxf')]);
    const row = rows.find(r => r.label === 'General Plan')!;
    expect(row.present).toBe(false);
    expect(row.detail ?? []).toEqual([]);
  });

  it('keeps the plural display label without a count in it', () => {
    // The count moved to the detail lines; the label is now just the noun.
    const rows = resolveLodgementDocuments([dg('diagram-A.pdf'), dg('diagram-B.pdf')]);
    expect(rows.find(r => r.label === 'Diagram')!.displayLabel).toBe('Diagrams');
  });
});

describe('countUnknownSheetPlans', () => {
  it('counts general plans whose sheet count could not be read', () => {
    const files = [gp('general-a.pdf', 3), gp('general-b.pdf'), gp('general-c.pdf')];
    expect(countUnknownSheetPlans(files)).toBe(2);
  });

  it('ignores DXFs, summaries, and diagrams', () => {
    const files = [gp('general-a.dxf'), gp('general-a-summary.pdf'), dg('diagram-STAND_207.pdf')];
    expect(countUnknownSheetPlans(files)).toBe(0);
  });

  it('is zero when every general plan reports its pages', () => {
    expect(countUnknownSheetPlans([gp('general-a.pdf', 2)])).toBe(0);
  });
});

describe('buildLodgementWarnings — unknown sheet counts', () => {
  const noVerification = { expectedMissing: [], unexpectedPresent: [] };

  it('explains an omitted sheet total', () => {
    const w = buildLodgementWarnings([], noVerification, 1);
    expect(w.some(line => /sheet count could not be determined for 1 general plan/i.test(line))).toBe(true);
    expect(w.some(line => /omits the sheet total/i.test(line))).toBe(true);
  });

  it('pluralises the count', () => {
    const w = buildLodgementWarnings([], noVerification, 2);
    expect(w.some(line => /2 general plans/i.test(line))).toBe(true);
  });

  it('says nothing when every sheet count is known', () => {
    expect(buildLodgementWarnings([], noVerification, 0)).toEqual([]);
  });

  it('says nothing when the argument is omitted entirely', () => {
    expect(buildLodgementWarnings([], noVerification)).toEqual([]);
  });
});
