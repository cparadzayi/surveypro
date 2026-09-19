// @vitest-environment happy-dom
//
// "Surveyed in" names the month of the survey, not a calendar day.
//
// The SG sample reads "June 2020." — a field book records when the work was
// done, not the timestamp a form was submitted. The project stores an ISO date
// because that is what a date input produces, so the cover formats it for
// presentation rather than the workflow storing a second, display-shaped copy.
//
// Older projects already hold free text here ("June 2020", "Winter 2019"), so
// anything unparseable is printed exactly as entered rather than mangled into
// "Invalid Date".

import { describe, it, expect } from 'vitest';
import { FieldBookGenerator, type FieldBookPoint, type FieldBookMetadata } from '../field-book';

const points: FieldBookPoint[] = [
  { id: 'A1', y: 1, x: 2, status: 'P', description: 'peg', surveyDate: '2026-07-30' },
];

const coverText = async (surveyDate: string): Promise<string> => {
  const metadata = { surveyorName: 'F. Chitsike', surveyDate } as FieldBookMetadata;
  const { pdf } = await new FieldBookGenerator().generateFieldBookPDF(points, metadata);
  const raw = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
  const cover = raw
    .split('stream\n')
    .slice(1)
    .map((s) => s.split('\nendstream')[0])
    .find((s) => s.includes('(ELECTRONIC FIELD BOOK)') && !s.includes('(Point)'));
  if (!cover) throw new Error('no cover page rendered');
  return cover;
};

describe('the cover\'s "Surveyed in" row', () => {
  it('names the month and year, not the day', async () => {
    const cover = await coverText('2026-07-30');

    expect(cover).toContain('(July 2026)');
    expect(cover).not.toContain('(2026-07-30)');
  });

  it('reads the month from the date itself, not the locale of the machine', async () => {
    // 1 January is the case that goes wrong when a date is parsed as local time
    // in a timezone behind UTC: it silently becomes 31 December of the year before.
    const cover = await coverText('2026-01-01');

    expect(cover).toContain('(January 2026)');
  });

  it('prints free text exactly as entered, for projects that predate the date input', async () => {
    const cover = await coverText('June 2020.');

    expect(cover).toContain('(June 2020.)');
  });

  it('omits the row entirely when no date was recorded', async () => {
    const cover = await coverText('');

    expect(cover).not.toContain('(Surveyed in)');
  });
});
