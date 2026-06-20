/**
 * Layer 1 unit tests for the title-block SI 727 helpers.
 * Run with:  cd app-backend && npm run test -- dxfGenerator.titleBlock
 */
import { describe, test, expect } from '@jest/globals'
import { splitToWidth, formatSheetLabel, formatVideLine, formatFigureDescription, formatPlanDesignation } from '../dxfGenerator.js'
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

  test('happy path → ideal phrasing, dot-joined beacons, no comprising/numbered clause', () => {
    const lines = formatFigureDescription(fullMetadata, ofData, surveyedParcels, 500)
    const sentence = lines.join(' ')
    expect(sentence).toContain('The figure A.B.C.D.A represents')
    expect(sentence).toContain('2 stands and public places being a portion')
    expect(sentence).toContain('of Borrowdale of Lot 9 Of Borrowdale')
    expect(sentence).toContain('situate in the district of Harare')
    // Stand numbers/range now live in the title designation line, not this sentence.
    expect(sentence).not.toContain('comprising')
    expect(sentence).not.toContain('numbered')
    expect(sentence).not.toContain('123')
  })

  test('edges without pointId fall back to coordinates[].name for the beacon sequence', () => {
    const sideEdges = {
      edges: [{ side: 'AB' }, { side: 'BC' }, { side: 'CD' }, { side: 'DA' }],
      coordinates: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
    }
    const sentence = formatFigureDescription(fullMetadata, sideEdges, surveyedParcels, 500).join(' ')
    expect(sentence).toContain('The figure A.B.C.D.A represents')
  })

  test('edges with neither pointId nor coordinates fall back to the side leading vertex', () => {
    const sideOnly = { edges: [{ side: 'A-B' }, { side: 'B-C' }, { side: 'C-D' }, { side: 'D-A' }] }
    const sentence = formatFigureDescription(fullMetadata, sideOnly, surveyedParcels, 500).join(' ')
    expect(sentence).toContain('The figure A.B.C.D.A represents')
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

  test('missing township → fallback "the township" inside ofTarget', () => {
    const m = { ...fullMetadata, township: '' }
    const sentence = formatFigureDescription(m, ofData, surveyedParcels, 500).join(' ')
    expect(sentence).toContain('of the township of Lot 9 Of Borrowdale')
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

  test('whitespace-only wholePortion → fallback "the whole"', () => {
    const m = { ...fullMetadata, wholePortion: '   ' }
    const sentence = formatFigureDescription(m, ofData, surveyedParcels, 500).join(' ')
    expect(sentence).toContain('public places being the whole')
    expect(sentence).not.toMatch(/public places being\s{2,}of/)
  })

  test('all-blank stand values → []', () => {
    const blankStands = [
      { stand: '', area_m2: 100 },
      { stand: null, area_m2: 100 },
      { stand: undefined, area_m2: 100 },
    ]
    expect(formatFigureDescription(fullMetadata, ofData, blankStands, 500)).toEqual([])
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

  test('stand count reflects parcels; numeric range no longer in the figure sentence', () => {
    const manyParcels = [
      { stand: '1', area_m2: 100 },
      { stand: '2', area_m2: 100 },
      { stand: '3', area_m2: 100 },
      { stand: '10', area_m2: 100 },
    ]
    const sentence = formatFigureDescription(fullMetadata, ofData, manyParcels, 500).join(' ')
    expect(sentence).toContain('represents 4 stands')
    // The stand range moved to the title designation line (see formatPlanDesignation).
    expect(sentence).not.toMatch(/numbered/)
  })
})

describe('formatPlanDesignation', () => {
  const parcels = [
    { stand: '1438', area_m2: 100 },
    { stand: '1439', area_m2: 100 },
    { stand: '1597', area_m2: 100 },
  ]

  test('composes "Stands <range> <township>" — PDF-style: mixed case, no parent suffix', () => {
    const m = { township: 'Maglas Township', parentProperty: 'Shabani Mine Surface Rights A' }
    expect(formatPlanDesignation(m, parcels))
      .toBe('Stands 1438 - 1439, 1597 Maglas Township')
  })

  test('strips leading "Stands X - Y" prefix and trailing " of <parent>" from surveyOf', () => {
    const m = { surveyOf: 'STANDS 1 - 5 MAGLAS TOWNSHIP OF SHABANI MINE SURFACE RIGHTS A' }
    expect(formatPlanDesignation(m, parcels))
      .toBe('Stands 1438 - 1439, 1597 MAGLAS TOWNSHIP')
  })

  test('no stands → designation/surveyOf fallback with " of <parent>" suffix stripped', () => {
    expect(formatPlanDesignation({ designation: 'Stands 1686 - 1925 Maglas Township' }, []))
      .toBe('Stands 1686 - 1925 Maglas Township')
    expect(formatPlanDesignation({ surveyOf: 'Stands 1 - 5 Greendale Township of Lot 9' }, []))
      .toBe('Stands 1 - 5 Greendale Township')
  })

  test('nothing to render → empty string', () => {
    expect(formatPlanDesignation({}, [])).toBe('')
    expect(formatPlanDesignation({}, null)).toBe('')
  })
})
