/**
 * How a calculated point carries its references.
 *
 * A calculated point is derived, not visited: nobody found or placed a beacon,
 * so its CO-ORDINATE LIST row reads "-" under F/P — the not-applicable marker
 * the F/P column defines. What it does have is two real page numbers:
 *
 *   - Calcs  — the Calculations page of the combined table the point's row
 *     is recorded on (the table records every point, calculated ones too).
 *   - F. B   — the E-page of the field book's CALCULATED POINTS block, where
 *     the book prints it after the observations. Only a row with no such page
 *     (nothing has paginated the field book for it) falls back to "-".
 *
 * The page numbers only exist if calculated points actually reach both
 * generators. They stay off the Field Book's observation pages (they were
 * never observed) but are kept for Calculations and for the field book's own
 * trailing block, so the sections need separate lists, not one shared
 * filtered list.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { CoordinateListGenerator } from '../coordinate-list';
import { CalculationsPart1Generator } from '../calculations-part1';
import { splitSurveyPointsForSections } from '../comprehensive-document';
import type { AdjustedCoordinate } from '../../types/adjusted-coordinates';
import type { SurveyorInfo } from '../coordinate-list';

const surveyorInfo: SurveyorInfo = {
  name: 'C. Paradzayi',
  licenseNumber: 'PLS 1',
  firm: '',
  address: '',
  surveyDate: '2026-01-01',
  projectTitle: 'Test',
  district: '',
};

const coord = (over: Partial<AdjustedCoordinate>): AdjustedCoordinate => ({
  pointId: 'P1',
  y: 1.1,
  x: 2.2,
  status: 'P',
  description: 'iron peg',
  surveyDate: '2026-01-01',
  fieldBookPage: 'E1',
  calculationsPage: 116,
  ...over,
});

/** Cells of the rendered row carrying `pointId`, left to right. */
const renderedRow = async (
  coords: AdjustedCoordinate[],
  pointId: string,
): Promise<string[]> => {
  const result = await new CoordinateListGenerator().generateCoordinateListPDF(
    coords,
    surveyorInfo,
  );
  const raw = Buffer.from(result.pdf.output('arraybuffer')).toString('latin1');
  const placed = raw
    .split('stream\n')
    .slice(1)
    .map((s) => s.split('\nendstream')[0])
    .flatMap((page) => [...page.matchAll(/([\d.]+) ([\d.]+) Td\n\((.*?)\) Tj/g)])
    .map((m) => ({ x: Number(m[1]), y: Number(m[2]), text: m[3] }));

  const anchor = placed.find((c) => c.text === pointId);
  if (!anchor) throw new Error(`point ${pointId} was never rendered`);
  return placed
    .filter((c) => Math.abs(c.y - anchor.y) < 0.5)
    .sort((a, b) => a.x - b.x)
    .map((c) => c.text);
};

describe('a calculated point in the CO-ORDINATE LIST', () => {
  beforeEach(() => setActivePinia(createPinia()));

  const calculated = coord({
    pointId: 'C1',
    y: 3.3,
    x: 4.4,
    status: 'C',
    description: 'CALCULATED',
    fieldBookPage: '-',
  });

  it('claims neither Found nor Placed, and cites no page it was not given', async () => {
    const cells = await renderedRow([calculated], 'C1');

    // fieldBookPage is "-" on this row -- nothing has paginated the field book
    // for it -- so the F. B cell falls back to "-" rather than inventing one.
    expect(cells).toEqual(['116', 'C1', '+3.30', '+4.40', 'CALCULATED', '-', '-']);
  });

  it('cites the field book page of its CALCULATED POINTS block in F. B', async () => {
    // The field book renders the point in its trailing block; the row carries
    // that E-page, and the F. B cell reproduces it. F/P stays "-": nothing was
    // found or placed whatever page it prints on.
    const cells = await renderedRow(
      [{ ...calculated, fieldBookPage: 'E12' }],
      'C1',
    );

    expect(cells).toEqual(['116', 'C1', '+3.30', '+4.40', 'CALCULATED', '-', 'E12']);
  });

  it('still cites the Calculations page it was derived on', async () => {
    const cells = await renderedRow([coord({ ...calculated, calculationsPage: 121 })], 'C1');

    expect(cells[0]).toBe('121');
  });

  it('leaves an ordinary placed beacon untouched', async () => {
    const cells = await renderedRow([coord({})], 'P1');

    expect(cells).toEqual(['116', 'P1', '+1.10', '+2.20', 'iron peg', 'P', 'E1']);
  });
});

describe('splitSurveyPointsForSections', () => {
  const points = [
    { pointId: 'P1', description: 'iron peg', status: 'P' },
    { pointId: 'C1', description: 'CALCULATED', status: 'C' },
    { pointId: 'T1', description: 'TRIG beacon', status: 'TRIG' },
  ] as any[];

  it('keeps calculated points for Calculations, so they can be given a page', () => {
    const { forCalculations } = splitSurveyPointsForSections(points);

    expect(forCalculations.map((p) => p.pointId)).toEqual(['P1', 'C1']);
  });

  it('withholds them from the observation pages; the book files its own block', () => {
    // The field book still opens with observations only -- a computed point
    // cannot sit among them. The block that follows the observations is
    // rendered from the same full list the book receives, so this split
    // governs the observation pages, not what the whole book may contain.
    const { forFieldBook } = splitSurveyPointsForSections(points);

    expect(forFieldBook.map((p) => p.pointId)).toEqual(['P1']);
  });
});

describe('the F/B page a calculation cites', () => {
  it('leaves observations on their pages and gives the calculation its block page', async () => {
    // A calculated point joins no observation page, so it must not consume an
    // observation E-page slot -- the observed point after it stays on the same
    // page. It still earns a page of its own: 27 observations fill E1, so the
    // CALCULATED POINTS block opens at E2, and that is what F/B cites.
    const observed = Array.from({ length: 27 }, (_, i) => ({
      pointId: `P${i + 1}`, y: i, x: i, status: 'P',
      description: 'iron peg', surveyDate: '2026-01-01',
    }));
    const calculated = {
      pointId: 'C1', y: 0, x: 0, status: 'C',
      description: 'CALCULATED', surveyDate: '2026-01-01',
    };

    const gen = new CalculationsPart1Generator();
    const result: any = await gen.generateCalculationsPart1PDF(
      [...observed.slice(0, 5), calculated, ...observed.slice(5)],
      surveyorInfo,
    );
    const byId = Object.fromEntries(
      result.adjustedCoordinates.map((c: any) => [c.pointId, c.fieldBookPage]),
    );

    expect(byId.C1).toBe('E2');    // the block page, after the 1 observation page
    expect(byId.P27).toBe('E1');   // still the 27th RENDERED observation
  });
});
