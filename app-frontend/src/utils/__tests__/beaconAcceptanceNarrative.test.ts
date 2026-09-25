import { describe, it, expect } from 'vitest';
import type { ReportOnSurveyData, FoundBeacon } from '@/types/cadastral';
import {
  buildFoundBeaconsNarrative,
  isReferenceMark,
  joinNatural,
  isFoundBeaconRejected,
} from '../beaconAcceptanceNarrative';

function beacon(id: string, overrides: Partial<FoundBeacon> = {}): FoundBeacon {
  const adopted = overrides.adopted ?? true;
  return {
    beaconId: id,
    status: 'found',
    currentCoordinates: { y: 0, x: 0 },
    adopted,
    ...overrides,
  };
}

function reportWith(beacons: FoundBeacon[], extra: Partial<ReportOnSurveyData> = {}): ReportOnSurveyData {
  return {
    srNumber: '',
    purpose: { type: 'private-land', reference: '' },
    surveyBasis: { trigStations: false, townSurveyMarks: false, officialControlPoints: false, previousSurvey: false, localSystem: false },
    beacons,
    curvilinearBoundaries: { applicable: false },
    unusualOccurrences: '',
    ...extra,
  } as ReportOnSurveyData;
}

const sampleBeacons: FoundBeacon[] = [
  beacon('86B'),
  beacon('86C'),
  beacon('87A'),
  beacon('87B'),
  beacon('87C'),
  beacon('87D', { adopted: false, discrepancy: { dy: 0, dx: 0, distance: 0.15, withinTolerance: false } }),
  beacon('88X2'),
  beacon('RM15', { adopted: false, discrepancy: { dy: 0, dx: 0, distance: 0.2, withinTolerance: false } }),
  beacon('RM16'),
];

describe('buildFoundBeaconsNarrative', () => {
  it('composes the sample acceptance clause with exceptions and SR reference', () => {
    const narrative = buildFoundBeaconsNarrative(
      reportWith(sampleBeacons, {
        beaconComparison: { method: 'tabulation', currentSRNumber: 'SR X/2026', originalSRNumber: 'SR 11418', toleranceThreshold: 0 },
      }),
    );

    expect(narrative.foundSentence).toBe(
      'Beacons 86B, 86C, 87A, 87B, 87C, 87D, 88X2 and reference marks RM15 and RM16 from previous survey (SR 11418), were found.',
    );
    expect(narrative.comparisonSentence).toBe(
      'After comparison, positions of all the found beacons/stations except 87D and RM15 were accepted after the comparison of coordinates.',
    );
    expect(narrative.adoptionSentence).toBe(
      'The coordinates of all found and accepted beacons were adopted as final coordinates.',
    );
    expect(narrative.rejectedFound.map((b) => b.beaconId)).toEqual(['87D', 'RM15']);
    expect(narrative.acceptedFound.map((b) => b.beaconId).join(',')).toBe('86B,86C,87A,87B,87C,88X2,RM16');
  });

  it('drops the except clause when every found beacon is accepted', () => {
    const narrative = buildFoundBeaconsNarrative(reportWith([
      beacon('86B'),
      beacon('RM16'),
    ]));
    expect(narrative.rejectedFound).toHaveLength(0);
    expect(narrative.comparisonSentence).toBe(
      'After comparison, positions of all the found beacons/stations were accepted after the comparison of coordinates.',
    );
  });

  it('omits "from previous survey" when no SR number is known', () => {
    const narrative = buildFoundBeaconsNarrative(reportWith([beacon('86B')]));
    expect(narrative.foundSentence).toBe('Beacon 86B, was found.');
    expect(narrative.fullText).toContain('adopted as final coordinates');
  });

  it('falls back to the beacon-level srNumber when the config has none', () => {
    const narrative = buildFoundBeaconsNarrative(reportWith([
      beacon('86B', { originalData: { coordinates: { y: 1, x: 1 }, srNumber: 'SR 21/2016', source: 'previous-survey' } }),
    ]));
    expect(narrative.foundSentence).toBe('Beacon 86B from previous survey (SR 21/2016), was found.');
  });

  it('handles a reference-mark-only site', () => {
    const narrative = buildFoundBeaconsNarrative(reportWith([beacon('RM1'), beacon('RM2')]));
    expect(narrative.foundSentence).toBe('reference marks RM1 and RM2, were found.');
  });

  it('keeps untouched beacons as accepted and honours rejectionReason', () => {
    const untouched = beacon('87D', { adopted: undefined as any });
    const flagged = beacon('88X2', { adopted: undefined as any, rejectionReason: 'beacon disturbed' });
    const narrative = buildFoundBeaconsNarrative(reportWith([untouched, flagged]));
    expect(isFoundBeaconRejected(untouched)).toBe(false);
    expect(isFoundBeaconRejected(flagged)).toBe(true);
    expect(narrative.acceptedFound.map((b) => b.beaconId)).toEqual(['87D']);
    expect(narrative.rejectedFound.map((b) => b.beaconId)).toEqual(['88X2']);
  });
});

describe('helpers', () => {
  it('joinNatural joins 1, 2 and 3+ items correctly', () => {
    expect(joinNatural([])).toBe('');
    expect(joinNatural(['A'])).toBe('A');
    expect(joinNatural(['A', 'B'])).toBe('A and B');
    expect(joinNatural(['A', 'B', 'C'])).toBe('A, B, and C');
    expect(joinNatural(['A', 'B', 'C', 'D'])).toBe('A, B, C, and D');
  });

  it('isReferenceMark recognises RM ids only', () => {
    expect(isReferenceMark('RM15')).toBe(true);
    expect(isReferenceMark('rm-3')).toBe(true);
    expect(isReferenceMark('  RM16 ')).toBe(true);
    expect(isReferenceMark('86B')).toBe(false);
    expect(isReferenceMark('TRIG 176/P')).toBe(false);
  });
});