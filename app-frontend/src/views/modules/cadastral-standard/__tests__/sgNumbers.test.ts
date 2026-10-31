import { describe, it, expect } from 'vitest'
import {
  officeNumbersFrom, changedOfficeNumbers, hydrateDiagramSgNumbers, withDiagramSgNumber, officeNumbersMetadata,
} from '../sgNumbers'

describe('office numbers', () => {
  it('reads the four numbers, trimmed, missing as empty', () => {
    expect(officeNumbersFrom({ fileNo: ' B/2917 ', srNo: null, gpNo: 12 })).toEqual({ fileNo: 'B/2917', srNo: '', compilation: '', gpNo: '12' })
    expect(officeNumbersFrom(undefined)).toEqual({ fileNo: '', srNo: '', compilation: '', gpNo: '' })
  })
  it('sends only what changed, and a cleared number is a change', () => {
    const saved = officeNumbersFrom({ fileNo: 'B/2917', srNo: '188/2026' })
    expect(changedOfficeNumbers(saved, { ...saved })).toEqual({})
    expect(changedOfficeNumbers(saved, { ...saved, compilation: ' QJ9454 ' })).toEqual({ compilation: 'QJ9454' })
    expect(changedOfficeNumbers(saved, { ...saved, srNo: '' })).toEqual({ srNo: '' })
  })
})

describe('diagram S.G. numbers', () => {
  it('hydrate keeps only non-empty strings, and survives junk', () => {
    expect(hydrateDiagramSgNumbers({ '12': ' 466/2026 ', '13': '', '14': 5, '15': null })).toEqual({ '12': '466/2026' })
    expect(hydrateDiagramSgNumbers(null)).toEqual({})
    expect(hydrateDiagramSgNumbers(['x'])).toEqual({})
    expect(hydrateDiagramSgNumbers('x')).toEqual({})
  })
  it('sets, replaces and removes a diagram\'s number without touching the others', () => {
    let m = withDiagramSgNumber({}, 12, '466/2026')
    m = withDiagramSgNumber(m, '13', '467/2026')
    expect(m).toEqual({ '12': '466/2026', '13': '467/2026' })
    expect(withDiagramSgNumber(m, 12, '468/2026')['12']).toBe('468/2026')
    expect(withDiagramSgNumber(m, 12, '  ')).toEqual({ '13': '467/2026' })
    expect(m['12']).toBe('466/2026')
  })
  it('the renderer metadata carries the survey numbers and THIS diagram\'s number only', () => {
    const nums = officeNumbersFrom({ fileNo: 'B/2917', srNo: '188/2026', compilation: 'QJ9454', gpNo: '44/2026' })
    const m = { '12': '466/2026', '13': '467/2026' }
    expect(officeNumbersMetadata(nums, m, 13)).toEqual({ ...nums, diagramSgNo: '467/2026' })
    expect(officeNumbersMetadata(nums, m, null).diagramSgNo).toBe('')
    expect(officeNumbersMetadata(nums, m, 99).diagramSgNo).toBe('')
  })
})

import { printedGpCodes, reconcileSheetCodes } from '../sgNumbers'
import { gpOfficeCode } from '../../../../../../app-shared/si727SheetSizes.js'

describe('the series a General Plan number was issued under', () => {
  it('reads each sheet\'s code from the layouts; a single sheet from the size used', () => {
    expect(printedGpCodes([{ sheetNumber: 1, sheetSize: 'SI727_800x500' }, { sheetNumber: 2, sheetSize: 'SI727_1000x800' }], undefined, gpOfficeCode))
      .toEqual({ '1': 'BCG', '2': 'BDG' })
    expect(printedGpCodes(undefined, 'SI727_500x400', gpOfficeCode)).toEqual({ '1': 'BCT' })
    expect(printedGpCodes(undefined, 'weird', gpOfficeCode)).toEqual({})
  })
  it('first print remembers the series; same series later is quiet', () => {
    const a = reconcileSheetCodes({ '1': '123/2026' }, {}, { '1': 'BCG' })
    expect(a.recorded).toEqual({ '1': 'BCG' })
    expect(a.mismatches).toEqual([])
    expect(a.lines).toEqual(['Sheet 1: BCG 123/2026'])
    expect(reconcileSheetCodes({ '1': '123/2026' }, a.recorded, { '1': 'BCG' }).mismatches).toEqual([])
  })
  it('a sheet that moved to another size warns, and keeps the series the number was issued under', () => {
    const r = reconcileSheetCodes({ '1': '123/2026' }, { '1': 'BCG' }, { '1': 'BDG' })
    expect(r.mismatches).toEqual([{ sheet: '1', was: 'BCG', now: 'BDG' }])
    expect(r.recorded).toEqual({ '1': 'BCG' })
  })
  it('a sheet with no number forgets any remembered series and just names its code', () => {
    const r = reconcileSheetCodes({}, { '1': 'BCG' }, { '1': 'BCG' })
    expect(r.recorded).toEqual({})
    expect(r.lines).toEqual(['Sheet 1: BCG (no number entered yet)'])
  })
})

import { reloadOfficeNumbers } from '../sgNumbers'
describe('re-reading the project record never clears a File number', () => {
  const E = officeNumbersFrom(null)
  it('a blank incoming copy changes nothing', () => {
    const have = officeNumbersFrom({ fileNo: 'B/2917' })
    const r = reloadOfficeNumbers(have, have, E)
    expect(r.local.fileNo).toBe('B/2917')
    expect(r.saved.fileNo).toBe('B/2917')
  })
  it('the record fills a blank field, and replaces an untouched one', () => {
    expect(reloadOfficeNumbers(E, E, officeNumbersFrom({ fileNo: 'B/1' })).local.fileNo).toBe('B/1')
    const old = officeNumbersFrom({ fileNo: 'B/1' })
    expect(reloadOfficeNumbers(old, old, officeNumbersFrom({ fileNo: 'B/2' })).local.fileNo).toBe('B/2')
  })
  it('a field being edited keeps its text', () => {
    const saved = officeNumbersFrom({ fileNo: 'B/1' })
    const typing = { ...saved, fileNo: 'B/9' }
    const r = reloadOfficeNumbers(typing, saved, officeNumbersFrom({ fileNo: 'B/2' }))
    expect(r.local.fileNo).toBe('B/9')
    expect(r.saved.fileNo).toBe('B/2')
  })
  it('metadata never carries a blank over the record\'s own value', () => {
    expect(officeNumbersMetadata(E, {}, null)).toEqual({ diagramSgNo: '' })
    expect(officeNumbersMetadata(officeNumbersFrom({ fileNo: 'B/2917' }), {}, null)).toEqual({ fileNo: 'B/2917', diagramSgNo: '' })
  })
})
