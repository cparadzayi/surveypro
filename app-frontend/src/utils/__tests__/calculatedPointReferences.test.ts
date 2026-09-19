/**
 * How a calculated point carries its references.
 *
 * A calculated point is derived, not visited: nobody found or placed a beacon,
 * and no field book page records an observation of it. What it does have is the
 * Calculations page it was derived on. So its CO-ORDINATE LIST row reads
 * "-" under F/P and "-" under F. B — the not-applicable marker the F. B column
 * already used — while the Calcs column carries a real page number.
 *
 * The page number only exists if calculated points actually reach the
 * Calculations generator. They must be excluded from the Field Book (they were
 * never observed) but kept for Calculations, so the two sections need two
 * different lists, not one shared filtered list.
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

  it('claims neither Found nor Placed, and no field book page', async () => {
    const cells = await renderedRow([calculated], 'C1');

    expect(cells).toEqual(['116', 'C1', '+3.30', '+4.40', 'CALCULATED', '-', '-']);
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

  it('withholds them from the Field Book, which records observations only', () => {
    const { forFieldBook } = splitSurveyPointsForSections(points);

    expect(forFieldBook.map((p) => p.pointId)).toEqual(['P1']);
  });
});

describe('the F/B page a calculation cites', () => {
  it('counts only the points the field book actually renders', async () => {
    // A calculated point is not in the field book, so it must not consume an
    // E-page slot -- the observed point after it stays on the same page.
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

    expect(byId.C1).toBe('-');
    expect(byId.P27).toBe('E1'); // still the 27th RENDERED point
  });
});
