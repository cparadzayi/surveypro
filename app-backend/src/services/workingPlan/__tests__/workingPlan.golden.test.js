import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * dxf-r12.js and working-plan.js are vendored VERBATIM and must stay that way.
 * This test is the enforcement: it compares the rendered sheet against the
 * shipped reference byte for byte, so any edit to the module -- including a
 * well-meant reformat -- fails here immediately and specifically.
 */
describe('generateWorkingPlan — golden', () => {
  const reference = readFileSync(join(here, 'fixtures', 'Working_Plan_reference.dxf'), 'utf8')

  test('reproduces the reference sheet byte for byte', () => {
    const out = generateWorkingPlan(brackenhurstSpec)
    expect(out.dxf.length).toBe(reference.length)
    expect(out.dxf).toBe(reference)
  })

  test('reports the scale and grid the sheet was actually drawn at', () => {
    const out = generateWorkingPlan(brackenhurstSpec)
    expect(out.scale).toBe(2000)
    expect(out.gridInterval.e).toBeGreaterThan(0)
    expect(out.gridInterval.n).toBeGreaterThan(0)
  })

  test('computes an area for every parcel in the spec', () => {
    const out = generateWorkingPlan(brackenhurstSpec)
    expect(Object.keys(out.areas).sort()).toEqual(['403', '404', '405', 'Rem./'])
    for (const area of Object.values(out.areas)) {
      expect(area).toBeGreaterThan(0)
    }
  })

  test('names the offending beacon when a ring references one that does not exist', () => {
    // The surveyor can act on "unknown beacon SD9"; they cannot act on
    // "Cannot read properties of undefined".
    const spec = {
      ...brackenhurstSpec,
      parcels: [{ label: '405', ring: ['SD4', 'SD9', 'SD5'] }],
      existing: [],
      roads: [],
    }
    expect(() => generateWorkingPlan(spec)).toThrow('generateWorkingPlan: unknown beacon "SD9"')
  })

  test('picks a scale itself when asked to', () => {
    const out = generateWorkingPlan({ ...brackenhurstSpec, scale: 'auto' })
    expect(typeof out.scale).toBe('number')
    expect(out.scale).toBeGreaterThan(0)
  })
})
