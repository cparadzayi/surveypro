// @vitest-environment happy-dom
//
// The footer dates the survey, not the printing.
//
// Every page carried `new Date().toLocaleDateString()` in its bottom-right
// corner, so a field book regenerated in September stamped "9/20/2026" on a
// survey carried out on 2 July. The date of survey is a fact about the survey;
// the day somebody re-ran the generator is not a fact about anything. It also
// arrived in US month-first format, which is not how Zimbabwe writes a date.
//
// These assertions read the footer by position rather than searching the whole
// document: the Date column of the point rows carries the same date string, so
// a document-wide `toContain` passes whether or not the footer was ever fixed.

import { describe, it, expect } from 'vitest';
import { FieldBookGenerator, type FieldBookPoint, type FieldBookMetadata } from '../field-book';

const points: FieldBookPoint[] = [
  {
    id: 'SD1',
    y: -85728.708,
    x: 2143972.144,
    status: 'P',
    description: '12mm iron peg in concrete',
    surveyDate: '2026-07-02',
  },
];

/** Text placed on the footer line, 15mm up from the foot of the page. */
const FOOTER_Y = 42.5;

async function footerTexts(metadata: Partial<FieldBookMetadata>): Promise<string[]> {
  const { pdf } = await new FieldBookGenerator().generateFieldBookPDF(
    points,
    { surveyorName: 'F. Chitsike', ...metadata } as FieldBookMetadata,
  );
  const raw = Buffer.from(pdf.output('arraybuffer')).toString('latin1');

  const placements = /([\d.-]+)\s+([\d.-]+)\s+Td\s*\((.*?)\)\s*Tj/g;
  const found: string[] = [];
  for (let m = placements.exec(raw); m; m = placements.exec(raw)) {
    if (Math.abs(parseFloat(m[2]) - FOOTER_Y) < 1) found.push(m[3]);
  }
  return found;
}

describe('the field book footer', () => {
  it('prints the survey date, not the day it was generated', async () => {
    const footer = await footerTexts({ surveyDate: '2026-07-02' });

    expect(footer).toContain('02/07/2026');
  });

  it('does not stamp the generation date', async () => {
    const footer = await footerTexts({ surveyDate: '2026-07-02' });

    // The exact string the old footer produced: today, in the host's locale.
    expect(footer).not.toContain(new Date().toLocaleDateString());
  });

  it('reads a dd/mm/yyyy survey date as day-first', async () => {
    // 2/07/2026 is 2 July. `new Date` would have read it as 7 February.
    const footer = await footerTexts({ surveyDate: '2/07/2026' });

    expect(footer).toContain('02/07/2026');
    expect(footer).not.toContain('07/02/2026');
  });

  it('leaves the footer date blank when no survey date was recorded', async () => {
    const footer = await footerTexts({ surveyDate: undefined });

    expect(footer.join(' ')).not.toContain('Invalid Date');
    expect(footer.join(' ')).not.toContain('NaN');
    // Surveyor and page label remain; nothing stands in for the missing date.
    expect(footer).toEqual(['F. Chitsike', 'Page E1']);
  });
});
