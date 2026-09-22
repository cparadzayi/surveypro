/**
 * The field book cover, modelled on cadastral-standard/1 fieldbook cover.pdf.
 *
 * It is a title page: physically first, and carrying no E-number, so adding it
 * must not move a single point. A row whose value is absent is omitted entirely
 * rather than printed as an empty label -- a cover that names an assistant who
 * does not exist is worse than one that stays quiet.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { FieldBookGenerator } from '../field-book';
import { TwoPassDocumentGenerator } from '../TwoPassDocumentGenerator';

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

describe('the cover through the two-pass generator', () => {
  beforeEach(() => {
    // CoordinateListGenerator reads useSurveyLookupStore(); mirror main.ts's app.use(createPinia()).
    setActivePinia(createPinia());
  });

  it('carries the assistant and instruments from the workflow', async () => {
    const result = await new TwoPassDocumentGenerator().generate({
      surveyPoints: [{ pointId: 'P1', y: 1, x: 2, status: 'P', description: 'peg', surveyDate: '2026-01-01' }],
      adjustedCoordinates: [],
      surveyorInfo: {
        name: 'O Saunyama',
        licenseNumber: 'PLS 1',
        firm: '',
        address: 'BOX A1262',
        surveyDate: 'June 2020',
        projectTitle: 'SHABANI',
        assistedBy: 'R. T. Mapamula',
        instrumentDescription: 'Trimble R6GNSS Set',
        instrumentBaseSerial: '5016424521',
        instrumentRoverSerial: '5146476624',
      },
    } as any);

    const raw = Buffer.from(await result.sections.fieldBook.arrayBuffer()).toString('latin1');

    expect(raw).toContain('(R. T. Mapamula)');
    expect(raw).toContain('(5016424521)');
  });

  // This is the bug renderFieldBook actually had: it passed projectTitle where
  // FieldBookMetadata expects surveyOf, so "Survey of" rendered empty even
  // once every other row was wired. Because `metadata` there is a pre-declared
  // const, a future `surveyOf: data.surveyorInfo.someWrongField` would compile
  // silently -- this pins the mapping so that regresses loudly instead.
  it('carries the survey title through the surveyOf mapping', async () => {
    const result = await new TwoPassDocumentGenerator().generate({
      surveyPoints: [{ pointId: 'P1', y: 1, x: 2, status: 'P', description: 'peg', surveyDate: '2026-01-01' }],
      adjustedCoordinates: [],
      surveyorInfo: {
        name: 'O Saunyama',
        licenseNumber: 'PLS 1',
        firm: '',
        address: 'BOX A1262',
        surveyDate: 'June 2020',
        projectTitle: 'ADVALOREM TOWNSHIP OF SHABANI MINE STAND 9182',
      },
    } as any);

    const raw = Buffer.from(await result.sections.fieldBook.arrayBuffer()).toString('latin1');

    expect(raw).toContain('(ADVALOREM TOWNSHIP OF SHABANI MINE STAND 9182)');
  });

  // The cover must state the same designation as the cover letter: the shared
  // surveyOfForSurveyor mapping (fullDesignationPhrase) rebuilds the phrase from
  // the workflow surveyOf + the sheet's stands, and it wins over projectTitle.
  it('states the general-plan designation from the workflow surveyOf', async () => {
    const result = await new TwoPassDocumentGenerator().generate({
      surveyPoints: [{ pointId: 'P1', y: 1, x: 2, status: 'P', description: 'peg', surveyDate: '2026-01-01' }],
      adjustedCoordinates: [],
      surveyorInfo: {
        name: 'O Saunyama',
        licenseNumber: 'PLS 1',
        firm: '',
        address: 'BOX A1262',
        surveyDate: 'June 2020',
        projectTitle: 'SOMETHING ELSE',
        surveyOf: 'Stands 108, 167-256 Advalorem Township',
        standNames: ['108', '167', '168', '169', '256'],
      },
    } as any);

    const raw = Buffer.from(await result.sections.fieldBook.arrayBuffer()).toString('latin1');

    expect(raw).toContain('(STANDS 108, 167 - 169, 256 ADVALOREM TOWNSHIP)');
    expect(raw).not.toContain('(SOMETHING ELSE)');
  });

  // The full designation — inclusive of the " ... of ..." parent-property
  // clause — must survive on the cover, not just the clipped general-plan
  // township phrase.
  it('keeps the parent-property clause on the field book cover', async () => {
    const result = await new TwoPassDocumentGenerator().generate({
      surveyPoints: [{ pointId: 'P1', y: 1, x: 2, status: 'P', description: 'peg', surveyDate: '2026-01-01' }],
      adjustedCoordinates: [],
      surveyorInfo: {
        name: 'O Saunyama',
        licenseNumber: 'PLS 1',
        firm: '',
        address: 'BOX A1262',
        surveyDate: 'June 2020',
        projectTitle: 'SOMETHING ELSE',
        surveyOf: 'STANDS 271-339, 346-349 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A',
        standNames: ['271', '272', '288', '289', '290'],
      },
    } as any);

    const raw = Buffer.from(await result.sections.fieldBook.arrayBuffer()).toString('latin1');

    expect(raw).toContain('(STANDS 271 - 272, 288 - 290 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A)');
    expect(raw).not.toContain('(SOMETHING ELSE)');
  });

  // The cover falls back to the free-text `instruments` column when the three
  // structured instrument fields are all empty -- how a project predating this
  // branch still renders an Instruments row. Drives that through the real
  // generate() pipeline, not FieldBookGenerator directly, so the
  // surveyorInfo.instruments -> metadata.instruments mapping is covered too.
  it('falls back to the legacy instruments text when the structured fields are empty', async () => {
    const result = await new TwoPassDocumentGenerator().generate({
      surveyPoints: [{ pointId: 'P1', y: 1, x: 2, status: 'P', description: 'peg', surveyDate: '2026-01-01' }],
      adjustedCoordinates: [],
      surveyorInfo: {
        name: 'O Saunyama',
        licenseNumber: 'PLS 1',
        firm: '',
        address: 'BOX A1262',
        surveyDate: 'June 2020',
        projectTitle: 'SHABANI',
        instruments: '1. Wild T2 Theodolite\nSerial Number S/N 998877',
        instrumentDescription: '',
        instrumentBaseSerial: '',
        instrumentRoverSerial: '',
      },
    } as any);

    const raw = Buffer.from(await result.sections.fieldBook.arrayBuffer()).toString('latin1');

    expect(raw).toContain('(998877)');
  });

  it('prefers the structured instrument fields over the legacy text when both are present', async () => {
    const result = await new TwoPassDocumentGenerator().generate({
      surveyPoints: [{ pointId: 'P1', y: 1, x: 2, status: 'P', description: 'peg', surveyDate: '2026-01-01' }],
      adjustedCoordinates: [],
      surveyorInfo: {
        name: 'O Saunyama',
        licenseNumber: 'PLS 1',
        firm: '',
        address: 'BOX A1262',
        surveyDate: 'June 2020',
        projectTitle: 'SHABANI',
        instruments: '1. Wild T2 Theodolite\nSerial Number S/N 998877',
        instrumentDescription: 'Trimble R6GNSS Set',
        instrumentBaseSerial: '5016424521',
        instrumentRoverSerial: '5146476624',
      },
    } as any);

    const raw = Buffer.from(await result.sections.fieldBook.arrayBuffer()).toString('latin1');

    expect(raw).toContain('(5016424521)');
    expect(raw).not.toContain('(998877)');
  });
});
