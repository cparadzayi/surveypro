import { describe, expect, it } from 'vitest'
import { projectProgress, WORKFLOW_STEPS } from '../projectProgress'

describe('projectProgress', () => {
  it('a project that has not started is 0 of 14, next step Project Setup', () => {
    expect(projectProgress(null)).toEqual({ done: 0, total: 14, next: 'Project Setup' })
    expect(projectProgress({})).toEqual({ done: 0, total: 14, next: 'Project Setup' })
  })

  it('counts completed steps and names the first one still to do, in workflow order', () => {
    const p = projectProgress({ completed_steps: ['project-setup', 'csv-import', 'field-book'] })
    expect(p).toEqual({ done: 3, total: 14, next: 'Site Calibration' })
  })

  it('reads the underscore spellings older projects were saved with', () => {
    const p = projectProgress({ completed_steps: ['project_setup', 'import_csv', 'control_point_selection'] })
    expect(p.done).toBe(3)
    expect(p.next).toBe('Site Calibration')
  })

  it('counts a step once however many spellings are present, and ignores unknown ones', () => {
    expect(projectProgress({ completed_steps: ['field-book', 'field_book', 'not-a-step', 7, null] }).done).toBe(1)
  })

  it('a finished project has no next step', () => {
    expect(projectProgress({ completed_steps: WORKFLOW_STEPS.map((s) => s.id) })).toEqual({ done: 14, total: 14, next: null })
  })

  it('accepts the state as JSON text and survives garbage', () => {
    expect(projectProgress(JSON.stringify({ completed_steps: ['project-setup'] })).done).toBe(1)
    expect(projectProgress('{not json').done).toBe(0)
    expect(projectProgress({ completed_steps: 'project-setup' }).done).toBe(0)
  })
})
