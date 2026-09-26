/**
 * A `reset_step` must not leave behind results computed from the data it just
 * removed.
 *
 * The defect these cover: resetting the CSV import deleted the
 * `coordinate_points` rows and the `csv-import` step_data, but left
 * `step_data['calculations-part1']` (with its adjusted coordinates), the field
 * book, the coordinate list and the area computation in place, every one of them
 * still listed in `completed_steps`. The workflow then reported a project as far
 * along as a finalised DSG certificate while the Survey Plan map loaded zero
 * points and the plan preview returned 404 — and `can_finalize` was computed
 * against exactly those stale entries.
 */

import { describe, test, expect } from '@jest/globals'
import {
  WORKFLOW_STEP_ORDER,
  REQUIRED_STEPS,
  applyStepReset,
  canFinalize,
  canonicalStep,
  stepsInvalidatedBy
} from '../../utils/workflowReset.js'

/** A workflow_state as it looks mid-project: everything done, nothing optional missing. */
function fullyCompleteState() {
  return {
    completed_steps: [...WORKFLOW_STEP_ORDER],
    current_step: 'dsg-certificate',
    step_data: Object.fromEntries(
      WORKFLOW_STEP_ORDER.map(step => [step, { generated: true }])
    ),
    generated_documents: Object.fromEntries(
      WORKFLOW_STEP_ORDER.map(step => [step, { url: `/docs/${step}.pdf` }])
    ),
    can_finalize: true
  }
}

describe('stepsInvalidatedBy', () => {
  test('csv-import invalidates every step computed from the coordinates', () => {
    const cleared = stepsInvalidatedBy('csv-import')

    // The reported failure lived in exactly this set: calculations-part1 kept
    // 16 adjusted coordinates with zero source rows behind them.
    expect(cleared).toContain('field-book')
    expect(cleared).toContain('calculations-part1')
    expect(cleared).toContain('coordinate-list')
    expect(cleared).toContain('area-computation')
  })

  test('csv-import does not invalidate project setup, which precedes it', () => {
    expect(stepsInvalidatedBy('csv-import')).not.toContain('project-setup')
  })

  test('a mid-workflow step only invalidates itself and what follows', () => {
    const cleared = stepsInvalidatedBy('field-book')

    expect(cleared[0]).toBe('field-book')
    expect(cleared).toContain('coordinate-list')
    expect(cleared).not.toContain('csv-import')
    expect(cleared).not.toContain('project-setup')
  })

  test('the final step invalidates only itself', () => {
    expect(stepsInvalidatedBy('dsg-certificate')).toEqual(['dsg-certificate'])
  })

  test('an unknown step resets to just itself rather than the whole workflow', () => {
    // A typo in `step` must not wipe a project.
    expect(stepsInvalidatedBy('not-a-step')).toEqual(['not-a-step'])
  })
})

describe('canonicalStep', () => {
  test('folds the underscore spellings onto the hyphenated db keys', () => {
    expect(canonicalStep('import_csv')).toBe('csv-import')
    expect(canonicalStep('field_book')).toBe('field-book')
    expect(canonicalStep('calculations_part1')).toBe('calculations-part1')
  })

  test('leaves an already-canonical key alone', () => {
    expect(canonicalStep('csv-import')).toBe('csv-import')
  })
})

describe('applyStepReset', () => {
  test('drops the derived step_data a csv-import reset orphaned', () => {
    const state = fullyCompleteState()
    state.step_data['calculations-part1'] = {
      adjusted_coordinates: Array.from({ length: 16 }, (_, i) => ({ id: `A${i}` }))
    }
    state.step_data['csv-import'] = { points: [{ id: 'A1' }] }

    applyStepReset(state, 'csv-import')

    expect(state.step_data['calculations-part1']).toBeUndefined()
    expect(state.step_data['field-book']).toBeUndefined()
    expect(state.step_data['coordinate-list']).toBeUndefined()
    expect(state.step_data['area-computation']).toBeUndefined()
    expect(state.step_data['csv-import']).toBeUndefined()
  })

  test('leaves no derived step marked complete, so can_finalize cannot pass on stale work', () => {
    const state = fullyCompleteState()
    expect(canFinalize(state)).toBe(true)

    applyStepReset(state, 'csv-import')

    expect(state.completed_steps).not.toContain('calculations-part1')
    expect(state.completed_steps).not.toContain('coordinate-list')
    expect(state.completed_steps).not.toContain('dsg-certificate')
    expect(canFinalize(state)).toBe(false)
  })

  test('keeps the steps that precede the reset', () => {
    const state = fullyCompleteState()

    applyStepReset(state, 'csv-import')

    expect(state.completed_steps).toContain('project-setup')
    expect(state.step_data['project-setup']).toBeDefined()
  })

  test('clears document references for invalidated steps but leaves the files alone', () => {
    const state = fullyCompleteState()

    applyStepReset(state, 'csv-import')

    expect(state.generated_documents['field-book']).toBeUndefined()
    expect(state.generated_documents['project-setup']).toBeDefined()
  })

  test('a csv-import reset also clears a legacy import_csv key', () => {
    // Older projects carry the underscore spelling; matching on the raw string
    // left them with a half-cleared state.
    const state = fullyCompleteState()
    state.completed_steps = state.completed_steps.filter(s => s !== 'csv-import')
    state.completed_steps.push('import_csv')
    state.step_data['import_csv'] = { points: [{ id: 'A1' }] }
    state.step_data['csv-import'] = undefined

    applyStepReset(state, 'import_csv')

    expect(state.completed_steps).not.toContain('import_csv')
    expect(state.step_data['import_csv']).toBeUndefined()
  })

  test('a field-book reset keeps the imported points', () => {
    const state = fullyCompleteState()
    state.step_data['csv-import'] = { points: [{ id: 'A1' }] }

    applyStepReset(state, 'field-book')

    expect(state.step_data['csv-import']).toBeDefined()
    expect(state.completed_steps).toContain('csv-import')
    expect(state.step_data['field-book']).toBeUndefined()
  })

  test('reports the cleared steps and tolerates a half-built workflow_state', () => {
    expect(applyStepReset({}, 'csv-import')).toContain('csv-import')
    // No completed_steps / step_data keys at all: a project that has never been
    // run must not throw on reset.
    expect(() => applyStepReset({}, 'field-book')).not.toThrow()
  })
})

describe('canFinalize', () => {
  test('site calibration stays optional so projects without a GNSS report can finalize', () => {
    expect(REQUIRED_STEPS).not.toContain('site-calibration')

    const state = fullyCompleteState()
    state.completed_steps = state.completed_steps.filter(s => s !== 'site-calibration')
    state.step_data['site-calibration'] = undefined

    expect(canFinalize(state)).toBe(true)
  })
})
