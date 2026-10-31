import { describe, test, expect } from '@jest/globals'
import { gpOfficeCode, GP_OFFICE_CODES, SI727_GENERAL_PLAN_SHEET_SIZES } from '../../../../app-shared/si727SheetSizes.js'
import { generalPlanMarginFooter } from '../../utils/si727Constants.js'
import { gpSheetNoFor, sheetMetadata } from '../sheetPayloadGeometry.js'
import { generateDXF } from '../dxfGenerator.js'

describe('Surveyor-General reference code by sheet size', () => {
  test('BCT smallest, BCG medium, BDG largest', () => {
    expect(gpOfficeCode('SI727_500x400')).toBe('BCT')
    expect(gpOfficeCode('SI727_800x500')).toBe('BCG')
    expect(gpOfficeCode('SI727_1000x800')).toBe('BDG')
  })
  test('covers exactly the three prescribed sizes, smallest to largest', () => {
    expect(SI727_GENERAL_PLAN_SHEET_SIZES.map((s) => GP_OFFICE_CODES[s.name])).toEqual(['BCT', 'BCG', 'BDG'])
  })
  test('accepts the space spelling and says nothing for an unknown size', () => {
    expect(gpOfficeCode('SI727 800x500')).toBe('BCG')
    expect(gpOfficeCode('A4')).toBe('')
    expect(gpOfficeCode(undefined)).toBe('')
  })
})

describe('the margin footer', () => {
  test('no numbers yet: the blanks are kept, the left one already carrying the sheet\'s code', () => {
    const f = generalPlanMarginFooter({ sheetName: 'SI727_800x500' })
    expect(f.left).toBe('BCG .......')
    expect(f.center).toBe('S.R.')
    expect(f.right).toMatch(/^COMPILATION \.+$/)
  })
  test('numbers entered: code + number, S.R., compilation', () => {
    expect(generalPlanMarginFooter({
      sheetName: 'SI727_1000x800', gpSheetNo: ' 44/2026 ', srNo: '156/2026', compilation: '1827C4,D3',
    })).toEqual({ left: 'BDG 44/2026', center: 'S.R. 156/2026', right: 'COMPILATION 1827C4,D3' })
  })
  test('an unknown size falls back to the generic blank, never a wrong code', () => {
    expect(generalPlanMarginFooter({ sheetName: 'A4', gpSheetNo: '9' }).left).toMatch(/^B\.\.\.|9$/)
    expect(generalPlanMarginFooter({ sheetName: 'A4' }).left).toBe('B...')
  })
})

describe('numbers are per sheet', () => {
  test('each sheet reads its own number; a single-sheet plan is sheet 1', () => {
    const m = { gpSheetNumbers: { 1: '10/2026', 2: '11/2026' } }
    expect(gpSheetNoFor(m, 1)).toBe('10/2026')
    expect(gpSheetNoFor(m, 2)).toBe('11/2026')
    expect(gpSheetNoFor(m, undefined)).toBe('10/2026')
    expect(gpSheetNoFor(m, 3)).toBe('')
    expect(gpSheetNoFor({}, 1)).toBe('')
  })
  test('sheetMetadata leaves the whole map for each sheet and never mutates it', () => {
    const m = { gpSheetNumbers: { 1: 'a', 2: 'b' } }
    const out = sheetMetadata(m, { sheetNumber: 2 })
    expect(gpSheetNoFor(out, 2)).toBe('b')
    expect(m.gpSheetNumbers).toEqual({ 1: 'a', 2: 'b' })
  })
})

describe('the General Plan DXF foot', () => {
  const stands = () => ({
    type: 'FeatureCollection',
    features: [0, 1].map((i) => ({
      type: 'Feature',
      properties: { stand: String(100 + i), area_m2: 4000 },
      geometry: { type: 'Polygon', coordinates: [[[i * 80, 0], [i * 80 + 80, 0], [i * 80 + 80, 50], [i * 80, 50], [i * 80, 0]]] },
    })),
  })
  const logger = { info() {}, warn() {}, error() {}, debug() {} }
  const render = (metadata) => generateDXF({
    parcels: stands(), beacons: { features: [] }, outsideFigureData: null,
    planType: 'general-undeveloped', sheetSize: 'SI727_800x500', scale: '1:1000', metadata,
  }, logger)

  test('prints the code for the sheet it ends up on, with the numbers entered', () => {
    const r = render({ gpSheetNumbers: { 1: '123/2026' }, srNo: '156/2026', compilation: '1827C4,D3' })
    const text = r.buffer.toString('utf8')
    expect(text).toContain(`${gpOfficeCode(r.sheetSize)} 123/2026`)
    expect(text).toContain('S.R. 156/2026')
    expect(text).toContain('COMPILATION 1827C4,D3')
  })
  test('with nothing entered the foot still names the sheet\'s code as a blank', () => {
    const r = render({})
    expect(r.buffer.toString('utf8')).toContain(`${gpOfficeCode(r.sheetSize)} .......`)
  })
})
