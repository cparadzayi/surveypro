import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import {
  hasBeaconComparisonData,
  renderBeaconComparison,
  type BeaconComparisonCursor,
} from '../beaconComparisonSection';
import { stampSequentialPageNumbers } from '../pdfPageNumber';
import type { ReportOnSurveyData } from '@/types/cadastral';

function makeReportData(overrides: Partial<ReportOnSurveyData> = {}): ReportOnSurveyData {
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
        // distance intentionally 0.061 (not the raw hypot of dy/dx): 0.0605 is not exactly
        // representable in IEEE-754 double (stores as ~0.060499999999999998), so
        // `.toFixed(3)` — the exact, unchanged formatting call being ported here —
        // yields '0.060' rather than '0.061'. Using a value that reliably rounds
        // to '0.061' keeps this a test of the port, not of float representation.
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
    ...overrides,
  } as ReportOnSurveyData;
}

/** Render into a real jsPDF while capturing every string written. */
function renderCapturing(reportData: ReportOnSurveyData): { written: string[]; cursor: BeaconComparisonCursor } {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const written: string[] = [];
  const originalText = doc.text.bind(doc);
  (doc as any).text = (text: any, ...rest: any[]) => {
    written.push(Array.isArray(text) ? text.join(' ') : String(text));
    return (originalText as any)(text, ...rest);
  };
  const cursor: BeaconComparisonCursor = {
    doc,
    margin: 20,
    lineHeight: 7,
    pageWidth: doc.internal.pageSize.getWidth(),
    pageHeight: doc.internal.pageSize.getHeight(),
    y: 20,
  };
  renderBeaconComparison(cursor, reportData);
  return { written, cursor };
}

describe('hasBeaconComparisonData', () => {
  it('is true when a comparison config and a beacon with original coordinates exist', () => {
    expect(hasBeaconComparisonData(makeReportData())).toBe(true);
  });

  it('is false when there is no comparison config', () => {
    expect(hasBeaconComparisonData(makeReportData({ beaconComparison: undefined }))).toBe(false);
  });

  it('is false when no beacon carries original coordinates', () => {
    const data = makeReportData();
    data.beacons = [{ ...data.beacons[0], originalData: undefined }];
    expect(hasBeaconComparisonData(data)).toBe(false);
  });

  it('is false for null/undefined input', () => {
    expect(hasBeaconComparisonData(null)).toBe(false);
    expect(hasBeaconComparisonData(undefined)).toBe(false);
  });
});

describe('renderBeaconComparison', () => {
  it('renders heading, method line, adjustment summary, table and conclusion', () => {
    const { written } = renderCapturing(makeReportData());
    expect(written).toContain('BEACON COMPARISON (SI 727 Section 67(5))');
    expect(written).toContain('Method: Tabulation of Co-ordinates');
    expect(written).toContain('Helmert LSQ, W-test at 95%: all beacons accepted.');
    expect(written).toContain('Beacon');
    expect(written).toContain('Δ (m)');
    expect(written).toContain('85c');
    expect(written).toContain('0.061');
    expect(written).toContain('Conclusion:');
  });

  it('prints the tolerance line when no adjustment summary is present', () => {
    const data = makeReportData();
    data.beaconComparison!.adjustmentSummary = undefined;
    const { written } = renderCapturing(data);
    expect(written).toContain('Tolerance Threshold: ±0.020m');
  });

  it('advances the cursor', () => {
    const { cursor } = renderCapturing(makeReportData());
    expect(cursor.y).toBeGreaterThan(20);
  });
});

describe('stampSequentialPageNumbers', () => {
  it('writes one in-sequence number per page starting at startingPage', () => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.addPage();
    doc.addPage();
    const written: string[] = [];
    const originalText = doc.text.bind(doc);
    (doc as any).text = (text: any, ...rest: any[]) => {
      written.push(String(text));
      return (originalText as any)(text, ...rest);
    };
    stampSequentialPageNumbers(doc, 140);
    expect(written).toEqual(['140', '141', '142']);
  });
});
