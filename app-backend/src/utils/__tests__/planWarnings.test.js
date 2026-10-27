import { warningHints, encodeWarningsHeader } from '../planWarnings.js'

describe('warningHints', () => {
  test('uses each warning\'s own hint', () => {
    expect(warningHints({
      scheduleEscalationExhausted: { atSheetSize: 'SI727_1000x800', attempts: 0, hint: 'Plan too dense for largest available paper size; some blocks may overlap the figure.' },
    })).toEqual(['Plan too dense for largest available paper size; some blocks may overlap the figure.'])
  })

  test('says how many places when a warning counts them', () => {
    expect(warningHints({ tickMarksOverlapBlocks: { count: 3, hint: 'Coordinate tick marks drawn over a plan block.' } }))
      .toEqual(['Coordinate tick marks drawn over a plan block. (3 places)'])
    expect(warningHints({ tickMarksOverlapBlocks: { count: 1, hint: 'Ticks over a block.' } })).toEqual(['Ticks over a block.'])
  })

  test('names a block by its heading, not its internal key', () => {
    expect(warningHints({ scheduleOfAreasOverlapsPolygon: { hint: 'scheduleOfAreas block rendered over the parcel figure.' } }))
      .toEqual(['Schedule of Areas block rendered over the parcel figure.'])
    expect(warningHints({ x: { hint: 'servitudeStatement block rendered over the parcel figure.' } }))
      .toEqual(['Servitude Statement block rendered over the parcel figure.'])
    // a key it does not know is left as it is rather than dropped
    expect(warningHints({ x: { hint: 'mysteryBlock block rendered over the parcel figure.' } }))
      .toEqual(['mysteryBlock block rendered over the parcel figure.'])
    // text that is not about a block is untouched
    expect(warningHints({ y: { hint: 'Plan too dense; some blocks may overlap the figure.' } }))
      .toEqual(['Plan too dense; some blocks may overlap the figure.'])
  })

  test('falls back to the key when a warning has no hint, and prefixes a sheet', () => {
    expect(warningHints({ odd: { x: 1 } }, 'Sheet 2: ')).toEqual(['Sheet 2: odd'])
  })

  test('is empty for nothing', () => {
    for (const v of [undefined, null, {}, 'x', 5]) expect(warningHints(v)).toEqual([])
  })
})

describe('encodeWarningsHeader', () => {
  test('is null when there is nothing to say, so no header is sent', () => {
    expect(encodeWarningsHeader([])).toBeNull()
    expect(encodeWarningsHeader(undefined)).toBeNull()
    expect(encodeWarningsHeader(['', '  ', null])).toBeNull()
  })

  test('is a JSON array, de-duplicated', () => {
    expect(JSON.parse(encodeWarningsHeader(['A', 'B', 'A']))).toEqual(['A', 'B'])
  })

  test('is plain ASCII, which a header requires', () => {
    const v = encodeWarningsHeader(['Beacon → stand é'])
    expect(v).toMatch(/^[\x20-\x7E]*$/)
  })

  test('cuts long sentences and caps the list, saying so', () => {
    const many = Array.from({ length: 12 }, (_, i) => `warning ${i} ` + 'x'.repeat(400))
    const out = JSON.parse(encodeWarningsHeader(many))
    expect(out).toHaveLength(9)
    expect(out.at(-1)).toBe('+4 more')
    expect(out.slice(0, 8).every((s) => s.length <= 220)).toBe(true)
  })
})
