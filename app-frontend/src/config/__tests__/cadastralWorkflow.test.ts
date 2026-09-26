/**
 * The workflow registry, as the rest of the app consumes it.
 *
 * Two things are easy to break and invisible until a surveyor's screen is wrong:
 * the `order` values (getNextStep/getPreviousStep look steps up as `order ± 1`,
 * so a gap silently breaks "next" for every step after it) and the db key
 * mapping (the stepper compares dbKeys, the documents compare step ids, and the
 * database stores dbKeys).
 */

import { describe, it, expect } from 'vitest'
import {
  CADASTRAL_STEPS,
  getNextStep,
  getPreviousStep,
  getWorkflowSteps,
  getStepActions,
  getStepByDbKey,
  getStepStatus,
  canAccessStep,
  dbKeyToStepId,
  stepIdToDbKey
} from '../cadastralWorkflow'

const steps = getWorkflowSteps()

describe('step ordering', () => {
  it('runs contiguously from 0, so order ± 1 always finds a neighbour', () => {
    // A duplicate or gap here is what makes getNextStep return null.
    expect(steps.map(s => s.order)).toEqual(steps.map((_, i) => i))
  })

  it('places the site calibration directly after the coordinate import', () => {
    const order = steps.map(s => s.id)
    expect(order.indexOf('site_calibration')).toBe(order.indexOf('import_csv') + 1)
  })

  it('walks forward and back through every step', () => {
    for (let i = 1; i < steps.length; i++) {
      expect(getNextStep(steps[i - 1].id)?.id).toBe(steps[i].id)
      expect(getPreviousStep(steps[i].id)?.id).toBe(steps[i - 1].id)
    }
  })

  it('has no next step after the certificate and no previous before setup', () => {
    expect(getNextStep('dsg_certificate')).toBeNull()
    expect(getPreviousStep('project_setup')).toBeNull()
  })
})

describe('site calibration step', () => {
  const step = CADASTRAL_STEPS.site_calibration

  it('is its own step rather than a panel on the CSV import', () => {
    expect(step.dbKey).toBe('site-calibration')
    expect(step.id).not.toBe(CADASTRAL_STEPS.import_csv.id)
  })

  it('requires nothing, since a calibration does not depend on the coordinates', () => {
    // A surveyor may attach a Trimble report before, after or without a CSV.
    expect(step.requires).toEqual([])
    expect(canAccessStep('site_calibration', []).allowed).toBe(true)
  })

  it('is reachable from the import step and leads on to control points', () => {
    expect(getNextStep('import_csv')?.id).toBe('site_calibration')
    expect(getNextStep('site_calibration')?.id).toBe('control_point_selection')
  })
})

describe('db key mapping', () => {
  it('round-trips every step id through its db key', () => {
    for (const step of steps) {
      expect(dbKeyToStepId(step.dbKey)).toBe(step.id)
      expect(stepIdToDbKey(step.id)).toBe(step.dbKey)
      expect(getStepByDbKey(step.dbKey)?.id).toBe(step.id)
    }
  })

  it('leaves an unmapped db key alone', () => {
    expect(dbKeyToStepId('not-a-step')).toBe('not-a-step')
  })
})

describe('step status', () => {
  it('reports a completed step as completed', () => {
    expect(getStepStatus('site_calibration', ['site_calibration'], 'field-book')).toBe('completed')
  })

  it('reports the current step as active', () => {
    expect(getStepStatus('site_calibration', [], 'site-calibration')).toBe('active')
  })

  it('locks a step whose prerequisites are unmet', () => {
    expect(getStepStatus('field_book', [], 'csv-import')).toBe('locked')
    expect(canAccessStep('field_book', []).allowed).toBe(false)
  })
})

describe('step actions', () => {
  it('offers Start on a step with no data', () => {
    expect(getStepActions('site_calibration', []).map(a => a.action)).toContain('start')
  })

  it('offers Proceed to the next step once it is done', () => {
    const labels = getStepActions('site_calibration', ['site_calibration'])
      .map(a => a.label)

    expect(labels).toContain('Proceed to Control Point Selection')
  })

  it('offers no Download PDF, because the step stores data rather than rendering a sheet', () => {
    const actions = getStepActions('site_calibration', ['site_calibration'], true)
    expect(actions.map(a => a.label)).not.toContain('Download PDF')
  })
})
