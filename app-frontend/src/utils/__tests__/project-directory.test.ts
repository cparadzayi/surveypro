import { describe, test, expect } from 'vitest'
import {
  getProjectDirectoryStructure,
  generateDefaultWorkingDirectory,
  planTypeOutputSubdir,
} from '../project-directory'

describe('getProjectDirectoryStructure', () => {
  test('includes the new plan subfolders under output/', () => {
    const s = getProjectDirectoryStructure('Proj')
    expect(s.diagrams).toBe('Proj/output/diagrams')
    expect(s.generalPlans).toBe('Proj/output/general-plans')
    expect(s.workingPlans).toBe('Proj/output/working-plans')
    expect(s.surveyRecord).toBe('Proj/output/survey-record')
  })
})

describe('generateDefaultWorkingDirectory', () => {
  test('nests under Surveyors/<surveyor>/ with no date suffix', () => {
    expect(generateDefaultWorkingDirectory('Erf 5', 'Harare', 'John Doe'))
      .toBe('Documents/SurveyPro/Surveyors/John_Doe/Erf_5_Harare')
  })
  test('falls back to Unknown_Surveyor when the surveyor is missing', () => {
    expect(generateDefaultWorkingDirectory('Erf 5', 'Harare'))
      .toBe('Documents/SurveyPro/Surveyors/Unknown_Surveyor/Erf_5_Harare')
  })
  test('strips filesystem-illegal characters from the surveyor name', () => {
    expect(generateDefaultWorkingDirectory('Erf 5', undefined, 'A/B:C*'))
      .toBe('Documents/SurveyPro/Surveyors/ABC/Erf_5')
  })
})

describe('planTypeOutputSubdir', () => {
  test('maps each plan type to its output subfolder', () => {
    expect(planTypeOutputSubdir('diagram')).toBe('diagrams')
    expect(planTypeOutputSubdir('general-undeveloped')).toBe('general-plans')
    expect(planTypeOutputSubdir('general-developed')).toBe('general-plans')
    expect(planTypeOutputSubdir('working-plan')).toBe('working-plans')
    expect(planTypeOutputSubdir('survey-record')).toBe('survey-record')
    expect(planTypeOutputSubdir('unknown')).toBe('output')
  })
})
