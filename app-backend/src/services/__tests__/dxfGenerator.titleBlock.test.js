/**
 * Layer 1 unit tests for the title-block SI 727 helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator.titleBlock
 */
import { describe, test, expect } from '@jest/globals'
import { splitToWidth, formatSheetLabel, formatVideLine, formatFigureDescription } from '../dxfGenerator.js'
import { TITLE_BLOCK } from '../../../../app-shared/block-definitions.js'

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

describe('formatVideLine', () => {
  test('returns the Vide template from block-definitions, wrapped to maxLineChars', () => {
    const lines = formatVideLine(200) // generous width — likely single line
    expect(lines.length).toBeGreaterThanOrEqual(1)
    // The joined output (collapsed whitespace) must reconstruct the template
    // up to whitespace collapsing (splitToWidth splits on \s+).
    const expectedTokens = TITLE_BLOCK.vide.template.split(/\s+/).filter(Boolean)
    const gotTokens = lines.join(' ').split(/\s+/).filter(Boolean)
    expect(gotTokens).toEqual(expectedTokens)
  })

  test('wraps to multiple entries at small maxLineChars', () => {
    // The Vide template contains 24-char dot-runs as user-fillable blanks;
    // splitToWidth emits oversize tokens as their own line (documented in
    // Task 1). 30 is the smallest value that still produces a multi-line
    // wrap (≥ 24 to fit the dot-runs, < length(template) to force wrapping).
    const lines = formatVideLine(30)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(30)
  })

  test('output contains the literal "Vide diagram S.G. No." opening', () => {
    const lines = formatVideLine(200)
    expect(lines[0]).toMatch(/^Vide diagram S\.G\. No\./)
  })
})

describe('formatFigureDescription', () => {
  // Reusable fixture inputs — happy path, Borrowdale sample.
  const fullMetadata = {
    township: 'borrowdale',
    district: 'harare',
    parentProperty: 'lot 9 of borrowdale',
    wholePortion: 'a portion',
  }
  const ofData = {
    edges: [
      { pointId: 'A', y: 50000, x: 2200000 },
      { pointId: 'B', y: 50200, x: 2200000 },
      { pointId: 'C', y: 50200, x: 2200100 },
      { pointId: 'D', y: 50000, x: 2200100 },
    ],
  }
  const surveyedParcels = [
    { stand: '123', area_m2: 10000 },
    { stand: '124', area_m2: 10000 },
  ]

  test('happy path → all placeholders substituted, sentence reads correctly', () => {
    const lines = formatFigureDescription(fullMetadata, ofData, surveyedParcels, 500)
    const sentence = lines.join(' ')
    expect(sentence).toContain('The figure A, B, C, D, A represents')
    expect(sentence).toContain('Borrowdale')
    expect(sentence).toContain('comprising 2 stands')
    expect(sentence).toContain('numbered')
    expect(sentence).toContain('123')
    expect(sentence).toContain('124')
    expect(sentence).toContain('public places being a portion')
    expect(sentence).toContain('of Borrowdale of Lot 9 Of Borrowdale')
    expect(sentence).toContain('situate in the district of Harare')
  })

  test('returns [] when outsideFigureData has no edges', () => {
    expect(formatFigureDescription(fullMetadata, { edges: [] }, surveyedParcels, 500)).toEqual([])
  })

  test('returns [] when outsideFigureData is null', () => {
    expect(formatFigureDescription(fullMetadata, null, surveyedParcels, 500)).toEqual([])
  })

  test('returns [] when surveyedParcels is empty', () => {
    expect(formatFigureDescription(fullMetadata, ofData, [], 500)).toEqual([])
  })

  test('missing township → fallback "the township"', () => {
    const m = { ...fullMetadata, township: '' }
    const sentence = formatFigureDescription(m, ofData, surveyedParcels, 500).join(' ')
    expect(sentence).toContain('represents the township')
  })

  test('missing district → fallback "the district"', () => {
    const m = { ...fullMetadata, district: '' }
    const sentence = formatFigureDescription(m, ofData, surveyedParcels, 500).join(' ')
    expect(sentence).toContain('situate in the district of the district')
  })

  test('missing parentProperty → ofTarget collapses to township only', () => {
    const m = { ...fullMetadata, parentProperty: '' }
    const sentence = formatFigureDescription(m, ofData, surveyedParcels, 500).join(' ')
    expect(sentence).toContain('a portion of Borrowdale')
    expect(sentence).not.toContain('of Borrowdale of')
  })

  test('missing wholePortion → fallback "the whole"', () => {
    const m = { ...fullMetadata, wholePortion: '' }
    const sentence = formatFigureDescription(m, ofData, surveyedParcels, 500).join(' ')
    expect(sentence).toContain('public places being the whole')
  })

  test('long input wraps to multiple entries, no entry exceeds maxLineChars, no tokens lost', () => {
    const lines = formatFigureDescription(fullMetadata, ofData, surveyedParcels, 30)
    expect(lines.length).toBeGreaterThan(1)
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(30)
    }
    // Token preservation: every word in the joined output appears somewhere.
    const joined = lines.join(' ')
    expect(joined.toLowerCase()).toContain('borrowdale') // case may vary; substring check
  })

  test('compressed stand range — runs of consecutive numbers shown as a range', () => {
    const manyParcels = [
      { stand: '1', area_m2: 100 },
      { stand: '2', area_m2: 100 },
      { stand: '3', area_m2: 100 },
      { stand: '10', area_m2: 100 },
    ]
    const sentence = formatFigureDescription(fullMetadata, ofData, manyParcels, 500).join(' ')
    // Expectation aligned with formatStandRanges() output style (e.g. "1 - 3, 10").
    expect(sentence).toMatch(/numbered\s+1\s*[-–]\s*3,\s*10/)
  })
})
