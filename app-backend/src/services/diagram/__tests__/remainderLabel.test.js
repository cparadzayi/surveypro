import { describe, test, expect } from '@jest/globals'
import { isRemainderFeature, isOutsideFigureFeature } from '../neighbourBuffer.js'

/**
 * The remaining extent is lettered by the surveyor, as a tagged contiguous side.
 * The renderer adding its designation as well puts REM on the sheet twice.
 */
describe('isRemainderFeature', () => {
  const f = (designation) => ({ properties: { designation } })

  test('knows the abbreviations a surveyor actually writes', () => {
    for (const n of ['REM', 'Rem.', 'Rem./', 'rem', 'Remainder', 'Remaining Extent']) {
      expect(isRemainderFeature(f(n))).toBe(true)
    }
  })

  test('still knows the app’s own wording', () => {
    // Whatever isOutsideFigureFeature accepted must keep working: this widens
    // the test, it does not replace it.
    const of = { properties: { designation: 'Outside Figure' } }
    expect(isOutsideFigureFeature(of)).toBe(true)
    expect(isRemainderFeature(of)).toBe(true)
    expect(isRemainderFeature({ properties: { is_outside_figure: true } })).toBe(true)
  })

  test('leaves a stand whose name merely begins with REM alone', () => {
    // Anchored and bounded, so REMBRANDT is a stand and keeps its label.
    for (const n of ['REMBRANDT', 'Remus', 'REM 4', '405', 'Stand REM']) {
      expect(isRemainderFeature(f(n))).toBe(false)
    }
  })

  test('reads the stand number as well as the designation', () => {
    expect(isRemainderFeature({ properties: { stand: 'REM' } })).toBe(true)
  })

  test('is quiet on a feature with nothing to go on', () => {
    expect(isRemainderFeature(undefined)).toBe(false)
    expect(isRemainderFeature({})).toBe(false)
    expect(isRemainderFeature({ properties: { designation: null } })).toBe(false)
  })
})
