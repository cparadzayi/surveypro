import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateBeaconComparisonReportPDF } from '../beaconComparisonReportGenerator';
import type { ReportOnSurveyData } from '@/types/cadastral';

const options = {
  surveyorName: 'C. Paradzayi',
  licenseNumber: 'PLS 1',
  surveyDate: '2026-01-01',
  surveyOf: 'Stands 1 - 2 Test Township',
};

function makeReportData(): ReportOnSurveyData {
  return {
    srNumber: 'SR 1/2026',
    purpose: { type: 'private-land', reference: 'Permit 42' },
    surveyBasis: {
      trigStations: true, trigStationNames: ['T1'],
      townSurveyMarks: false, officialControlPoints: false,
      previousSurvey: false, localSystem: false,
    },
    beacons: [
      {
        beaconId: '85c',
        status: 'found',
        currentCoordinates: { y: 50000.123, x: 2200000.456 },
        originalData: {
          coordinates: { y: 50000.1, x: 2200000.4 },
          srNumber: 'SR 21/2016',
          source: 'previous-survey',
        },
        discrepancy: { dy: 0.023, dx: 0.056, distance: 0.061 },
      },
    ],
    beaconComparison: {
      method: 'tabulation',
      currentSRNumber: 'SR 1/2026',
      originalSRNumber: 'SR 21/2016',
      toleranceThreshold: 0.02,
      adjustmentSummary: 'Helmert LSQ, W-test at 95%: all beacons accepted.',
      conclusion: 'From the above comparison, I adopt the positions of all found beacons.',
    },
    curvilinearBoundaries: { applicable: false },
    unusualOccurrences: '',
  } as ReportOnSurveyData;
}

describe('generateBeaconComparisonReportPDF', () => {
  it('returns a non-empty PDF with at least one page when comparison data is present', async () => {
    const result = await generateBeaconComparisonReportPDF(makeReportData(), options, 140);
    expect(result).not.toBeNull();
    expect(result!.pageCount).toBeGreaterThanOrEqual(1);
    expect(result!.pdf).toBeInstanceOf(Blob);
    expect(result!.pdf.size).toBeGreaterThan(0);
  });

  it('reports a page count that matches the rendered PDF', async () => {
    const result = await generateBeaconComparisonReportPDF(makeReportData(), options, 140);
    const doc = await PDFDocument.load(await result!.pdf.arrayBuffer());
    expect(doc.getPageCount()).toBe(result!.pageCount);
  });

  it('returns null when there is no comparison config', async () => {
    const data = makeReportData();
    data.beaconComparison = undefined;
    expect(await generateBeaconComparisonReportPDF(data, options, 140)).toBeNull();
  });

  it('returns null when no beacon has original coordinates', async () => {
    const data = makeReportData();
    data.beacons = [{ ...data.beacons[0], originalData: undefined }];
    expect(await generateBeaconComparisonReportPDF(data, options, 140)).toBeNull();
  });

  it('returns null for null report data', async () => {
    expect(await generateBeaconComparisonReportPDF(null, options, 140)).toBeNull();
  });
});
