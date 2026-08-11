import { describe, test, expect } from '@jest/globals'
import { SI727_GENERAL_PLAN_SHEET_SIZES, findSheetSize } from '../../../../app-shared/si727SheetSizes.js'

describe('SI727_GENERAL_PLAN_SHEET_SIZES', () => {
  test('has exactly the three SI 727 Section 62(1) prescribed sizes, smallest to largest', () => {
    expect(SI727_GENERAL_PLAN_SHEET_SIZES).toEqual([
      { name: 'SI727_500x400',  width: 500,  height: 400,  area: 200000 },
      { name: 'SI727_800x500',  width: 800,  height: 500,  area: 400000 },
      { name: 'SI727_1000x800', width: 1000, height: 800,  area: 800000 },
    ])
  })

  test('every entry has area === width * height', () => {
    for (const s of SI727_GENERAL_PLAN_SHEET_SIZES) {
      expect(s.area).toBe(s.width * s.height)
    }
  })

  test('every entry is landscape (width > height)', () => {
    for (const s of SI727_GENERAL_PLAN_SHEET_SIZES) {
      expect(s.width).toBeGreaterThan(s.height)
    }
  })
})

describe('findSheetSize', () => {
  test('returns the matching entry by name', () => {
    expect(findSheetSize('SI727_800x500')).toEqual({ name: 'SI727_800x500', width: 800, height: 500, area: 400000 })
  })

  test('returns undefined for an unknown name', () => {
    expect(findSheetSize('ISO_A2')).toBeUndefined()
    expect(findSheetSize('nope')).toBeUndefined()
  })
})
