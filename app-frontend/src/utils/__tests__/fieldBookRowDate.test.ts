// @vitest-environment happy-dom
//
// The Date column must never print the words "Invalid Date".
//
// `new Date('30/07/2026')` does not throw — it returns an Invalid Date, and
// `toLocaleDateString` on that returns the literal string "Invalid Date". The
// try/catch around it therefore never fires, and the phrase goes straight into
// the Date column of a field book lodged with the Surveyor-General, once per row.
//
// Anything unparseable is printed exactly as it was recorded instead. A date the
// reader can interpret beats a sentence telling them the software could not.

import { describe, it, expect } from 'vitest';
import { FieldBookGenerator, type FieldBookPoint, type FieldBookMetadata } from '../field-book';

const metadata = { surveyorName: 'F. Chitsike' } as FieldBookMetadata;

const point = (surveyDate: string): FieldBookPoint => ({
  id: 'SD1',
  y: -85728.708,
  x: 2143972.144,
  status: 'P',
  description: '12mm iron peg in concrete',
  surveyDate,
});

/** The rendered point page, as raw content-stream text. */
const pointPage = async (surveyDate: string): Promise<string> => {
  const { pdf } = await new FieldBookGenerator().generateFieldBookPDF([point(surveyDate)], metadata);
  const raw = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
  const page = raw
    .split('stream\n')
    .slice(1)
    .map((s) => s.split('\nendstream')[0])
    .find((s) => s.includes('(SD1)'));
  if (!page) throw new Error('point row never rendered');
  return page;
};

describe('the field book Date column', () => {
  it('formats an ISO date the surveyor entered', async () => {
    const page = await pointPage('2026-07-30');

    expect(page).toContain('(30/07/2026)');
  });

  it('never prints "Invalid Date" for a date it cannot parse', async () => {
    const page = await pointPage('30/07/2026');

    expect(page).not.toContain('Invalid Date');
  });

  it('prints an unparseable date exactly as recorded', async () => {
    const page = await pointPage('30/07/2026');

    expect(page).toContain('(30/07/2026)');
  });

  it('leaves the cell empty when no date was recorded', async () => {
    const page = await pointPage('');

    expect(page).not.toContain('Invalid Date');
  });
});
