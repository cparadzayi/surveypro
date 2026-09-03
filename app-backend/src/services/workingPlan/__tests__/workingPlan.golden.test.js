import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * dxf-r12.js and working-plan.js are vendored, and this test pins their output
 * byte for byte so no well-meant reformat can drift it.
 *
 * The fixture is NO LONGER the file the module's author shipped. That file --
 * and every build of the module before 2026-09-03 -- wrote group code 370
 * (lineweight) on each LAYER entry while declaring $ACADVER = AC1009. Group 370
 * arrived with AutoCAD 2000; in an R12 file it is invalid, and AutoCAD rejects
 * the whole drawing. Lenient parsers do not: ezdxf read the broken file with
 * zero errors and zero fixes, which is precisely why this suite, the route
 * tests and the integration test all passed while the sheet would not open.
 *
 * So dxf-r12.js is now a deliberate fork of upstream by exactly that one
 * emission, and the fixture was regenerated from the corrected module
 * (32,706 -> 32,615 bytes, the 13 removed 370 pairs). Re-syncing from upstream
 * must not reintroduce it -- the invariant test below is what guards that, and
 * it is the one that matters more than the byte comparison.
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

  test('emits no group code that postdates the DXF version it declares', () => {
    // The guard for the class of bug that shipped a sheet AutoCAD would not
    // open. A byte comparison only catches drift from a known-good file; this
    // catches a NEW post-R12 code even if someone regenerates the fixture to
    // match it. 370=lineweight, 390=plot style, 100=subclass, 5/330=handles,
    // 347=material -- all R13+ or later, all invalid under $ACADVER AC1009.
    const { dxf } = generateWorkingPlan(brackenhurstSpec)
    const lines = dxf.split('\n')

    expect(lines[lines.indexOf('$ACADVER') + 2]).toBe('AC1009')

    const POST_R12 = new Set(['5', '100', '330', '347', '370', '390'])
    const offenders = new Map()
    for (let i = 0; i < lines.length - 1; i += 2) {
      const code = lines[i].trim()
      if (POST_R12.has(code)) offenders.set(code, (offenders.get(code) ?? 0) + 1)
    }
    expect(Object.fromEntries(offenders)).toEqual({})
  })

  test('picks a scale itself when asked to', () => {
    const out = generateWorkingPlan({ ...brackenhurstSpec, scale: 'auto' })
    expect(typeof out.scale).toBe('number')
    expect(out.scale).toBeGreaterThan(0)
  })
})
