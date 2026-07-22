import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateNarrativeReportOnSurveyPDF } from '../reportOnSurveyNarrativeGenerator';
import type { ReportOnSurveyData } from '@/types/cadastral';

const options = {
  surveyorName: 'C. Paradzayi',
  licenseNumber: 'PLS 1',
  firm: 'SurveyPro',
  address: 'Harare',
  surveyDate: '2026-01-01',
  surveyOf: 'Stands 1 - 2 Test Township',
  district: 'Harare',
  assistant: 'N/A',
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
  unusualOccurrences: 'Survey was straightforward.',
} as any as ReportOnSurveyData;

// A starting page distinctive enough that it cannot coincidentally appear
// anywhere in the report's ordinary content (dates, SR numbers, license
// numbers, etc. above). Verified absent from the unstamped output below.
const STARTING_PAGE = 200;

/**
 * The generator builds jsPDF without `{ compress: true }` (see
 * reportOnSurveyNarrativeGenerator.ts constructor), so page content streams
 * are stored uncompressed and the page-number text jsPDF draws (a `(N) Tj`
 * show-text operator) is present verbatim in the output bytes. Decoding as
 * latin1 (a 1:1 byte<->codepoint mapping) lets us search for it directly,
 * without needing a PDF content-stream parser.
 */
async function rawPdfText(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return Buffer.from(bytes).toString('latin1');
}

describe('generateNarrativeReportOnSurveyPDF', () => {
  it('still generates without a starting page', async () => {
    const result = await generateNarrativeReportOnSurveyPDF(reportData, options);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.pdf.size).toBeGreaterThan(0);

    // Backward compatibility: omitting startingPage must leave the report
    // unnumbered. Assert the actual stamp text is absent, not just that the
    // page count/size look plausible (those never change when stamping
    // does, so they can't tell a stamped report from an unstamped one).
    const raw = await rawPdfText(result.pdf);
    expect(raw).not.toContain(`(${STARTING_PAGE}) Tj`);
  });

  it('accepts a starting page and returns a loadable PDF of the reported length', async () => {
    const result = await generateNarrativeReportOnSurveyPDF(reportData, options, STARTING_PAGE);
    const doc = await PDFDocument.load(await result.pdf.arrayBuffer());
    expect(doc.getPageCount()).toBe(result.pageCount);

    // The page count matching is necessary but not sufficient — stamping
    // never adds or removes pages, so this alone can't detect a no-op
    // stamp. Confirm the stamped page number is actually drawn.
    const raw = await rawPdfText(result.pdf);
    expect(raw).toContain(`(${STARTING_PAGE}) Tj`);
  });

  it('stamps when startingPage is 0 (falsy but explicitly provided)', async () => {
    // The implementation guards with `startingPage !== undefined` rather
    // than a truthiness check specifically so that 0 still stamps. This is
    // the regression test for that guard.
    const result = await generateNarrativeReportOnSurveyPDF(reportData, options, 0);
    const raw = await rawPdfText(result.pdf);
    expect(raw).toContain('(0) Tj');
  });
});
