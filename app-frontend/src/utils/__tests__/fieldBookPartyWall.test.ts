/**
 * Party-wall servitudes in the Field Book and Calculations Part 1.
 *
 * The field book records the walls on their own page(s) immediately after the
 * last point page, still in the E-series -- the first row of the section is the
 * "Party-wall servitudes" heading. The Calculations document appends the same
 * table on its final page(s) plus a far-right F/B column naming the field-book
 * E-page of each row.
 *
 * Two-pass parity is the trap: measureFieldBook and renderFieldBook must count
 * party-wall pages identically or the page-count guard throws. These tests pin
 * that by driving the real TwoPassDocumentGenerator.generate() pipeline.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { computePartyWallPaginate, paginateFieldBook } from '../fieldBookPagination';
import { FieldBookGenerator } from '../field-book';
import { CalculationsPart1Generator } from '../calculations-part1';
import { TwoPassDocumentGenerator } from '../TwoPassDocumentGenerator';

const metadata = {
  surveyorName: 'O Saunyama',
  address: 'BOX A1262\nAVONDALE\nHARARE',
  surveyOf: 'STANDS 1-3 MT PLEASANT',
  surveyDate: '2026-01-01',
};

const partyWalls = [
  { stands: 'Stand 1', boundary: 'A-B' },
  { stands: 'Stand 2', boundary: 'B-C' },
  { stands: 'Stand 3', boundary: 'C-D' },
];

const points = [
  { id: 'P1', y: 1, x: 2, status: 'P', description: 'peg', surveyDate: '2026-01-01' },
  { id: 'P2', y: 3, x: 4, status: 'P', description: 'peg', surveyDate: '2026-01-01' },
];

const bufferStreams = (buf: ArrayBuffer): string[] =>
  Buffer.from(buf)
    .toString('latin1')
    .split('stream\n')
    .slice(1)
    .map(s => s.split('\nendstream')[0]);

const pageStreams = (pdf: any): string[] => bufferStreams(pdf.output('arraybuffer'));

const blobStreams = async (blob: Blob): Promise<string[]> => bufferStreams(await blob.arrayBuffer());

const twoPassPartyWallData = (overrides: any = {}) => ({
  surveyPoints: [
    { pointId: 'P1', y: 1, x: 2, status: 'P', description: 'peg', surveyDate: '2026-01-01' },
    { pointId: 'P2', y: 3, x: 4, status: 'P', description: 'peg', surveyDate: '2026-01-01' },
  ],
  adjustedCoordinates: [],
  surveyorInfo: {
    name: 'O Saunyama',
    licenseNumber: 'PLS 1',
    firm: '',
    address: 'BOX A1262',
    surveyDate: '2026-01-01',
    projectTitle: 'MT PLEASANT',
  },
  partyWalls,
  ...overrides,
});

describe('computePartyWallPaginate', () => {
  it('returns no pages when there are no rows', () => {
    expect(computePartyWallPaginate(0)).toEqual([]);
  });

  it('sits 28 rows on the first page (2 rows go to heading + header)', () => {
    expect(computePartyWallPaginate(28)).toEqual([Array.from({ length: 28 }, (_, i) => i)]);
  });

  it('spills the 29th row onto a second page', () => {
    expect(computePartyWallPaginate(29)).toEqual([
      Array.from({ length: 28 }, (_, i) => i),
      [28],
    ]);
  });

  it('fills 30 rows per continuation page', () => {
    const pages = computePartyWallPaginate(58);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(28);
    expect(pages[1]).toHaveLength(30);
  });
});

describe('paginateFieldBook with party walls', () => {
  const base = (overrides: any = {}) => ({
    points: points.map(p => ({ id: p.id })),
    opts: { hasCalibration: false, hasCover: false, partyWalls, ...overrides },
  });

  it('numbers the party-wall section on its own page right after the points', () => {
    const { points: pts, opts } = base();
    const pagination = paginateFieldBook(pts, opts);

    expect(pagination.pointPageMap.P1).toBe('E1');
    expect(pagination.pointPageMap.P2).toBe('E1');
    expect(pagination.partyWallBasePage).toBe(2);
    expect(pagination.partyWallPageMap).toEqual({ 0: 'E2', 1: 'E2', 2: 'E2' });
    expect(pagination.ePageCount).toBe(2);
  });

  it('shifts past a calibration page', () => {
    const { points: pts, opts } = base({ hasCalibration: true });
    const pagination = paginateFieldBook(pts, opts);

    expect(pagination.pointPageMap.P1).toBe('E2');
    expect(pagination.partyWallBasePage).toBe(3);
    expect(pagination.partyWallPageMap).toEqual({ 0: 'E3', 1: 'E3', 2: 'E3' });
  });

  it('stays empty when no rows are given', () => {
    const { points: pts, opts } = base({ partyWalls: [] });
    const pagination = paginateFieldBook(pts, opts);

    expect(pagination.partyWallPageMap).toEqual({});
    expect(pagination.partyWallBasePage).toBe(0);
  });
});

describe('the field book party-wall section', () => {
  it('renders the heading and rows on a new E-page after the points', async () => {
    const { pdf, pointPageMap, partyWallPageMap, pageCount } =
      await new FieldBookGenerator().generateFieldBookPDF(points, metadata, undefined, partyWalls);

    expect(pointPageMap.P1).toBe('E1');
    expect(partyWallPageMap).toEqual({ 0: 'E2', 1: 'E2', 2: 'E2' });
    expect(pageCount).toBe(3); // cover + points E1 + party walls E2
    expect(pdf.getNumberOfPages()).toBe(3);

    const streams = pageStreams(pdf);
    const wallPages = streams.filter(s => s.includes('(BOUNDARY)'));
    expect(wallPages).toHaveLength(1);
    const partyWallPage = wallPages[0];
    expect(partyWallPage).toContain('(E2)');
    expect(partyWallPage).toContain('(Party-wall servitudes)');
    expect(partyWallPage).toContain('(STANDS)');
    expect(partyWallPage).toContain('(BOUNDARY)');
    expect(partyWallPage).toContain('(Stand 1)');
    expect(partyWallPage).toContain('(B-C)');
  });

  it('skips the section entirely when no walls are given', async () => {
    const { pdf, pageCount, partyWallPageMap } =
      await new FieldBookGenerator().generateFieldBookPDF(points, metadata);

    expect(pageCount).toBe(2);
    expect(partyWallPageMap).toEqual({});
    const streams = pageStreams(pdf);
    expect(streams.some(s => s.includes('Party-wall servitudes'))).toBe(false);
  });

  it('paginates a long list across continuation pages without repeating the heading', async () => {
    const manyWalls = Array.from({ length: 30 }, (_, i) => ({
      stands: `Stand ${i + 1}`,
      boundary: `B${i}-B${i + 1}`,
    }));
    const { pdf, partyWallPageMap, pageCount } =
      await new FieldBookGenerator().generateFieldBookPDF(points, metadata, undefined, manyWalls);

    expect(pageCount).toBe(4); // cover, E1 points, E2-E3 party walls
    expect(partyWallPageMap[0]).toBe('E2');
    expect(partyWallPageMap[27]).toBe('E2');
    expect(partyWallPageMap[28]).toBe('E3');
    expect(partyWallPageMap[29]).toBe('E3');

    const streams = pageStreams(pdf);
    const wallPages = streams.filter(s => s.includes('(BOUNDARY)'));
    expect(wallPages).toHaveLength(2);
    expect(wallPages[0]).toContain('(Party-wall servitudes)');
    // The continuation page repeats the column header but not the heading.
    expect(wallPages[1]).not.toContain('(Party-wall servitudes)');
    expect(wallPages[1]).toContain('(STANDS)');
    expect(wallPages[1]).toContain('(Stand 30)');
  });
});

describe('the calculations party-wall table', () => {
  beforeEach(() => {
    // The combined points table reads useSurveyLookupStore().
    setActivePinia(createPinia());
  });

  const surveyPoints = twoPassPartyWallData().surveyPoints as any[];

  it('appends the same table with a far-right F/B column citing the field-book page', async () => {
    const result = await new CalculationsPart1Generator().generateCalculationsPart1PDF(
      surveyPoints,
      { name: 'O Saunyama', licenseNumber: 'PLS 1', firm: '', address: '', surveyDate: '2026-01-01', projectTitle: 'MT PLEASANT' },
      116,
      false,
      partyWalls,
      { 0: 'E2', 1: 'E2', 2: 'E2' },
    ) as any;

    const streams = await blobStreams(result.pdf);
    const wallPage = streams.find(s => s.includes('Party-wall servitudes'));
    expect(wallPage).toBeDefined();
    expect(wallPage).toContain('(F/B)');
    expect(wallPage).toContain('(Stand 2)');
    expect(wallPage).toContain('(E2)');
  });
});

describe('party walls through the two-pass generator', () => {
  beforeEach(() => {
    // CoordinateListGenerator reads useSurveyLookupStore(); mirror main.ts.
    setActivePinia(createPinia());
  });

  it('keeps measure/render parity while adding the field book and calculations pages', async () => {
    // A mismatch between Pass 1 and Pass 2 throws inside generate(), so
    // reaching here with every section returned proves the party-wall pages
    // were counted identically by both passes.
    const result = await new TwoPassDocumentGenerator().generate(
      twoPassPartyWallData() as any,
    );

    const fbStreams = await blobStreams(result.sections.fieldBook);
    expect(fbStreams.some(s => s.includes('Party-wall servitudes'))).toBe(true);

    const calcStreams = await blobStreams(result.sections.calculations);
    const wallPage = calcStreams.find(s => s.includes('Party-wall servitudes'));
    expect(wallPage).toBeDefined();
    expect(wallPage).toContain('(F/B)');
    // The F/B column cites the field book's E-page for each wall.
    expect(wallPage).toContain('(E2)');
  });

  it('adds no party-wall pages when the record has no walls', async () => {
    const result = await new TwoPassDocumentGenerator().generate(
      twoPassPartyWallData({ partyWalls: [] }) as any,
    );

    const fbStreams = await blobStreams(result.sections.fieldBook);
    expect(fbStreams.some(s => s.includes('Party-wall servitudes'))).toBe(false);

    const calcStreams = await blobStreams(result.sections.calculations);
    expect(calcStreams.some(s => s.includes('Party-wall servitudes'))).toBe(false);
  });
});