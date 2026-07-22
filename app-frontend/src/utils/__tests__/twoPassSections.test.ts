import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ComprehensiveDocumentGenerator } from '../comprehensive-document';
import type { ReportOnSurveyData } from '@/types/cadastral';

// Minimal-but-real inputs: two observed points + one parcel are enough to render
// every section (field book, coordinate list, calculations, areas) without error.
const surveyPoints = [
  { pointId: 'A1', y: 50000, x: 2200000, status: 'P', description: '', surveyDate: '2026-01-01' },
  { pointId: 'A2', y: 50100, x: 2200060, status: 'P', description: '', surveyDate: '2026-01-01' },
];
const adjustedCoordinates = surveyPoints.map((pt) => ({
  ...pt,
  fieldBookPage: '',
  calculationsPage: 0,
  adjustment: { isDuplicate: false, observationCount: 1, method: 'gps' as const },
}));
const surveyorInfo = {
  name: 'C. Paradzayi', licenseNumber: 'PLS 1', firm: '', address: '',
  surveyDate: '2026-01-01', projectTitle: 'Test', district: 'X', centralMeridian: 31,
};
const projectInfo = {
  projectTitle: 'Test', surveyorName: 'C. Paradzayi', licenseNumber: 'PLS 1',
  surveyDate: '2026-01-01', surveyType: 'STANDS 1 - 2 TEST TOWNSHIP',
};
const parcels = [{
  id: '1', name: '1',
  coordinates: [{ x: 2200000, y: 50000 }, { x: 2200060, y: 50000 }, { x: 2200060, y: 50100 }],
  area: 0.6,
}];

const reportData = {
  srNumber: 'SR 1/2026',
  purpose: { type: 'private-land', reference: 'Permit 42' },
  surveyBasis: {
    trigStations: true, trigStationNames: ['T1'],
    townSurveyMarks: false, officialControlPoints: false,
    previousSurvey: false, localSystem: false,
  },
  beacons: [{
    beaconId: '85c',
    status: 'found',
    currentCoordinates: { y: 50000.123, x: 2200000.456 },
    originalData: {
      coordinates: { y: 50000.1, x: 2200000.4 },
      srNumber: 'SR 21/2016',
      source: 'previous-survey',
    },
    discrepancy: { dy: 0.023, dx: 0.056, distance: 0.061 },
  }],
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
} as any as ReportOnSurveyData;

const reportOptions = {
  surveyorName: 'C. Paradzayi', licenseNumber: 'PLS 1',
  surveyDate: '2026-01-01', surveyOf: 'Stands 1 - 2 Test Township',
};

const baseData = {
  projectInfo, surveyorInfo,
  fieldBookObservations: [],
  surveyPoints, adjustedCoordinates,
  projectControlPoints: [], duplicateAnalyses: [], parcels,
};

describe('generateWithTwoPass — section blobs', () => {
  beforeEach(() => {
    // CoordinateListGenerator reads useSurveyLookupStore(); mirror main.ts's app.use(createPinia()).
    setActivePinia(createPinia());
  });

  it('returns non-empty cover, field book, coordinate list, and calculations blobs', async () => {
    const gen = new ComprehensiveDocumentGenerator();
    const result = await gen.generateWithTwoPass({ ...baseData } as any);
    for (const key of ['cover', 'fieldBook', 'coordinateList', 'calculations'] as const) {
      expect(result.sections?.[key]).toBeInstanceOf(Blob);
      expect(result.sections?.[key]!.size).toBeGreaterThan(0);
    }
  }, 30000);

  it('omits the beacon comparison and leaves Calculations unshifted with no report data', async () => {
    const gen = new ComprehensiveDocumentGenerator();
    const result = await gen.generateWithTwoPass({ ...baseData } as any);
    expect(result.sections?.beaconComparison).toBeUndefined();
    expect(result.measurements?.beaconComparison?.pages ?? 0).toBe(0);
    expect(result.measurements!.calculations.startPage).toBe(
      result.measurements!.coordinateList.endPage + 1
    );
  }, 30000);

  it('inserts the beacon comparison and shifts Calculations by K when report data is present', async () => {
    const gen = new ComprehensiveDocumentGenerator();
    const result = await gen.generateWithTwoPass({
      ...baseData, reportData, reportOptions,
    } as any);

    const beacon = result.measurements!.beaconComparison!;
    expect(beacon.pages).toBeGreaterThanOrEqual(1);
    expect(result.sections?.beaconComparison).toBeInstanceOf(Blob);
    expect(result.sections!.beaconComparison!.size).toBeGreaterThan(0);

    const coordEnd = result.measurements!.coordinateList.endPage;
    expect(beacon.startPage).toBe(coordEnd + 1);
    expect(beacon.endPage).toBe(coordEnd + beacon.pages);
    expect(result.measurements!.calculations.startPage).toBe(coordEnd + beacon.pages + 1);
    expect(result.measurements!.areas.startPage).toBe(
      result.measurements!.calculations.endPage + 1
    );
  }, 30000);
});
