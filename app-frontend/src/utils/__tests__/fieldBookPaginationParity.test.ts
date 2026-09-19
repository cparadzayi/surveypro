/**
 * createFieldBookLookup paginated at 20 points per page while every other
 * derivation used 27, so it mis-cited every point past the 20th. It is reachable
 * only from the deprecated generateComprehensiveDocument, which is why nobody
 * noticed. This pins it to the shared module.
 */

import { describe, it, expect } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import * as XLSX from 'xlsx';
import { PageAllocationService } from '../../services/pageAllocation';
import { paginateFieldBook } from '../fieldBookPagination';
import { FieldBookGenerator } from '../field-book';
import { CalculationsPart1Generator } from '../calculations-part1';
import { buildWorkflowExcel } from '../workflowExcelExporter';
import type { CadastralWorkflowState, CadastralPoint } from '../../types/cadastral';

describe('pageAllocation field book lookup', () => {
  it('agrees with the shared module past the 20th point', () => {
    const observations = Array.from({ length: 30 }, (_, i) => ({ pointId: `P${i + 1}` }));

    const lookup = new PageAllocationService().createFieldBookLookup(observations);
    const expected = paginateFieldBook(
      observations.map(o => ({ id: o.pointId })),
      { hasCalibration: false, hasCover: false },
    ).pointPageMap;

    expect(lookup.P21).toBe('E1'); // was "E2" under the 20-per-page bug
    expect(lookup).toEqual(expected);
  });
});

const surveyorInfo = {
  name: 'C. Paradzayi', licenseNumber: 'PLS 1', firm: '', address: '',
  surveyDate: '2026-01-01', projectTitle: 'Test',
};

describe('every consumer agrees on a point E-number', () => {
  beforeEach(() => setActivePinia(createPinia()));

  // 30 points crosses the 27-per-page boundary, so a consumer using a different
  // page size disagrees here even though it would match on a short survey.
  const ids = Array.from({ length: 30 }, (_, i) => `P${i + 1}`);

  it('renderer, Calculations and page allocation produce the same map', async () => {
    const fieldBookPoints = ids.map((id, i) => ({
      id, y: i, x: i, status: 'P', description: 'iron peg', surveyDate: '2026-01-01',
    }));
    const surveyPoints = ids.map((id, i) => ({
      pointId: id, y: i, x: i, status: 'P', description: 'iron peg', surveyDate: '2026-01-01',
    }));

    const rendered = await new FieldBookGenerator().generateFieldBookPDF(
      fieldBookPoints, { surveyorName: 'C. Paradzayi' },
    );

    const calcs: any = await new CalculationsPart1Generator()
      .generateCalculationsPart1PDF(surveyPoints, surveyorInfo);
    const fromCalcs = Object.fromEntries(
      calcs.adjustedCoordinates.map((c: any) => [c.pointId, c.fieldBookPage]),
    );

    const fromAllocation = new PageAllocationService()
      .createFieldBookLookup(surveyPoints.map(p => ({ pointId: p.pointId })));

    expect(fromCalcs).toEqual(rendered.pointPageMap);
    expect(fromAllocation).toEqual(rendered.pointPageMap);
  });

  it('the renderer and page allocation agree on how many pages that is', async () => {
    const fieldBookPoints = ids.map((id, i) => ({
      id, y: i, x: i, status: 'P', description: 'iron peg', surveyDate: '2026-01-01',
    }));

    const rendered = await new FieldBookGenerator().generateFieldBookPDF(
      fieldBookPoints, { surveyorName: 'C. Paradzayi' },
    );
    const allocation = new PageAllocationService().calculateAllPageNumbers({
      observations: ids.map(id => ({ pointId: id })),
      points: [],
      duplicateAnalyses: [],
      parcels: [],
    } as any);

    // Both are PHYSICAL counts: the cover is a page that carries no E-number.
    expect(allocation.fieldBook.pageCount).toBe(rendered.pageCount);

    // Derived from the shared module (not a literal `/ 27`) -- a hardcoded page
    // size here would be blind to any page size that still rounds a 30-point
    // fixture up to 2 pages (e.g. 16 through 30), including the exact 26-per-page
    // probe this file's own guard is meant to survive.
    const { ePageCount } = paginateFieldBook(
      ids.map(id => ({ id })),
      { hasCalibration: false, hasCover: false },
    );
    expect(allocation.fieldBook.displayEnd).toBe(`E${ePageCount}`);
  });
});

// workflowExcelExporter.ts's buildWorkflowExcel() is a sixth, later-discovered
// consumer (Task 5b): when a workflow has no documents.fieldBook yet, its
// Field Book sheet paginates importedPoints itself by calling
// paginateFieldBook directly. That call site can still drift in argument
// wiring (e.g. the wrong hasCalibration/hasCover), so it is worth pinning
// even though it delegates rather than reimplementing. The sheet is read
// back through the same `xlsx` library the exporter itself writes it with --
// not a production change, and not a contortion.
describe('the workflow Excel export agrees with the shared module', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const points = (n: number): CadastralPoint[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `P${i + 1}`,
      original: { y: 100 + i, x: 200 + i },
      fieldBook: { y: (100 + i).toFixed(3), x: (200 + i).toFixed(3) },
      coordinateList: { y: (100 + i).toFixed(2), x: (200 + i).toFixed(2) },
      status: 'P',
      description: 'Peg',
      surveyDate: new Date('2026-01-01'),
      includeInFieldBook: true,
      includeInCoordinateList: true,
    })) as any;

  it('the Field Book sheet agrees with the shared module past the 27-per-page boundary', async () => {
    const testPoints = points(30);
    const workflowState = {
      surveyorInfo: {
        landSurveyor: 'C. Paradzayi', licenseNumber: 'PLS 1', firm: '', address: '',
        surveyDate: '2026-01-01', surveyOf: '', instruments: '',
      },
      projectInfo: { name: 'Test', district: 'X' },
      importedPoints: testPoints,
      documents: {}, // no fieldBook document yet -> exporter paginates itself
    } as unknown as CadastralWorkflowState;

    const blob = buildWorkflowExcel(workflowState);
    const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Field Book'], { header: 1 });

    // Row 0-4: title/meta, row 5: header, row 6+: data.
    const fromSheet: Record<string, string> = {};
    for (let i = 6; i < rows.length; i++) {
      const [page, id] = rows[i];
      if (id) fromSheet[id] = page;
    }

    const expected = paginateFieldBook(
      testPoints.map(p => ({ id: p.id })),
      { hasCalibration: false, hasCover: false },
    ).pointPageMap;

    // A cross-consumer equality check only -- deliberately not a hardcoded
    // P27/P28 assertion, so this stays a drift guard rather than its own pin
    // on the page size (fieldBookPagination.test.ts already owns that pin).
    expect(fromSheet).toEqual(expected);
  });
});
