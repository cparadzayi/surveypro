/**
 * Layer 1 unit tests for the title-block SI 727 helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator.titleBlock
 */
import { describe, test, expect } from '@jest/globals'
import { splitToWidth, formatSheetLabel } from '../dxfGenerator.js'

describe('splitToWidth', () => {
  test('empty input returns []', () => {
    expect(splitToWidth('', 40)).toEqual([])
  })
  test('short input ≤ maxChars returns single-element array', () => {
    expect(splitToWidth('Hello world', 40)).toEqual(['Hello world'])
  })
  test('long input wraps to multiple entries, each ≤ maxChars', () => {
    const long = 'The quick brown fox jumps over the lazy dog and keeps running endlessly through the countryside.'
    const lines = splitToWidth(long, 25)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(25)
    }
  })
  test('no mid-word splits — every token in every wrapped line is a token from the input', () => {
    const input = 'one two three four five six seven eight nine ten eleven twelve'
    const lines = splitToWidth(input, 15)
    const inputTokens = new Set(input.split(/\s+/))
    for (const line of lines) {
      for (const tok of line.split(/\s+/)) {
        expect(inputTokens.has(tok)).toBe(true)
      }
    }
    // Also assert no tokens are dropped:
    const reconstructed = lines.join(' ').split(/\s+/).filter(Boolean)
    expect(reconstructed).toEqual(input.split(/\s+/))
  })
  test('single word longer than maxChars is emitted as its own line (no truncation)', () => {
    const lines = splitToWidth('short supercalifragilisticexpialidocious more', 10)
    expect(lines).toContain('supercalifragilisticexpialidocious')
  })
  test('never produces empty entries', () => {
    const lines = splitToWidth('   spaces    between    words   ', 8)
    for (const line of lines) expect(line.length).toBeGreaterThan(0)
  })
})

describe('formatSheetLabel', () => {
  test.each([
    ['null',                        null],
    ['undefined',                   undefined],
    ['empty object',                {}],
    ['totalSheets: 1',              { totalSheets: 1 }],
    ['totalSheets: 1 + sheetNumber: 1', { sheetNumber: 1, totalSheets: 1 }],
    ['negative sheetNumber',        { sheetNumber: -1, totalSheets: 3 }],
    ['zero sheetNumber',            { sheetNumber: 0, totalSheets: 3 }],
    ['NaN sheetNumber',             { sheetNumber: NaN, totalSheets: 3 }],
    ['non-integer sheetNumber',     { sheetNumber: 1.5, totalSheets: 3 }],
  ])('%s → []', (_label, input) => {
    expect(formatSheetLabel(input)).toEqual([])
  })

  test('valid multi-sheet input → ["SHEET N"]', () => {
    expect(formatSheetLabel({ sheetNumber: 2, totalSheets: 3 })).toEqual(['SHEET 2'])
  })

  test('sheetNumber 1 with totalSheets 3 → ["SHEET 1"]', () => {
    expect(formatSheetLabel({ sheetNumber: 1, totalSheets: 3 })).toEqual(['SHEET 1'])
  })
})
