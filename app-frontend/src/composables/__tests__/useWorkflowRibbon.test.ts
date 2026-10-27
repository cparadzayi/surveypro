import { describe, expect, it } from 'vitest'
import { useWorkflowRibbon, workflowProgressNote, workflowStepStatus } from '../useWorkflowRibbon'
import { CADASTRAL_STEPS } from '../../config/cadastralWorkflow'

const ids = Object.keys(CADASTRAL_STEPS)

describe('workflowProgressNote', () => {
  it('counts completed steps against the steps that exist', () => {
    expect(workflowProgressNote(['project_setup', 'import_csv'], ids)).toMatch(/^2 of 14 steps complete\./)
    expect(workflowProgressNote([], ids)).toMatch(/^0 of 14 steps complete\./)
  })

  it('ignores a stale id and a repeated one, so progress cannot pass the total', () => {
    expect(workflowProgressNote(['project_setup', 'project_setup', 'removed_step'], ids)).toMatch(/^1 of 14 steps complete\./)
    expect(workflowProgressNote(['a', 'b', 'c'], ['a', 'b'])).toMatch(/^2 of 2 steps complete\./)
  })

  it('still says steps may be opened in any order', () => {
    expect(workflowProgressNote([], ids)).toMatch(/any step at any time/i)
  })
})

describe('step state, in more than colour', () => {
  it('says the state in words', () => {
    expect(workflowStepStatus(false, false)).toBe('not started')
    expect(workflowStepStatus(true, false)).toBe('completed')
    expect(workflowStepStatus(false, true)).toBe('current step')
    expect(workflowStepStatus(true, true)).toBe('current step')   // being on a finished step is still "current"
  })

  it('gives each step tile a tick, a spoken status and aria-current, not just a colour', () => {
    const ribbon = useWorkflowRibbon({
      currentStep: () => 'csv-import',
      completedStepIds: () => ['project_setup'],
      stepData: () => ({}),
      isExporting: () => false,
    })
    const group = ribbon.tabs.value.find((t) => t.id === 'step')!.groups.find((g) => g.label === 'All Steps')!
    const byId = (key: string) => group.items.find((i: any) => i.id === `wf-step:${key}`) as any

    const done = byId('project-setup')
    expect(done).toMatchObject({ badge: '✓', status: 'completed', current: false })
    expect(done.title.endsWith('(completed)')).toBe(true)

    const current = byId('csv-import')
    expect(current).toMatchObject({ status: 'current step', current: true, badge: null })

    const todo = byId('field-book')
    expect(todo).toMatchObject({ status: 'not started', current: false, badge: null })
  })
})

describe('the ribbon', () => {
  it('shows the progress under "All Steps"', () => {
    const ribbon = useWorkflowRibbon({
      currentStep: () => 'csv-import',
      completedStepIds: () => ['project_setup'],
      stepData: () => ({}),
      isExporting: () => false,
    })
    const step = ribbon.tabs.value.find((t) => t.id === 'step')!
    const allSteps = step.groups.find((g) => g.label === 'All Steps')!
    expect(allSteps.note).toMatch(/^1 of 14 steps complete\./)
  })
})
