import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { appendNarrativeReport } from '../useComprehensivePDF';
import type { ReportOnSurveyData } from '@/types/cadastral';

const narrativeOptions = {
  surveyorName: 'C. Paradzayi', licenseNumber: 'PLS 1', firm: 'SurveyPro',
  address: 'Harare', surveyDate: '2026-01-01', surveyOf: 'Stands 1 - 2 Test Township',
  district: 'Harare', assistant: 'N/A',
};

const reportData = {
  srNumber: 'SR 1/2026',
  purpose: { type: 'private-land', reference: 'Permit 42' },
  surveyBasis: {
    trigStations: true, trigStationNames: ['T1'],
    townSurveyMarks: false, officialControlPoints: false,
    previousSurvey: false, localSystem: false,
  },
  beacons: [],
  curvilinearBoundaries: { applicable: false },
  unusualOccurrences: 'Fence encroaches 0.4 m on the eastern boundary.',
} as any as ReportOnSurveyData;

/** A stand-in for the collated body / areas section. */
async function makePdf(pages: number): Promise<{ bytes: Uint8Array; blob: Blob }> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  const bytes = await doc.save();
  return { bytes, blob: new Blob([bytes as any], { type: 'application/pdf' }) };
}

/**
 * The narrative generator builds jsPDF uncompressed (see
 * reportOnSurveyNarrativeGenerator.ts), so the stamped page-number text (a
 * `(N) Tj` show-text operator) is present verbatim in the output bytes.
 * Decoding as latin1 (a 1:1 byte<->codepoint mapping) lets us search for it
 * directly. Same technique as narrativeReportPageNumbers.test.ts.
 */
async function rawPdfText(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return Buffer.from(bytes).toString('latin1');
}

describe('appendNarrativeReport', () => {
  it('appends the narrative and returns it as its own blob', async () => {
    const body = await makePdf(6);
    const areas = await makePdf(2);

    const result = await appendNarrativeReport(
      body.bytes, areas.blob, 130, reportData, narrativeOptions
    );

    expect(result.narrativeBlob).toBeInstanceOf(Blob);
    const narrativePages = (await PDFDocument.load(await result.narrativeBlob!.arrayBuffer())).getPageCount();
    const mergedPages = (await PDFDocument.load(result.merged)).getPageCount();
    expect(mergedPages).toBe(6 + narrativePages);

    // Page-count arithmetic alone can't catch a wrongly-computed start page
    // (stamping never changes page counts). calculationsEndPage=130 +
    // areasPages=2 + 1 = 133 — pin the actual stamped number, distinctive
    // enough it can't coincidentally appear elsewhere in the narrative body.
    const raw = await rawPdfText(result.narrativeBlob!);
    expect(raw).toContain('(133) Tj');
  });

  it('returns the body untouched when the report data is empty', async () => {
    const body = await makePdf(6);
    const areas = await makePdf(2);
    const empty = {
      srNumber: '', purpose: { type: '', reference: '' },
      surveyBasis: {
        trigStations: false, townSurveyMarks: false, officialControlPoints: false,
        previousSurvey: false, localSystem: false,
      },
      beacons: [], curvilinearBoundaries: { applicable: false }, unusualOccurrences: '',
    } as any as ReportOnSurveyData;

    const result = await appendNarrativeReport(body.bytes, areas.blob, 130, empty, narrativeOptions);

    expect(result.narrativeBlob).toBeUndefined();
    expect((await PDFDocument.load(result.merged)).getPageCount()).toBe(6);
  });

  it('returns the body untouched when there is no report data at all', async () => {
    const body = await makePdf(6);
    const areas = await makePdf(2);
    const result = await appendNarrativeReport(body.bytes, areas.blob, 130, null, narrativeOptions);
    expect(result.narrativeBlob).toBeUndefined();
    expect((await PDFDocument.load(result.merged)).getPageCount()).toBe(6);
  });
});
