import { describe, test, expect } from '@jest/globals'
import { formatSI } from '../numberFormat.js'

describe('formatSI', () => {
  test('two decimals with a comma separator, no grouping under 1000', () => {
    expect(formatSI(122.96)).toBe('122,96')
  })
  test('groups thousands with a space', () => {
    expect(formatSI(1234.5)).toBe('1 234,50')
  })
  test('signed negative: minus, space, grouped, comma decimal', () => {
    expect(formatSI(-82360.81, 2, { sign: true })).toBe('- 82 360,81')
  })
  test('signed positive with multiple thousands groups', () => {
    expect(formatSI(2156833.1, 2, { sign: true })).toBe('+ 2 156 833,10')
  })
  test('signed zero is positive', () => {
    expect(formatSI(0, 2, { sign: true })).toBe('+ 0,00')
  })
  test('zero decimals still groups', () => {
    expect(formatSI(9000, 0)).toBe('9 000')
  })
  test('four decimals', () => {
    expect(formatSI(1.2345, 4)).toBe('1,2345')
  })
  test('non-numeric is treated as zero', () => {
    expect(formatSI(undefined)).toBe('0,00')
    expect(formatSI('abc', 2, { sign: true })).toBe('+ 0,00')
  })
})
