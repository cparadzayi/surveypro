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

describe('generateNarrativeReportOnSurveyPDF', () => {
  it('still generates without a starting page', async () => {
    const result = await generateNarrativeReportOnSurveyPDF(reportData, options);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    expect(result.pdf.size).toBeGreaterThan(0);
  });

  it('accepts a starting page and returns a loadable PDF of the reported length', async () => {
    const result = await generateNarrativeReportOnSurveyPDF(reportData, options, 200);
    const doc = await PDFDocument.load(await result.pdf.arrayBuffer());
    expect(doc.getPageCount()).toBe(result.pageCount);
  });
});
