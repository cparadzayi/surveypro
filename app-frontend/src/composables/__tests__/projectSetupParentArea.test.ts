/**
 * The registered parent area is a project-detail field like township or
 * parent property: it has to survive emit -> workflow -> project update ->
 * reload. A field added to the form but not emitted, sent or restored looks
 * exactly like a save that succeeded, so pin each link of that chain.
 */

import { readFileSync } from 'node:fs'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../services/api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import api from '../../services/api'
import { useSurveyors } from '../useSurveyors'

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

describe('project setup: parent area reaches the project record', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sends parentArea through the shared update client', async () => {
    (api.put as any).mockResolvedValue({ data: { ok: true } })
    ;(api.get as any).mockResolvedValue({ data: { ok: true, projects: [] } })

    const { updateSurveyProject } = useSurveyors()
    await updateSurveyProject(7, { parentArea: 1234.5 })

    expect(api.put).toHaveBeenCalledWith('/survey-projects/7', { parentArea: 1234.5 })
  })

  it('ProjectSetupView both loads it back and emits it', () => {
    const text = source('../../views/modules/cadastral-standard/ProjectSetupView.vue')
    expect(text).toContain('setupData.value.parentArea = project.parent_area ?? null')
    expect(text).toContain('parentArea: setupData.value.parentArea,')
  })

  it('CadastralStandardView sends it to the API and to the saved step', () => {
    const text = source('../../views/modules/cadastral-standard/CadastralStandardView.vue')
    expect(text).toContain('workflowState.projectInfo.parentArea = setupData.parentArea ?? null;')
    expect(text).toContain('parentArea: setupData.parentArea,')
    expect(text).toContain('parent_area: setupData.parentArea,')
  })

  it('the workflow restores it and the plan reads it from the project', () => {
    const workflow = source('../useCadastralWorkflow.ts')
    expect(workflow).toContain('workflowState.projectInfo.parentArea = setupData.parent_area')

    const plan = source('../../views/modules/cadastral-standard/SurveyPlanViewNew.vue')
    expect(plan).toContain('parentArea: project?.parent_area ??')
  })
})
