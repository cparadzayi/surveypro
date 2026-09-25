/**
 * The survey date is a fact about the survey, not about the day the PDF was made.
 *
 * Four places along the chain from CSV to field book quietly substituted today
 * whenever the recorded date was missing or unreadable, so a record lodged with
 * the Surveyor-General claimed a survey happened on the day it was printed.
 *
 * Three separate faults produced that:
 *
 *   1. The CSV column is headed "Date". The parser looked for "date of survey",
 *      which almost no file uses, so it found nothing and used today.
 *   2. `new Date('2/07/2026')` is read as month-first and gives 7 February.
 *      Zimbabwe writes dd/mm/yyyy, so that is the wrong day and the wrong month.
 *   3. `new Date(2026, 6, 2).toISOString()` is 2026-07-01T22:00Z in UTC+2, so
 *      storing the date shifted it a day earlier every time it round-tripped.
 *
 * A date that cannot be read is null. Null prints as an empty cell, which is
 * honest; today's date is not.
 */

import { describe, it, expect } from 'vitest';
import { parseSurveyDate, formatSurveyDate, toISODate, formatSurveyMonthYear } from '../surveyDate';

describe('parseSurveyDate', () => {
  it('reads dd/mm/yyyy the way Zimbabwe writes it', () => {
    const d = parseSurveyDate('2/07/2026');

    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(6); // July, not February
    expect(d!.getDate()).toBe(2);
  });

  it('reads a zero-padded dd/mm/yyyy', () => {
    expect(formatSurveyDate(parseSurveyDate('02/07/2026'))).toBe('02/07/2026');
  });

  it('reads an ISO date', () => {
    const d = parseSurveyDate('2026-07-02');

    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(6);
    expect(d!.getDate()).toBe(2);
  });

  it('accepts the ISO timestamps already stored in the database', () => {
    expect(formatSurveyDate(parseSurveyDate('2026-07-02T00:00:00.000Z'))).toBe('02/07/2026');
  });

  it('returns null rather than today when nothing was recorded', () => {
    expect(parseSurveyDate('')).toBeNull();
    expect(parseSurveyDate('   ')).toBeNull();
    expect(parseSurveyDate(null)).toBeNull();
    expect(parseSurveyDate(undefined)).toBeNull();
  });

  it('returns null rather than a guess when the date cannot be read', () => {
    expect(parseSurveyDate('Feb-58')).toBeNull();
    expect(parseSurveyDate('not a date')).toBeNull();
  });

  it('rejects a month that does not exist instead of rolling it over', () => {
    // 01/13/2026 is month-first notation. Read as dd/mm it is month 13, which
    // does not exist -- and JavaScript would roll it into January 2027.
    expect(parseSurveyDate('01/13/2026')).toBeNull();
  });

  it('rejects a day the month does not have', () => {
    expect(parseSurveyDate('31/02/2026')).toBeNull();
  });
});

describe('formatSurveyDate', () => {
  it('writes dd/mm/yyyy', () => {
    expect(formatSurveyDate(new Date(2026, 6, 2))).toBe('02/07/2026');
  });

  it('accepts a raw string and normalises it', () => {
    expect(formatSurveyDate('2026-07-02')).toBe('02/07/2026');
  });

  it('prints an unreadable date exactly as it was recorded', () => {
    expect(formatSurveyDate('Feb-58')).toBe('Feb-58');
  });

  it('is empty when there is no date', () => {
    expect(formatSurveyDate(null)).toBe('');
    expect(formatSurveyDate('')).toBe('');
  });
});

describe('toISODate', () => {
  it('keeps the calendar day when the timezone is ahead of UTC', () => {
    // toISOString() on local midnight in UTC+2 yields the previous day.
    expect(toISODate(new Date(2026, 6, 2))).toBe('2026-07-02');
  });

  it('round-trips a dd/mm/yyyy date without losing a day', () => {
    expect(toISODate(parseSurveyDate('2/07/2026'))).toBe('2026-07-02');
  });

  it('is empty when there is no date', () => {
    expect(toISODate(null)).toBe('');
  });
});

describe('formatSurveyMonthYear', () => {
  it('writes the month-and-year the work was done, as the cover states it', () => {
    expect(formatSurveyMonthYear('2026-07-30')).toBe('July 2026');
    expect(formatSurveyMonthYear('2026-07-01')).toBe('July 2026');
    expect(formatSurveyMonthYear('14/12/2025')).toBe('December 2025');
  });

  it('reads an ISO date with a trailing timestamp', () => {
    expect(formatSurveyMonthYear('2026-02-15T09:30:00Z')).toBe('February 2026');
  });

  it('prints an unreadable date exactly as it was recorded', () => {
    expect(formatSurveyMonthYear('June 2020')).toBe('June 2020');
  });

  it('is empty when there is no date', () => {
    expect(formatSurveyMonthYear(null)).toBe('');
    expect(formatSurveyMonthYear('')).toBe('');
  });
});
