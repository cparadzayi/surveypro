/**
 * The adopted-beacons CSV: the input routine the Co-ordinate List's ADOPTED
 * BEACONS section waited for (see the note on SECTION_HEADINGS in
 * coordinate-list.ts).
 *
 * The file is the union of the two headers the app already parsed halves of
 * -- the field-book CSV and the historical-points CSV -- so the parser is
 * held to the file the surveyors actually have: the repo-root template
 * (SR_num,Point,Y,X,Status,Description,Date), with dates in the source
 * survey's own style ("February-21") that parseSurveyDate cannot read.
 */

import { describe, it, expect } from 'vitest';
import {
  parseAdoptedBeaconsCSV,
  generateAdoptedBeaconsTemplate,
  formatAdoptedSurveyDate,
  formatAdoptedSurveyDateLines,
} from '../adoptedBeaconsCsv';

const TEMPLATE = [
  'SR_num,Point,Y,X,Status,Description,Date',
  '112/2021,P2,97538.004,2247107.872,F,50mm Iron Pipe in Concrete,February-21',
  '112/2021,ZA,96271.08,2247869.919,F,50mm Iron Pipe in Concrete,February-21',
  '112/2021,ZD,96551.464,2248065.632,F,50mm Iron Pipe in Concrete,February-21',
].join('\n');

describe('parsing the adopted-beacons template', () => {
  it('parses every row of the shipped template', () => {
    const { points, errors } = parseAdoptedBeaconsCSV(TEMPLATE);

    expect(errors).toEqual([]);
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({
      srNumber: '112/2021',
      pointName: 'P2',
      y: 97538.004,
      x: 2247107.872,
      status: 'F',
      description: '50mm Iron Pipe in Concrete',
      dateRaw: 'February-21',
    });
  });

  it('keeps the status verbatim -- section membership does not read it', () => {
    const csv = TEMPLATE.replace(/,F,/g, ',FN,');
    const { points } = parseAdoptedBeaconsCSV(csv);
    expect(points.every((p) => p.status === 'FN')).toBe(true);
  });

  it('survives a comma inside a quoted description', () => {
    const csv = [
      'SR_num,Point,Y,X,Status,Description,Date',
      '200/2000,A1,97538.004,2247107.872,F,"Pipe in concrete, 50mm",February-21',
    ].join('\n');
    const { points, errors } = parseAdoptedBeaconsCSV(csv);

    expect(errors).toEqual([]);
    expect(points[0].description).toBe('Pipe in concrete, 50mm');
  });

  it('normalises the beacon name at the door', () => {
    const csv = TEMPLATE.replace(',P2,', ',2474a,');
    const { points } = parseAdoptedBeaconsCSV(csv);
    expect(points[0].pointName).toBe('2474A');
  });

  it('rejects a file whose header cannot say where the S.R. number is', () => {
    const { points, errors } = parseAdoptedBeaconsCSV(
      'Point,Y,X,Status,Description,Date\nP2,97538.004,2247107.872,F,pipe,February-21',
    );

    expect(points).toEqual([]);
    expect(errors.some((e) => e.includes('sr_number'))).toBe(true);
  });

  it('reports a duplicate beacon name rather than importing it twice', () => {
    const csv = TEMPLATE + '\n112/2021,P2,97538.004,2247107.872,F,pipe,February-21';
    const { errors } = parseAdoptedBeaconsCSV(csv);

    expect(errors.some((e) => e.includes('duplicate beacon name "P2"'))).toBe(true);
  });

  it('reports a name that is already an imported point as a reclassifiable conflict, not a dead end', () => {
    // The mark was captured as a live observation by mistake and is now being
    // adopted. It is reported as a conflict -- still parsed, not an error --
    // so the import panel can offer "remove from this survey and adopt".
    const { points, errors, conflicts } = parseAdoptedBeaconsCSV(TEMPLATE, ['ZA', '2474A']);

    expect(conflicts).toEqual([{ rowNumber: 3, pointName: 'ZA' }]);
    expect(errors).toEqual([]);
    // The conflicting row survives, so confirming the correction can save it.
    expect(points.map((p) => p.pointName)).toEqual(['P2', 'ZA', 'ZD']);
  });

  it('sees a collision through case folding, same as every other name door', () => {
    const csv = TEMPLATE.replace(',P2,', ',2474a,');
    const { conflicts } = parseAdoptedBeaconsCSV(csv, ['2474A']);

    expect(conflicts).toEqual([{ rowNumber: 2, pointName: '2474A' }]);
  });

  it('reports non-numeric coordinates with the row that carried them', () => {
    const csv = [
      'SR_num,Point,Y,X,Status,Description,Date',
      '112/2021,P2,north,2247107.872,F,pipe,February-21',
    ].join('\n');
    const { errors } = parseAdoptedBeaconsCSV(csv);

    expect(errors.some((e) => e.startsWith('Row 2:') && e.includes('Y "north"'))).toBe(true);
  });

  it('ships a template that parses', () => {
    const { points, errors } = parseAdoptedBeaconsCSV(generateAdoptedBeaconsTemplate());

    expect(errors).toEqual([]);
    expect(points.length).toBeGreaterThan(0);
  });
});

describe('the F. B citation: "February-21" as a surveyor reads it', () => {
  it('renders a month-name and two-digit year as Month YYYY', () => {
    expect(formatAdoptedSurveyDate('February-21')).toBe('February 2021');
    expect(formatAdoptedSurveyDate('November-00')).toBe('November 2000');
  });

  it('accepts the four-digit and spaced spellings', () => {
    expect(formatAdoptedSurveyDate('February-2021')).toBe('February 2021');
    expect(formatAdoptedSurveyDate('Feb 21')).toBe('February 2021');
  });

  it('returns anything it cannot read untouched, never nothing', () => {
    // A date the surveyor typed differently still prints, rather than the
    // citation disappearing from the F. B column.
    expect(formatAdoptedSurveyDate('21-02-2021')).toBe('21-02-2021');
    expect(formatAdoptedSurveyDate('')).toBe('');
    expect(formatAdoptedSurveyDate(null)).toBe('');
  });
});

describe('the F. B cell, stacked so the citation fits its column', () => {
  // The far-right cell is narrow and hard against F/P, so the full month name
  // on one line ran back into the status. The date is split: abbreviated month
  // over the year.
  it('splits a parsed date into month and year', () => {
    expect(formatAdoptedSurveyDateLines('February-21')).toEqual({ top: 'Feb', bottom: '2021' });
    expect(formatAdoptedSurveyDateLines('November-00')).toEqual({ top: 'Nov', bottom: '2000' });
  });

  it('abbreviates to three letters, never more', () => {
    for (const raw of ['September-21', 'October-2021', 'Feb 21']) {
      expect(formatAdoptedSurveyDateLines(raw).top.length).toBe(3);
    }
  });

  it('keeps an unreadable date whole on the first line rather than dropping it', () => {
    expect(formatAdoptedSurveyDateLines('21-02-2021')).toEqual({ top: '21-02-2021', bottom: '' });
  });

  it('yields two empty parts for an absent date', () => {
    expect(formatAdoptedSurveyDateLines('')).toEqual({ top: '', bottom: '' });
    expect(formatAdoptedSurveyDateLines(null)).toEqual({ top: '', bottom: '' });
  });
});
