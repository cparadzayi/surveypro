// @vitest-environment happy-dom
//
// One definition of "calculated point", used everywhere.
//
// There were three. The field book's asked only whether the description
// contained "calculated"; comprehensive-document's also accepted status C or
// CALC; the Co-ordinate List's additionally accepted "not beaconed". So a point
// recorded as status "C" with description "Not Beaconed" — which is exactly how
// 87DNew reached this project — was calculated to two of them and observed to
// the third, and appeared in a field book that records observations.
//
// A field book is a record of what was visited and measured. A point that was
// computed was never visited, so it cannot sit among the observations — it is
// printed in the book's own CALCULATED POINTS block instead, which is the page
// the Co-ordinate List's F. B cell cites for it.

import { describe, it, expect } from 'vitest';
import { isCalculatedPoint } from '../calculatedPoint';
import { FieldBookGenerator, type FieldBookPoint, type FieldBookMetadata } from '../field-book';

describe('isCalculatedPoint', () => {
  it('accepts the status spellings', () => {
    expect(isCalculatedPoint({ status: 'C' })).toBe(true);
    expect(isCalculatedPoint({ status: 'c' })).toBe(true);
    expect(isCalculatedPoint({ status: 'CALC' })).toBe(true);
    expect(isCalculatedPoint({ status: 'Calculated' })).toBe(true);
  });

  it('accepts the description spellings', () => {
    expect(isCalculatedPoint({ description: 'CALCULATED' })).toBe(true);
    expect(isCalculatedPoint({ description: 'calculated point' })).toBe(true);
    expect(isCalculatedPoint({ description: 'Not Beaconed' })).toBe(true);
    expect(isCalculatedPoint({ description: 'not beaconed' })).toBe(true);
  });

  it('catches the combination that slipped through: status C, description Not Beaconed', () => {
    expect(isCalculatedPoint({ status: 'C', description: 'Not Beaconed' })).toBe(true);
  });

  it('leaves observed beacons alone', () => {
    expect(isCalculatedPoint({ status: 'F', description: '50mm Iron Pipe in Concrete' })).toBe(false);
    expect(isCalculatedPoint({ status: 'P', description: '12mm iron peg in concrete' })).toBe(false);
    expect(isCalculatedPoint({})).toBe(false);
  });
});

describe('the field book', () => {
  it('keeps observed beacons on the point pages and files computed ones under the block heading', async () => {
    const points: FieldBookPoint[] = [
      { id: '86B', y: -85728.708, x: 2143972.144, status: 'F', description: '12mm iron peg in concrete', surveyDate: '2026-07-02' },
      { id: '87DNew', y: -85729.942, x: 2144164.763, status: 'C', description: 'Not Beaconed', surveyDate: '2026-07-02' },
      { id: 'SD1', y: -85765.137, x: 2144017.161, status: 'P', description: '12mm iron peg in concrete', surveyDate: '2026-07-02' },
    ];

    const { pdf, pointPageMap } = await new FieldBookGenerator()
      .generateFieldBookPDF(points, { surveyorName: 'F. Chitsike' } as FieldBookMetadata);
    const raw = Buffer.from(pdf.output('arraybuffer')).toString('latin1');

    expect(raw).toContain('(86B)');
    expect(raw).toContain('(SD1)');

    // The computed point IS in the book — under its own heading, not among
    // the observations, and echoing the CSV's own description for it.
    expect(raw).toContain('(CALCULATED POINTS)');
    expect(raw).toContain('(87DNew)');
    expect(raw).toContain('(Not Beaconed)');

    // It consumes no observation slot, so the observed points keep their
    // numbers: 2 observed = E1, the block starts at E2 — the page the
    // Co-ordinate List's F. B cell cites for 87DNew.
    expect(pointPageMap['86B']).toBe('E1');
    expect(pointPageMap['SD1']).toBe('E1');
    expect(pointPageMap['87DNew']).toBe('E2');
  });
});
