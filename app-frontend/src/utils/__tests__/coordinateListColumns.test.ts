/**
 * Column geometry of the CO-ORDINATE LIST.
 *
 * The beacons column was 35mm wide for names like "87DNew" that need about 11.
 * It was sized for the word CONSTANTS sharing it, not for its own contents, and
 * the 19mm of slack came straight out of the description column next door —
 * which then had to truncate "12mm iron peg in concrete" mid-word.
 *
 * CONSTANTS now right-justifies to the beacons column's right edge and reaches
 * left across the Calcs cell, which is empty on that row. The width that frees
 * goes to the description.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import jsPDF from 'jspdf';
import { CoordinateListGenerator } from '../coordinate-list';
import type { AdjustedCoordinate } from '../../types/adjusted-coordinates';
import type { SurveyorInfo } from '../coordinate-list';

const MM = 72 / 25.4;
const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 15;

const surveyorInfo = {
  name: 'F. Chitsike', licenseNumber: '1001', firm: '', address: '',
  surveyDate: '2026-07-30', projectTitle: 'STANDS 403-405', district: 'Gwelo',
} as SurveyorInfo;

const coord = (over: Partial<AdjustedCoordinate>): AdjustedCoordinate => ({
  pointId: '87DNew',
  y: -85729.941,
  x: 2144164.762,
  status: 'F',
  description: '12mm iron peg in concrete',
  surveyDate: '2026-07-30',
  fieldBookPage: 'E2',
  calculationsPage: 101,
  ...over,
});

/** Every text placement on the page carrying the table. */
const tableCells = async (coords: AdjustedCoordinate[]) => {
  const { pdf } = await new CoordinateListGenerator()
    .generateCoordinateListPDF(coords, surveyorInfo);
  const raw = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
  const page = raw
    .split('stream\n')
    .slice(1)
    .map((s) => s.split('\nendstream')[0])
    .find((s) => s.includes('(CONSTANTS)'));
  if (!page) throw new Error('table page never rendered');

  return [...page.matchAll(/([\d.]+) ([\d.]+) Td\n\((.*?)\) Tj/g)]
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), t: m[3] }));
};

/** Width of `text` in points, in the font the table body uses. */
const widthPt = (text: string): number => {
  const ruler = new jsPDF({ unit: 'mm', format: 'a4' });
  ruler.setFont('helvetica', 'normal');
  ruler.setFontSize(10);
  return ruler.getTextWidth(text) * MM;
};

/** Width of `text` in points, in Helvetica-Bold at 10pt. */
const boldWidthPt = (text: string): number => {
  const ruler = new jsPDF({ unit: 'mm', format: 'a4' });
  ruler.setFont('helvetica', 'bold');
  ruler.setFontSize(10);
  return ruler.getTextWidth(text) * MM;
};

/** The raw PDF of a rendered list, and the stream of the page carrying the table. */
const tablePage = async (coords: AdjustedCoordinate[]) => {
  const { pdf } = await new CoordinateListGenerator()
    .generateCoordinateListPDF(coords, surveyorInfo);
  const raw = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
  const page = raw
    .split('stream\n')
    .slice(1)
    .map((s) => s.split('\nendstream')[0])
    .find((s) => s.includes('(CONSTANTS)'));
  if (!page) throw new Error('table page never rendered');
  return { raw, page };
};

/**
 * Every text run on the page, with the font resource it was set in.
 *
 * jsPDF wraps each run as `/Fn 10 Tf ... x y Td (text) Tj` inside BT/ET, so the
 * font is whatever the nearest preceding Tf said. Splitting on the BT/ET pairs
 * rather than one wide regex keeps this working if the leading/trailing lines of
 * a run (leading, fill colour) change.
 */
const textRuns = (page: string) =>
  [...page.matchAll(/BT\n([\s\S]*?)\nET/g)].map(([, body]) => {
    const font = body.match(/\/(F\d+) [\d.]+ Tf/)?.[1];
    const at = body.match(/([\d.]+) ([\d.]+) Td\n\((.*?)\) Tj/);
    if (!font || !at) return null;
    return { font, x: Number(at[1]), y: Number(at[2]), t: at[3] };
  }).filter((r): r is { font: string; x: number; y: number; t: string } => r !== null);

/** Resolve a font resource (/F2) to the PostScript base font it names. */
const baseFontFor = (raw: string, font: string): string => {
  const objNum = raw.match(new RegExp(`/${font} (\\d+) 0 R`))?.[1];
  if (!objNum) throw new Error(`no resource for ${font}`);
  const body = raw.match(new RegExp(`\\b${objNum} 0 obj\\s*<<([\\s\\S]*?)>>`))?.[1];
  const base = body?.match(/\/BaseFont\s*\/([A-Za-z-]+)/)?.[1];
  if (!base) throw new Error(`no BaseFont for ${font}`);
  return base;
};

describe('CO-ORDINATE LIST column geometry', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('prints a realistic beacon description without truncating it', async () => {
    const cells = await tableCells([coord({})]);

    expect(cells.some((c) => c.t === '12mm iron peg in concrete')).toBe(true);
  });

  it('reaches left over the empty Calcs cell rather than right into Y', async () => {
    const cells = await tableCells([coord({})]);

    const constants = cells.find((c) => c.t === 'CONSTANTS')!;
    const calcs = cells.find((c) => c.t === 'Calcs')!;
    const firstConstant = cells.find((c) => c.t.startsWith('±'))!;

    // CONSTANTS is wider than the column that holds it, so it has to overhang
    // somewhere. Left is correct: that cell is empty on this row. Right would
    // collide with the coordinates.
    expect(constants.x).toBeLessThan(calcs.x + widthPt('Calcs') + 30);
    expect(constants.x + widthPt('CONSTANTS')).toBeLessThan(firstConstant.x);
  });

  it('leaves a gap between the beacons column and the coordinates beside it', async () => {
    const cells = await tableCells([coord({})]);

    const beacon = cells.find((c) => c.t === '87DNew')!;
    const constants = cells.find((c) => c.t === 'CONSTANTS')!;
    const y = cells.find((c) => c.t.startsWith('-85 729'))!;

    // Neither the centred name nor the right-justified label may touch Y --
    // the separation is what makes them read as distinct columns.
    expect(beacon.x + widthPt('87DNew')).toBeLessThan(y.x);
    expect(constants.x + widthPt('CONSTANTS')).toBeLessThan(y.x);
  });

  it('centres beacon names under their own heading', async () => {
    const cells = await tableCells([coord({})]);

    const beacon = cells.find((c) => c.t === '87DNew')!;
    const heading = cells.find((c) => c.t === 'Stations')!;

    const centreOf = (c: { x: number; t: string }) => c.x + widthPt(c.t) / 2;
    expect(Math.abs(centreOf(beacon) - centreOf(heading))).toBeLessThan(3);
  });

  it('keeps every cell inside the right margin', async () => {
    const cells = await tableCells([coord({})]);
    const limit = (PAGE_WIDTH_MM - MARGIN_MM) * MM;

    const overruns = cells
      .map((c) => ({ ...c, end: c.x + widthPt(c.t) }))
      .filter((c) => c.end > limit + 0.5);

    expect(overruns.map((c) => `${c.t}@${c.end.toFixed(0)}pt`)).toEqual([]);
  });

  it('gives the description more room than the beacons column it borrowed from', async () => {
    const cells = await tableCells([coord({})]);

    const beacon = cells.find((c) => c.t === '87DNew')!;
    const description = cells.find((c) => c.t.startsWith('12mm'))!;
    const y = cells.find((c) => c.t.startsWith('-85 729'))!;

    const beaconsWidth = y.x - beacon.x;
    const descriptionWidth = (PAGE_WIDTH_MM - MARGIN_MM) * MM - description.x;

    expect(descriptionWidth).toBeGreaterThan(beaconsWidth);
  });
});

describe('CO-ORDINATE LIST page number', () => {
  // The page number is what every cross-reference in the document resolves
  // against: the Field Book's F/B cells, Calculations Part 1's F/B cells, and
  // the S.R. citations name a page of this list. It was the one piece of
  // furniture on the page set in the same weight as the data, which made it the
  // easiest thing on a crowded sheet to lose.
  beforeEach(() => setActivePinia(createPinia()));

  /**
   * The page-number run: the only thing drawn at 15mm from the top.
   *
   * jsPDF's y is measured from the top of the sheet but the stream's is measured
   * from the bottom, so the run sits at (297 - 15)mm. Getting that conversion
   * wrong finds no run at all, which is a clearer failure than finding the wrong
   * one.
   */
  const pageNumberRun = async (coords: AdjustedCoordinate[]) => {
    const { raw, page } = await tablePage(coords);
    const at = (PAGE_HEIGHT_MM - 15) * MM;
    const run = textRuns(page).find((r) => Math.abs(r.y - at) < 0.5);
    if (!run) throw new Error('no page number on the table page');
    return { ...run, baseFont: baseFontFor(raw, run.font) };
  };

  it('is set in bold', async () => {
    const run = await pageNumberRun([coord({})]);

    expect(run.baseFont).toBe('Helvetica-Bold');
  });

  it('says 100 on the first table page', async () => {
    const run = await pageNumberRun([coord({})]);

    expect(run.t).toBe('100');
  });

  it('still lands hard against the right margin in the wider bold glyphs', async () => {
    // addPageNumber right-justifies by subtracting getTextWidth from the right
    // margin. Bold glyphs are wider than the normal ones they replaced, so this
    // is the assertion that the x is measured after the font is set rather than
    // before -- measured in the wrong font the number would sit short of the
    // margin by the difference between the two faces.
    const run = await pageNumberRun([coord({})]);
    const rightMargin = (PAGE_WIDTH_MM - MARGIN_MM) * MM;

    expect(run.x + boldWidthPt(run.t)).toBeCloseTo(rightMargin, 1);
  });

  it('leaves the table body in the normal face', async () => {
    // The page number is drawn before the running header and the table, both of
    // which set their own font -- so bolding it must not leak into the rows.
    const { raw, page } = await tablePage([coord({})]);
    const body = textRuns(page).find((r) => r.t === '87DNew');

    expect(body && baseFontFor(raw, body.font)).toBe('Helvetica');
  });
});
