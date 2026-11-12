import { describe, it, expect, vi } from 'vitest'

vi.mock('../../services/spatial', () => ({
  loadSurveyStandNames: vi.fn(async () => ['1343', '1344', '1345', '1694']),
}))

import { resolveSurveyDesignation } from '../surveyDesignation'

// The record generation (SurveyPlanMapView) holds the RAW object fetched from /survey-projects/:id/workflow:
// it has step_data, but no projectInfo (no project id, township or parent property) and no surveyorInfo.
// Resolving the designation from it composed nothing, and the Report on Survey in the record printed
// "Survey of : N/A" while the standalone report, resolved from the live state, printed the stands.
describe('the survey designation of the record generation', () => {
  const rawWorkflow = { step_data: { 'project-setup': {} }, current_step: 'survey-plan' } as any

  it('is empty when resolved from the raw saved-workflow object (the fault)', async () => {
    const d = await resolveSurveyDesignation(rawWorkflow)
    expect(d.standNames).toEqual([])
    expect(d.surveyOf).toBe('')
  })

  it('is composed when resolved from the view\'s own project', async () => {
    const d = await resolveSurveyDesignation({
      projectInfo: {
        projectId: 3,
        township: 'Sebanga Park Township',
        parentProperty: 'Sebanga Park of Sebanga Poort',
        wholePortion: 'the whole',
        projectName: 'scenic 1',
      },
      surveyorInfo: { surveyOf: 'Sebanga Park Township of Sebanga Park of Sebanga Poort' },
    })
    expect(d.standNames).toEqual(['1343', '1344', '1345', '1694'])
    expect(d.surveyOf).toMatch(/^Stands 1343-1345, 1694 Sebanga Park Township of Sebanga Park of Sebanga Poort/i)
  })
})
