/**
 * The field book cover, modelled on cadastral-standard/1 fieldbook cover.pdf.
 *
 * It is a title page: physically first, and carrying no E-number, so adding it
 * must not move a single point. A row whose value is absent is omitted entirely
 * rather than printed as an empty label -- a cover that names an assistant who
 * does not exist is worse than one that stays quiet.
 */

import { describe, it, expect } from 'vitest';
import { FieldBookGenerator } from '../field-book';

const points = [{ id: 'P1', y: 1, x: 2, status: 'P', description: 'peg', surveyDate: '2026-01-01' }];

const metadata = {
  surveyorName: 'O Saunyama',
  assistedBy: 'R. T. Mapamula',
  surveyOf: '108, 167-256 ADVALOREM TOWNSHIP OF SHABANI MINE',
  surveyDate: 'June 2020',
  instrumentDescription: 'Trimble R6GNSS Set',
  instrumentBaseSerial: '5016424521',
  instrumentRoverSerial: '5146476624',
  address: 'BOX A1262\nAVONDALE\nHARARE',
};

const coverStream = async (meta: any): Promise<string> => {
  const { pdf } = await new FieldBookGenerator().generateFieldBookPDF(points, meta);
  const raw = Buffer.from(pdf.output('arraybuffer')).toString('latin1');
  const streams = raw.split('stream\n').slice(1).map(s => s.split('\nendstream')[0]);
  const cover = streams.find(s => s.includes('(ELECTRONIC FIELD BOOK)') && !s.includes('(Point)'));
  if (!cover) throw new Error('no cover page rendered');
  return cover;
};

describe('the field book cover', () => {
  it('names the surveyor, the assistant, the survey and the instruments', async () => {
    const stream = await coverStream(metadata);

    for (const label of ['Land Surveyor', 'Assisted by', 'Survey of', 'Surveyed in', 'Instruments', 'Address']) {
      expect(stream).toContain(`(${label})`);
    }
    expect(stream).toContain('(O Saunyama)');
    expect(stream).toContain('(R. T. Mapamula)');
    expect(stream).toContain('(5016424521)');
    expect(stream).toContain('(5146476624)');
  });

  it('omits a row whose value is absent', async () => {
    const stream = await coverStream({ ...metadata, assistedBy: '' });

    expect(stream).not.toContain('(Assisted by)');
    expect(stream).toContain('(Land Surveyor)'); // the rest survive
  });

  it('falls back to the free-text instruments of an older project', async () => {
    const stream = await coverStream({
      ...metadata,
      instrumentDescription: '',
      instrumentBaseSerial: '',
      instrumentRoverSerial: '',
      instruments: '1. Trimble R6GNSS Set\nBase Serial Number S/N 5016424521',
    });

    expect(stream).toContain('(Instruments)');
    expect(stream).toContain('(5016424521)');
  });

  it('does not consume an E-number', async () => {
    const { pointPageMap, pageCount } = await new FieldBookGenerator()
      .generateFieldBookPDF(points, metadata);

    expect(pointPageMap.P1).toBe('E1'); // the cover is before it, unnumbered
    expect(pageCount).toBe(2);          // but it is a physical page
  });
});
