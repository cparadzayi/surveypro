import { describe, it, expect } from 'vitest';
import { buildReportDataFromWorkflow, isReportDataEmpty } from '../reportDataFromWorkflow';
import type { ReportOnSurveyData } from '@/types/cadastral';

const filled: ReportOnSurveyData = {
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
      currentCoordinates: { y: 1, x: 2 },
    } as any,
  ],
  curvilinearBoundaries: { applicable: false },
  unusualOccurrences: 'Fence encroaches 0.4 m on the eastern boundary.',
};

describe('buildReportDataFromWorkflow', () => {
  it('reads the in-memory cadastral workflow state', () => {
    expect(buildReportDataFromWorkflow({ reportOnSurvey: filled })).toEqual(filled);
  });

  it('reads the backend step_data shape', () => {
    const backend = { step_data: { 'report-on-survey': { report_data: filled } } };
    expect(buildReportDataFromWorkflow(backend)).toEqual(filled);
  });

  it('prefers in-memory state when both are present', () => {
    const other = { ...filled, srNumber: 'SR 9/2026' };
    const state = {
      reportOnSurvey: filled,
      step_data: { 'report-on-survey': { report_data: other } },
    };
    expect(buildReportDataFromWorkflow(state)?.srNumber).toBe('SR 1/2026');
  });

  it('returns null when neither source is present', () => {
    expect(buildReportDataFromWorkflow({})).toBeNull();
    expect(buildReportDataFromWorkflow(null)).toBeNull();
    expect(buildReportDataFromWorkflow(undefined)).toBeNull();
  });
});

describe('isReportDataEmpty', () => {
  it('is false for data with beacons or narrative content', () => {
    expect(isReportDataEmpty(filled)).toBe(false);
  });

  it('is true for null/undefined', () => {
    expect(isReportDataEmpty(null)).toBe(true);
    expect(isReportDataEmpty(undefined)).toBe(true);
  });

  it('is true when there are no beacons, no purpose and no comments', () => {
    const empty = {
      srNumber: '',
      purpose: { type: '', reference: '' },
      surveyBasis: {
        trigStations: false, townSurveyMarks: false, officialControlPoints: false,
        previousSurvey: false, localSystem: false,
      },
      beacons: [],
      curvilinearBoundaries: { applicable: false },
      unusualOccurrences: '   ',
    } as any as ReportOnSurveyData;
    expect(isReportDataEmpty(empty)).toBe(true);
  });

  it('is false when only a purpose reference is filled in', () => {
    const partial = {
      srNumber: '',
      purpose: { type: 'private-land', reference: 'Permit 42' },
      surveyBasis: {
        trigStations: false, townSurveyMarks: false, officialControlPoints: false,
        previousSurvey: false, localSystem: false,
      },
      beacons: [],
      curvilinearBoundaries: { applicable: false },
      unusualOccurrences: '',
    } as any as ReportOnSurveyData;
    expect(isReportDataEmpty(partial)).toBe(false);
  });
});
