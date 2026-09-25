/**
 * resolveSurveyDesignation is the single source of the "Survey of" line: the
 * stands come from the digitized parcels, the township phrase from Project
 * Setup, composed with composeReportSurveyOf exactly like the DSG certificate.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/spatial', () => ({
  loadSurveyStandNames: vi.fn(async () => ['403', '404', '405']),
}));

import { resolveSurveyDesignation } from '../surveyDesignation';
import { loadSurveyStandNames } from '../../services/spatial';

beforeEach(() => {
  vi.clearAllMocks();
});

const baseContext = {
  selectedProject: { id: 99 },
  projectInfo: {
    projectId: 99,
    township: 'Brackenhurst Township',
    parentProperty: 'Stand 87 Brackenhurst Township',
    projectName: 'Brackenhurst 403-405',
  },
  surveyorInfo: { surveyOf: 'Brackenhurst Township of Stand 87 Brackenhurst Township' },
};

describe('resolveSurveyDesignation', () => {
  it('composes the full designation from the digitized stands + township phrase', async () => {
    const d = await resolveSurveyDesignation(baseContext);
    expect(loadSurveyStandNames).toHaveBeenCalledWith(99);
    expect(d.surveyOf).toBe('Stand 403-405 Brackenhurst Township of Stand 87 Brackenhurst Township');
    expect(d.standNames).toEqual(['403', '404', '405']);
    expect(d.township).toBe('Brackenhurst Township');
  });

  it('resolves the project id from projectInfo when nothing is selected', async () => {
    await resolveSurveyDesignation({
      ...baseContext,
      selectedProject: null,
      projectInfo: { ...baseContext.projectInfo, projectId: 7 },
    });
    expect(loadSurveyStandNames).toHaveBeenLastCalledWith(7);
  });

  it('appends the whole/remainder clause when one is recorded', async () => {
    const d = await resolveSurveyDesignation({
      ...baseContext,
      projectInfo: { ...baseContext.projectInfo, wholePortion: 'the remainder' },
    });
    expect(d.surveyOf).toBe(
      'Stand 403-405 Brackenhurst Township of Stand 87 Brackenhurst Township, being the remainder'
    );
  });

  it('falls back to the authored description when no project is available', async () => {
    const d = await resolveSurveyDesignation({
      selectedProject: null,
      projectInfo: null,
      surveyorInfo: { surveyOf: 'Stands 1 - 2 Test Township' },
    });
    expect(loadSurveyStandNames).not.toHaveBeenCalled();
    expect(d.surveyOf).toBe('Stands 1 - 2 Test Township');
    expect(d.standNames).toEqual([]);
  });

  it('never throws when the workflow state is missing entirely', async () => {
    const d = await resolveSurveyDesignation(null);
    expect(d.surveyOf).toBe('');
  });
});