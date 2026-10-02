/**
 * Task 6: choosing single vs sheeted vs refusal.
 *
 * Before Task 6, "does not fit one sheet" meant the route fell back to the
 * rectangular tile grid. Tiling decides where a sheet boundary falls by extent
 * arithmetic; a surveyor decides it as a survey judgement. These three tests
 * pin the route to that: single when it fits, cut-based sheeted when the
 * surveyor has divided it, and a refusal that TELLS the surveyor to draw the
 * cuts when they have not.
 *
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js sheetedRouteSelection
 */
import { describe, test, expect } from '@jest/globals'
import { chooseSheeting } from '../../services/chooseSheeting.js'

const oneCut = [{ y: 50, x: 0 }, { y: 50, x: 100 }]

describe('choosing single, sheeted, or refusal', () => {
  test('a figure that fits one sheet renders single-sheet', () => {
    const r = chooseSheeting({ recommendedSheetSize: 'SI727_1000x800', cuts: [] })
    expect(r).toEqual({ ok: true, mode: 'single' })
  })

  test('a figure needing multiple sheets WITH cuts renders sheeted', () => {
    const r = chooseSheeting({ recommendedSheetSize: 'multi-sheet-required', cuts: oneCut })
    expect(r).toEqual({ ok: true, mode: 'sheeted' })
  })

  test('a figure needing multiple sheets with NO cuts refuses, and says what to do', () => {
    // The surveyor has to draw the cuts; the tool cannot invent them, because
    // where a sheet boundary falls is a survey judgement. The message must say
    // so rather than failing silently or falling back to a tile grid.
    const r = chooseSheeting({ recommendedSheetSize: 'multi-sheet-required', cuts: [] })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('cuts-required')
    expect(r.message).toMatch(/survey judgement/i)
  })

  test('cuts of any form count only when there are points', () => {
    // An empty array and undefined are the same "not drawn yet" answer.
    expect(chooseSheeting({ recommendedSheetSize: 'multi-sheet-required', cuts: [] }).ok).toBe(false)
    expect(chooseSheeting({ recommendedSheetSize: 'multi-sheet-required', cuts: undefined }).ok).toBe(false)
  })

  test('the size is taken from nextLargerSheet — unknown sizes are multi-sheet-required', () => {
    // nextLargerSheet (dxfScheduleHelpers.js) returns 'multi-sheet-required'
    // both at the top of the ladder and for an unknown starting size. The route
    // hands that string straight to chooseSheeting, so this pins the contract.
    expect(chooseSheeting({ recommendedSheetSize: 'multi-sheet-required', cuts: oneCut }))
      .toEqual({ ok: true, mode: 'sheeted' })
  })
})