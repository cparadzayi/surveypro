import { describe, test, expect } from '@jest/globals'
import { SI727_SHEET_SIZES } from '../../utils/si727Constants.js'
import { SHEET_ORDER, nextSheetUp } from '../../../../app-shared/sheetEscalation.js'

describe('General Plan sheet sizes use the real SI 727 Section 62(1) dimensions', () => {
  test('si727Constants.SI727_SHEET_SIZES has the three real sizes, not the ISO substitutes', () => {
    expect(SI727_SHEET_SIZES).toEqual([
      { name: 'SI727_500x400',  width: 500,  height: 400,  area: 200000 },
      { name: 'SI727_800x500',  width: 800,  height: 500,  area: 400000 },
      { name: 'SI727_1000x800', width: 1000, height: 800,  area: 800000 },
    ])
  })

  test('sheetEscalation SHEET_ORDER matches the new names, same relative order', () => {
    expect(SHEET_ORDER).toEqual(['SI727_500x400', 'SI727_800x500', 'SI727_1000x800'])
    expect(nextSheetUp('SI727_500x400')).toBe('SI727_800x500')
    expect(nextSheetUp('SI727_800x500')).toBe('SI727_1000x800')
    expect(nextSheetUp('SI727_1000x800')).toBeNull()
  })
})
