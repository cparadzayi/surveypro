import { describe, it, expect } from 'vitest';
import { generateNarrativeReportOnSurveyPDF } from '../reportOnSurveyNarrativeGenerator';
import type { ReportOnSurveyData } from '@/types/cadastral';

const reportData = {
  srNumber: 'SR 1/2026',
  purpose: { type: 'private-land', reference: 'Permit 42' },
  surveyBasis: {
    trigStations: true,
    trigStationNames: [
      '176/P (Kenyani)', '170/P (Mnyami)', '50/T (Thornhill)', '49/T (Christmas Gift)',
    ],
    townSurveyMarks: false, officialControlPoints: false,
    previousSurvey: false, localSystem: false,
  },
  beacons: [],
  curvilinearBoundaries: { applicable: false },
  unusualOccurrences: 'Survey was straightforward.',
} as any as ReportOnSurveyData;

/**
 * The narrative generator builds jsPDF without compression (see
 * reportOnSurveyNarrativeGenerator.ts), so drawn text is present as `(...) Tj`
 * operators in the output bytes. Decoding as latin1 (a 1:1 byte<->codepoint
 * mapping) lets us search for distinctive tokens directly. Words are only ever
 * split on spaces by `splitTextToSize`, so a space-free token survives intact.
 */
async function rawPdfText(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return Buffer.from(bytes).toString('latin1');
}

describe('report on survey narrative content', () => {
  it('composes the "Survey of" line from stands + township + parent', async () => {
    const { pdf } = await generateNarrativeReportOnSurveyPDF(reportData, {
      surveyorName: 'C. Paradzayi',
      licenseNumber: 'PLS 1',
      firm: 'SurveyPro',
      address: 'Gweru',
      surveyDate: '2026-07-01',
      surveyOf: 'STANDS 403-405 BRACKENHURST TOWNSHIP OF STAND 87 BRACKENHURST TOWNSHIP',
      district: 'Gwelo',
      assistant: 'N/A',
      township: 'Brackenhurst Township',
      parentProperty: 'Stand 87 Brackenhurst Township',
      standNames: ['403', '404', '405'],
    });

    const raw = await rawPdfText(pdf);
    expect(raw).toContain('403-405');
    expect(raw).toContain('Brackenhurst');
  });

  it('labels the district and prints the survey date as month and year', async () => {
    const { pdf } = await generateNarrativeReportOnSurveyPDF(reportData, {
      surveyorName: 'C. Paradzayi',
      licenseNumber: 'PLS 1',
      firm: 'SurveyPro',
      address: 'Gweru',
      surveyDate: '2026-07-30',
      surveyOf: 'Stand 403-405 Brackenhurst Township of Stand 87 Brackenhurst Township',
      district: 'Gwelo',
      assistant: 'N/A',
      township: 'Brackenhurst Township',
      parentProperty: 'Stand 87 Brackenhurst Township',
      standNames: ['403', '404', '405'],
    });

    const raw = await rawPdfText(pdf);
    // Issue 2: the district reads "District : Gwelo", not a bare "Gwelo".
    expect(raw).toContain('District');
    expect(raw).toContain('Gwelo');
    // Issue 3: "July 2026" (the month-and-year, as the field book cover states
    // it) replaces the ISO day "2026-07-30".
    expect(raw).toContain('July 2026');
    expect(raw).not.toContain('2026-07-30');
  });

  it('falls back to the authored surveyOf when no structured parts are given', async () => {
    const { pdf } = await generateNarrativeReportOnSurveyPDF(reportData, {
      surveyorName: 'C. Paradzayi',
      licenseNumber: 'PLS 1',
      firm: 'SurveyPro',
      address: 'Gweru',
      surveyDate: '2026-07-01',
      surveyOf: 'Stands 1 - 2 Test Township',
      district: 'Gwelo',
      assistant: 'N/A',
    });

    const raw = await rawPdfText(pdf);
    expect(raw).toContain('Stands 1 - 2 Test Township');
  });

  it('states the trig basis in the sample wording with the equipment clause appended', async () => {
    const { pdf } = await generateNarrativeReportOnSurveyPDF(reportData, {
      surveyorName: 'C. Paradzayi',
      licenseNumber: 'PLS 1',
      firm: 'SurveyPro',
      address: 'Gweru',
      surveyDate: '2026-07-01',
      surveyOf: 'Stands 1 - 2 Test Township',
      district: 'Gwelo',
      assistant: 'N/A',
      instrumentDescription: 'Trimble R8 GNSS',
      instrumentBaseSerial: 'SN-4401',
      instrumentRoverSerial: 'SN-8812',
    });

    const raw = await rawPdfText(pdf);
    expect(raw).toContain('Trigonometrical beacons');
    expect(raw).toContain('176/P');
    // jsPDF escapes parentheses in content streams (\( \)), so match the alias
    // itself rather than the bracketed form. The long basis sentence wraps onto
    // several lines, so single space-free tokens only.
    expect(raw).toContain('Kenyani');
    expect(raw).toContain('Trimble');
    expect(raw).toContain('GNSS');
    expect(raw).toContain('SN-4401');
    expect(raw).toContain('SN-8812');
    expect(raw).not.toContain('Trig system through the use of Trigs');
  });

  it('omits the equipment clause when no instrument was captured', async () => {
    const { pdf } = await generateNarrativeReportOnSurveyPDF(reportData, {
      surveyorName: 'C. Paradzayi',
      licenseNumber: 'PLS 1',
      firm: 'SurveyPro',
      address: 'Gweru',
      surveyDate: '2026-07-01',
      surveyOf: 'Stands 1 - 2 Test Township',
      district: 'Gwelo',
      assistant: 'N/A',
    });

    const raw = await rawPdfText(pdf);
    expect(raw).toContain('Trigonometrical');
    expect(raw).not.toContain('equipment');
  });
});