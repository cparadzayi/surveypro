import { describe, it, expect, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ComprehensiveDocumentGenerator } from '../comprehensive-document';

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

describe('generateWithTwoPass — section blobs', () => {
  beforeEach(() => {
    // CoordinateListGenerator reads useSurveyLookupStore(); mirror main.ts's app.use(createPinia()).
    setActivePinia(createPinia());
  });

  it('returns non-empty cover, field book, coordinate list, and calculations blobs', async () => {
    const gen = new ComprehensiveDocumentGenerator();
    const result = await gen.generateWithTwoPass({
      projectInfo, surveyorInfo,
      fieldBookObservations: [],
      surveyPoints, adjustedCoordinates,
      projectControlPoints: [], duplicateAnalyses: [], parcels,
    } as any);
    for (const key of ['cover', 'fieldBook', 'coordinateList', 'calculations'] as const) {
      expect(result.sections?.[key]).toBeInstanceOf(Blob);
      expect(result.sections?.[key].size).toBeGreaterThan(0);
    }
  }, 30000);
});
