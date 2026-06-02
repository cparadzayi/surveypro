/**
 * Layer 1 unit tests for the Schedule of Areas helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator.scheduleOfAreas
 */
import { describe, test, expect } from '@jest/globals'
import { nextLargerSheet, extractScheduleRow } from '../dxfGenerator.js'

describe('nextLargerSheet', () => {
  test.each([
    ['ISO_A2', 'ISO_A1'],
    ['ISO_A1', 'ISO_A0'],
    ['ISO_A0', 'multi-sheet-required'],
  ])('%s → %s', (input, expected) => {
    expect(nextLargerSheet(input)).toBe(expected)
  })

  test('unknown sheet size → "multi-sheet-required" (defensive)', () => {
    expect(nextLargerSheet('ISO_A4')).toBe('multi-sheet-required')
    expect(nextLargerSheet('unknown')).toBe('multi-sheet-required')
    expect(nextLargerSheet(null)).toBe('multi-sheet-required')
    expect(nextLargerSheet(undefined)).toBe('multi-sheet-required')
  })
})

describe('extractScheduleRow', () => {
  test('happy path — all properties populated → all six string fields', () => {
    const f = { properties: {
      stand: '123', area_m2: 1234.7,
      diagram: 'Diagram-GP 4567', deedNumber: '12/2024', deedDate: '2024-01-15', surveyor: 'J.K. Doe',
    }}
    expect(extractScheduleRow(f)).toEqual({
      stand: '123', area: '1235',
      diagram: 'Diagram-GP 4567', deedNumber: '12/2024', deedDate: '2024-01-15', surveyor: 'J.K. Doe',
    })
  })

  test('all optional fields absent → blank strings (not undefined/null)', () => {
    const f = { properties: { stand: '7', area_m2: 200 } }
    expect(extractScheduleRow(f)).toEqual({
      stand: '7', area: '200',
      diagram: '', deedNumber: '', deedDate: '', surveyor: '',
    })
  })

  test('null and undefined values → blank strings', () => {
    const f = { properties: {
      stand: '7', area_m2: 100,
      diagram: null, deedNumber: undefined, deedDate: null, surveyor: undefined,
    }}
    const row = extractScheduleRow(f)
    expect(row.diagram).toBe('')
    expect(row.deedNumber).toBe('')
    expect(row.deedDate).toBe('')
    expect(row.surveyor).toBe('')
  })

  test('numeric diagram is stringified', () => {
    const f = { properties: { stand: '7', area_m2: 100, diagram: 1234 } }
    expect(extractScheduleRow(f).diagram).toBe('1234')
  })

  test('missing properties.stand → stand: "" (defensive)', () => {
    const f = { properties: { area_m2: 100 } }
    expect(extractScheduleRow(f).stand).toBe('')
  })

  test('area_m2: 9999.7 → area: "10000" (rounding)', () => {
    const f = { properties: { stand: '7', area_m2: 9999.7 } }
    expect(extractScheduleRow(f).area).toBe('10000')
  })

  test('area_m2: 0 → area: "0" (not blank)', () => {
    const f = { properties: { stand: '7', area_m2: 0 } }
    expect(extractScheduleRow(f).area).toBe('0')
  })

  test('area_m2 missing → area: "0" (matches existing default)', () => {
    const f = { properties: { stand: '7' } }
    expect(extractScheduleRow(f).area).toBe('0')
  })

  test('parcelFeature with missing properties → all blank/zero (no throw)', () => {
    const f = {}
    expect(extractScheduleRow(f)).toEqual({
      stand: '', area: '0',
      diagram: '', deedNumber: '', deedDate: '', surveyor: '',
    })
  })

  test('null or undefined parcelFeature → no throw, all blank/zero', () => {
    expect(() => extractScheduleRow(null)).not.toThrow()
    expect(() => extractScheduleRow(undefined)).not.toThrow()
    expect(extractScheduleRow(null)).toEqual({
      stand: '', area: '0',
      diagram: '', deedNumber: '', deedDate: '', surveyor: '',
    })
    expect(extractScheduleRow(undefined)).toEqual({
      stand: '', area: '0',
      diagram: '', deedNumber: '', deedDate: '', surveyor: '',
    })
  })
})
