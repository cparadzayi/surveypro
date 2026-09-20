/**
 * The survey date survives the import.
 *
 * The parser looked for a column headed "date of survey". Every CSV in
 * cadastral-standard/ heads it "Date" -- only one file out of a dozen used the
 * longer name -- so the lookup found nothing and fell through to `new Date()`.
 * Every imported point was then dated the day of the import, and the field book
 * said the survey happened whenever the operator happened to load the file.
 *
 * The second half of the same line read what it did find month-first, so a
 * survey carried out on 2/07/2026 would have been dated 7 February even once
 * the column was located.
 */

import { describe, it, expect } from 'vitest';
import { validateAndParseCSV } from '../cadastral-csv';

const csv = (rows: string) => `Point,Y,X,Status,Description,Date\n${rows}`;

const firstPoint = (rows: string) => {
  const result = validateAndParseCSV(csv(rows));
  expect(result.preview.length).toBeGreaterThan(0);
  return result.preview[0];
};

describe('importing the survey date', () => {
  it('reads the column headed "Date"', () => {
    const point = firstPoint('SD1,-85728.708,2143972.144,P,12mm iron peg in concrete,2/07/2026');

    expect(point.surveyDate).not.toBeNull();
    expect(point.surveyDate!.getFullYear()).toBe(2026);
    expect(point.surveyDate!.getMonth()).toBe(6); // July, not February
    expect(point.surveyDate!.getDate()).toBe(2);
  });

  it('also reads the column headed "Date of survey"', () => {
    const result = validateAndParseCSV(
      'Point,Y,X,Status,Description,Date of survey\n' +
      'SD1,-85728.708,2143972.144,P,12mm iron peg in concrete,2/07/2026',
    );

    expect(result.preview[0].surveyDate!.getMonth()).toBe(6);
    expect(result.preview[0].surveyDate!.getDate()).toBe(2);
  });

  it('leaves the date null when the row carried none, rather than dating it today', () => {
    const point = firstPoint('SD1,-85728.708,2143972.144,P,12mm iron peg in concrete,');

    expect(point.surveyDate).toBeNull();
  });

  it('leaves the date null when the file has no date column at all', () => {
    const result = validateAndParseCSV(
      'Point,Y,X,Status,Description\n' +
      'SD1,-85728.708,2143972.144,P,12mm iron peg in concrete',
    );

    expect(result.preview[0].surveyDate).toBeNull();
  });
});
