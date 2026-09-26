// @vitest-environment happy-dom
//
// jsPDF and the site-calibration parser both need a DOM to construct.
/**
 * Every consumer of a field-book E-number must agree on it.
 *
 * This began as a single assertion after `createFieldBookLookup` paginated at 20
 * points per page while every other derivation used 27, mis-citing every point
 * past the 20th. It was reachable only from the deprecated
 * generateComprehensiveDocument, which is why nobody noticed — and that method,
 * along with the service behind it, has since been deleted. The guard is worth
 * keeping for the consumers that remain: the renderer, Calculations Part 1, the
 * workflow Excel export, and now the calibrated case, which every one of these
 * comparisons used to pin as `hasCalibration: false` and so were blind to.
 */

import { describe, it, expect } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import * as XLSX from 'xlsx';
// @ts-expect-error — ?raw has no ambient type declaration in this project
import sampleXml from './fixtures/siteCalibrationReport.xml?raw';
import { paginateFieldBook } from '../fieldBookPagination';
import { FieldBookGenerator } from '../field-book';
import { CalculationsPart1Generator } from '../calculations-part1';
import { parseSiteCalibration } from '../siteCalibration';
import { useSurveyLookupStore } from '../../stores/surveyLookup';
import { buildWorkflowExcel } from '../workflowExcelExporter';
import type { CadastralWorkflowState, CadastralPoint } from '../../types/cadastral';

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

    expect(fromCalcs).toEqual(rendered.pointPageMap);
  });

  it('the rendered page count is the cover plus the numbered pages', async () => {
    const fieldBookPoints = ids.map((id, i) => ({
      id, y: i, x: i, status: 'P', description: 'iron peg', surveyDate: '2026-01-01',
    }));

    const rendered = await new FieldBookGenerator().generateFieldBookPDF(
      fieldBookPoints, { surveyorName: 'C. Paradzayi' },
    );

    // Derived from the shared module (not a literal `/ 27`) -- a hardcoded page
    // size here would be blind to any page size that still rounds a 30-point
    // fixture up to 2 pages (e.g. 16 through 30), including the exact 26-per-page
    // probe this file's own guard is meant to survive.
    const { ePageCount } = paginateFieldBook(
      ids.map(id => ({ id })),
      { hasCalibration: false, hasCover: true },
    );

    // The cover is a physical page that carries no E-number, so it counts
    // towards pageCount but not towards ePageCount.
    expect(rendered.pageCount).toBe(ePageCount + 1);
  });
});

/**
 * The parity guard above pinned `hasCalibration: false` in every comparison, so
 * it was structurally blind to a calibrated survey — the one case where the
 * consumers genuinely disagree.
 *
 * A calibration report occupies E1 of the field book and pushes every
 * observation to E2 onwards. Calculations used to re-derive the page numbers
 * with the offset hardcoded to false, so on a calibrated survey its F/B column
 * cited E1 for points the printed book recorded on E2: a cross-reference to a
 * page that holds the calibration, not the observation.
 */
describe('every consumer agrees on a point E-number when a calibration is present', () => {
  beforeEach(() => setActivePinia(createPinia()));

  // 30 points crosses the 27-per-page boundary, so this covers the shift on both
  // the first and the second point page (E2 and E3).
  const ids = Array.from({ length: 30 }, (_, i) => `P${i + 1}`);

  const fieldBookPoints = ids.map((id, i) => ({
    id, y: i, x: i, status: 'P', description: 'iron peg', surveyDate: '2026-01-01',
  }));
  const surveyPoints = ids.map((id, i) => ({
    pointId: id, y: i, x: i, status: 'P', description: 'iron peg', surveyDate: '2026-01-01',
  }));

  it('puts the first observation on E2, not E1', async () => {
    const rendered = await new FieldBookGenerator().generateFieldBookPDF(
      fieldBookPoints, { surveyorName: 'C. Paradzayi' }, parseSiteCalibration(sampleXml),
    );

    // E1 is the calibration report; the observations begin on E2.
    expect(rendered.pointPageMap['P1']).toBe('E2');
    expect(rendered.pointPageMap['P27']).toBe('E2');
    expect(rendered.pointPageMap['P28']).toBe('E3');
  });

  it('makes Calculations cite the same pages the rendered book prints', async () => {
    const rendered = await new FieldBookGenerator().generateFieldBookPDF(
      fieldBookPoints, { surveyorName: 'C. Paradzayi' }, parseSiteCalibration(sampleXml),
    );

    // The map the two-pass generator hands to Calculations: the field book's own.
    const calcs: any = await new CalculationsPart1Generator()
      .generateCalculationsPart1PDF(
        surveyPoints, surveyorInfo, 116, false, [], {},
        rendered.pointPageMap,
      );
    const fromCalcs = Object.fromEntries(
      calcs.adjustedCoordinates.map((c: any) => [c.pointId, c.fieldBookPage]),
    );

    expect(fromCalcs).toEqual(rendered.pointPageMap);
    // The regression itself: this was E1 before the field book's map was threaded
    // through, citing the calibration page for the first observed point.
    expect(fromCalcs['P1']).toBe('E2');
  });

  it('leaves the Pinia lookup on the rendered pages, not the estimate', async () => {
    const rendered = await new FieldBookGenerator().generateFieldBookPDF(
      fieldBookPoints, { surveyorName: 'C. Paradzayi' }, parseSiteCalibration(sampleXml),
    );

    await new CalculationsPart1Generator().generateCalculationsPart1PDF(
      surveyPoints, surveyorInfo, 116, false, [], {},
      rendered.pointPageMap,
    );

    // The store is documented as the canonical reference, and the Excel export
    // and workflow state read it. It must not be left holding the uncalibrated
    // estimate the fallback branch produces.
    expect(useSurveyLookupStore().fieldBookPageLookup).toEqual(rendered.pointPageMap);
  });

  it('offsets the Excel Field Book sheet by the calibration page too', async () => {
    const testPoints = Array.from({ length: 30 }, (_, i) => ({
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

    const workflowState = {
      surveyorInfo: {
        landSurveyor: 'C. Paradzayi', licenseNumber: 'PLS 1', firm: '', address: '',
        surveyDate: '2026-01-01', surveyOf: '', instruments: '',
      },
      projectInfo: { name: 'Test', district: 'X' },
      importedPoints: testPoints,
      documents: { siteCalibration: parseSiteCalibration(sampleXml) },
    } as unknown as CadastralWorkflowState;

    const blob = buildWorkflowExcel(workflowState);
    const wb = XLSX.read(await blob.arrayBuffer(), { type: 'array' });
    const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets['Field Book'], { header: 1 });

    const fromSheet: Record<string, string> = {};
    for (let i = 6; i < rows.length; i++) {
      const [page, id] = rows[i];
      if (id) fromSheet[id] = page;
    }

    const expected = paginateFieldBook(
      testPoints.map(p => ({ id: p.id })),
      { hasCalibration: true, hasCover: false },
    ).pointPageMap;

    expect(fromSheet).toEqual(expected);
    expect(fromSheet['P1']).toBe('E2');
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
