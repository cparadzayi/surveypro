import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { PDFDocument } from 'pdf-lib';
import { ComprehensiveDocumentGenerator } from '../comprehensive-document';
import { TwoPassDocumentGenerator } from '../TwoPassDocumentGenerator';
import { CoordinateListGenerator } from '../coordinate-list';
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

  // Finding 1 (Important): the stamped page numbers say Beacon Comparison sits
  // between Coordinate List and Calculations, but nothing previously asserted
  // that the PHYSICAL merge order (the `pdfs.push(...)` sequence in
  // TwoPassDocumentGenerator.renderPass) agrees with that. If someone moved the
  // beacon push after the calculations push, every existing test above stays
  // green (measurements/page numbers are computed in Pass 1 and never touched)
  // while the merged PDF's physical page order would contradict its own
  // stamped numbers.
  //
  // Byte-level page-content inspection (e.g. searching decoded content streams
  // for section-specific text) was considered but rejected: it would require
  // reaching into pdf-lib's low-level stream-decoding internals and assumes
  // jsPDF's compression settings never change — fragile and coupled to
  // implementation details unrelated to the claim under test. Spying on the
  // merge step instead asserts exactly the behaviour in question — the order
  // of blobs hand to `mergePDFs` — using the very same Blob references
  // exposed via `result.sections`, so it is precise and order-sensitive: it
  // fails immediately if the beacon push is reordered relative to coordinate
  // list / calculations, and passes only when beacon sits strictly between them.
  it('physically merges Field Book -> Coordinate List -> Beacon Comparison -> Calculations in that order', async () => {
    const mergeSpy = vi.spyOn(TwoPassDocumentGenerator.prototype as any, 'mergePDFs');

    const gen = new ComprehensiveDocumentGenerator();
    const result = await gen.generateWithTwoPass({
      ...baseData, reportData, reportOptions,
    } as any);

    expect(mergeSpy).toHaveBeenCalledTimes(1);
    const mergedBlobs = mergeSpy.mock.calls[0][0] as Blob[];

    const fieldBookIdx = mergedBlobs.indexOf(result.sections!.fieldBook);
    const coordListIdx = mergedBlobs.indexOf(result.sections!.coordinateList);
    const beaconIdx = mergedBlobs.indexOf(result.sections!.beaconComparison!);
    const calcIdx = mergedBlobs.indexOf(result.sections!.calculations);

    // Every section must actually be present in the merged input...
    expect(fieldBookIdx).toBeGreaterThanOrEqual(0);
    expect(coordListIdx).toBeGreaterThanOrEqual(0);
    expect(beaconIdx).toBeGreaterThanOrEqual(0);
    expect(calcIdx).toBeGreaterThanOrEqual(0);
    // ...and in the order the stamped page numbers promise.
    expect(fieldBookIdx).toBeLessThan(coordListIdx);
    expect(coordListIdx).toBeLessThan(beaconIdx);
    expect(beaconIdx).toBeLessThan(calcIdx);

    // Sanity cross-check: independently re-derive the expected total page
    // count from each rendered section blob (not from `measurements`, which
    // also projects unimplemented Areas pages) and confirm the final merged
    // PDF (2 cover pages + the four sections) matches it.
    const countPages = async (blob: Blob) =>
      (await PDFDocument.load(await blob.arrayBuffer())).getPageCount();

    const [coverAndBodyPages, fieldBookPages, coordListPages, beaconPages, calcPages] =
      await Promise.all([
        countPages(result.pdf),
        countPages(result.sections!.fieldBook),
        countPages(result.sections!.coordinateList),
        countPages(result.sections!.beaconComparison!),
        countPages(result.sections!.calculations),
      ]);

    expect(coverAndBodyPages).toBe(
      2 /* cover */ + fieldBookPages + coordListPages + beaconPages + calcPages
    );

    mergeSpy.mockRestore();
  }, 30000);

  // Finding 2 (Important): nothing verified that the point -> calculation-page
  // lookup handed to the Coordinate List renderer actually carries the
  // SHIFTED page numbers (i.e. shifted past the K-page Beacon Comparison
  // Report). Spying on `generateCoordinateListPDF` captures exactly what the
  // renderer received (as opposed to re-deriving it from `measurements`,
  // which is produced by the same code path and could agree with itself
  // while still being wrong relative to what's rendered).
  it('hands the Coordinate List renderer a calc-page lookup shifted past the Beacon Comparison Report', async () => {
    const genSpy = vi.spyOn(CoordinateListGenerator.prototype, 'generateCoordinateListPDF');

    const gen = new ComprehensiveDocumentGenerator();
    const result = await gen.generateWithTwoPass({
      ...baseData, reportData, reportOptions,
    } as any);

    // The measure pass calls generateCoordinateListPDF once with no calc
    // lookup (4th arg undefined); the render pass calls it again with the
    // accurate, shifted lookup. Find that render-pass call.
    const renderCall = genSpy.mock.calls.find((call) => call[3] !== undefined);
    expect(renderCall).toBeDefined();
    const calcPageLookup = renderCall![3] as Record<string, number>;

    const coordEnd = result.measurements!.coordinateList.endPage;
    const beaconPages = result.measurements!.beaconComparison!.pages;
    expect(beaconPages).toBeGreaterThanOrEqual(1);
    const minShiftedPage = coordEnd + beaconPages + 1;

    const lookupValues = Object.values(calcPageLookup);
    expect(lookupValues.length).toBeGreaterThan(0);
    for (const page of lookupValues) {
      expect(page).toBeGreaterThanOrEqual(minShiftedPage);
    }

    genSpy.mockRestore();
  }, 30000);
});
