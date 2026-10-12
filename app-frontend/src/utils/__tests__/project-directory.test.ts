import { describe, test, expect, vi, beforeEach } from 'vitest'
vi.mock('../../services/api', () => ({ default: { get: vi.fn() } }))
import api from '../../services/api'
import {
  getSystemHomeDirectory, primeHomeDirectory, forgetHomeDirectory, resolveToAbsolutePath, makeAbsolutePath,
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
    expect(s.calibration).toBe('Proj/output/calibration')
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

describe('the home directory the server reports', () => {
  beforeEach(() => { forgetHomeDirectory(); (api.get as any).mockReset() })

  test('builds paths from what the server says once it has been asked', async () => {
    const home = 'C:' + String.fromCharCode(92) + 'Users' + String.fromCharCode(92) + 'Dr Paradzayi'   // the server answers with backslashes
    ;(api.get as any).mockResolvedValue({ data: { ok: true, system: { homeDirectory: home } } })
    await primeHomeDirectory()
    expect(resolveToAbsolutePath('Documents/SurveyPro/x')).toBe('C:/Users/Dr Paradzayi/Documents/SurveyPro/x')
    expect(makeAbsolutePath('Documents/SurveyPro/x')).toBe(home + '/Documents/SurveyPro/x')
  })

  test('does not remember a guess when the server could not be asked', async () => {
    ;(api.get as any).mockRejectedValueOnce(new Error('offline'))
    expect(await getSystemHomeDirectory()).toBe('C:/Users/User')          // this call only
    ;(api.get as any).mockResolvedValueOnce({ data: { ok: true, system: { homeDirectory: 'D:/Home/Pat' } } })
    expect(await getSystemHomeDirectory()).toBe('D:/Home/Pat')            // the next call asks again
  })

  test('priming never throws', async () => {
    ;(api.get as any).mockRejectedValue(new Error('offline'))
    await expect(primeHomeDirectory()).resolves.toBeUndefined()
  })
})
