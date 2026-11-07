import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan, PAPER, PRINT_MARGIN_MM } from '../working-plan.js'
import { generalPlanSpec } from './fixtures/generalPlanSpec.js'

/** A square figure `m` metres across, as one stand. */
const square = (m, extra = {}) => {
  const B = (name, X, Y) => ({ name, X, Y, symbol: 'placed', label: 'auto' })
  return {
    scale: 'auto',
    beacons: [B('Q1', 2144000, -85700), B('Q2', 2144000 + m, -85700), B('Q3', 2144000 + m, -85700 + m), B('Q4', 2144000, -85700 + m)],
    parcels: [{ label: '404', ring: ['Q1', 'Q2', 'Q3', 'Q4'] }],
    title: ['WORKING PLAN OF', 'Stand 404'],
    certificate: { line1: 'Surveyed by me,', line2: 'Land Surveyor' },
    approvalBox: true,
    ...extra,
  }
}

/** Where every beacon name lands on the sheet, in paper mm. */
const beaconMm = (out) => out.model.doc.ops
  .filter((o) => o.t === 'text' && o.layer === 'BEACON-TEXT')
  .map((o) => [((o.at[0] - out.model.originE) / out.model.scale) * 1000, ((out.model.originN - o.at[1]) / out.model.scale) * 1000])

describe('which paper a working plan is drawn on', () => {
  test('a figure that fits 1:2500 stays on A4', () => {
    const out = generateWorkingPlan(square(200))
    expect(out.sheetSize).toBe('A4')
    expect(out.scale).toBe(2500)
    expect(out.escalation).toBeUndefined()
    expect([out.sheetWidthMm, out.sheetHeightMm]).toEqual([297, 210])
  })

  test('a figure that would need 1:3000 on A4 goes to A3 so it can be plotted at 1:2500', () => {
    const onA4 = generateWorkingPlan(square(350, { sheetSize: 'A4' }))
    expect(onA4.scale).toBeGreaterThan(2500)           // the old answer: the scale moves
    const out = generateWorkingPlan(square(350))
    expect(out.sheetSize).toBe('A3')
    expect(out.scale).toBe(2500)
    expect([out.sheetWidthMm, out.sheetHeightMm]).toEqual([420, 297])
    expect(out.escalation).toMatchObject({ from: 'A4', to: 'A3', reached: true, a4Scale: onA4.scale, scale: 2500 })
    expect(out.escalation.reason).toMatch(/A3.*1:2500/)
  })

  test('everything on the A3 sheet stands inside its neat line', () => {
    const out = generateWorkingPlan(square(350))
    for (const [x, y] of beaconMm(out)) {
      expect(x).toBeGreaterThan(PRINT_MARGIN_MM)
      expect(x).toBeLessThan(420 - PRINT_MARGIN_MM)
      expect(y).toBeGreaterThan(PRINT_MARGIN_MM)
      expect(y).toBeLessThan(297 - PRINT_MARGIN_MM)
    }
  })

  test('a figure too big for 1:2500 even on A3 is drawn on A3 at the finest scale it allows, and says so', () => {
    const out = generateWorkingPlan(square(900))
    const onA4 = generateWorkingPlan(square(900, { sheetSize: 'A4' }))
    expect(out.sheetSize).toBe('A3')
    expect(out.scale).toBeGreaterThan(2500)
    expect(out.scale).toBeLessThan(onA4.scale)
    expect(out.escalation.reached).toBe(false)
    expect(out.escalation.reason).toMatch(/finest scale/)
  })

  test('the way up is kept: a portrait plan goes to portrait A3', () => {
    const out = generateWorkingPlan(square(350, { orientation: 'portrait' }))
    expect(out.sheetSize).toBe('A3')
    expect(out.orientation).toBe('portrait')
    expect([out.sheetWidthMm, out.sheetHeightMm]).toEqual([297, 420])
  })

  test("a plan that names its paper keeps it: A4 asked for, A4 drawn, whatever the scale", () => {
    const out = generateWorkingPlan(square(350, { sheetSize: 'A4' }))
    expect(out.sheetSize).toBe('A4')
    expect(out.escalation).toBeUndefined()
  })

  test('a plan can ask for A3 outright', () => {
    const out = generateWorkingPlan(square(100, { sheetSize: 'A3' }))
    expect(out.sheetSize).toBe('A3')
    expect(out.scale).toBe(2500)
  })

  test('a fixed scale is the surveyor’s instruction, and the paper does not move for it', () => {
    const out = generateWorkingPlan(square(350, { scale: 5000 }))
    expect(out.sheetSize).toBe('A4')
    expect(out.scale).toBe(5000)
  })

  test("the General Plan's working plan escalates too, and stays portrait", () => {
    // The outside figure alone, spread until it no longer fits 1:2500 beside the table on A4.
    const spec = generalPlanSpec()
    const stretched = { ...spec, beacons: spec.beacons.map((b) => ({ ...b, X: 2247500 + (b.X - 2247500) * 1.5, Y: 97600 + (b.Y - 97600) * 1.5 })) }
    const out = generateWorkingPlan(stretched)
    expect(out.orientation).toBe('portrait')
    expect(out.sheetSize).toBe('A3')
    expect(out.scale).toBe(2500)
    expect([out.sheetWidthMm, out.sheetHeightMm]).toEqual([297, 420])
    expect(out.partyWallRows).toBe(56)
  })

  test('the paper table is what the sheets are drawn from', () => {
    expect(PAPER.A3.landscape).toEqual({ width: 420, height: 297 })
    expect(PAPER.A4.portrait).toEqual({ width: 210, height: 297 })
  })
})
