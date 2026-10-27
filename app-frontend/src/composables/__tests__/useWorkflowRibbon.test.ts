import { describe, expect, it } from 'vitest'
import { useWorkflowRibbon, workflowProgressNote } from '../useWorkflowRibbon'
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
