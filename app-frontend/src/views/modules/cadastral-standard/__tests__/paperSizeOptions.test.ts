import { paperSizeOptionsFor } from '../paperSizeOptions'

describe('paperSizeOptionsFor', () => {
  it('offers A4 then A3 for the diagram plan type', () => {
    expect(paperSizeOptionsFor('diagram').map(o => o.value)).toEqual(['A4', 'A3'])
  })
  it('offers auto + the real SI 727 sizes for general and working plans', () => {
    const expected = ['auto', 'SI727_500x400', 'SI727_800x500', 'SI727_1000x800']
    expect(paperSizeOptionsFor('general-undeveloped').map(o => o.value)).toEqual(expected)
    expect(paperSizeOptionsFor('general-developed').map(o => o.value)).toEqual(expected)
    expect(paperSizeOptionsFor('working-plan').map(o => o.value)).toEqual(expected)
  })
  it('every option has a non-empty label', () => {
    for (const pt of ['diagram', 'general-undeveloped']) {
      for (const o of paperSizeOptionsFor(pt)) expect(o.label.length).toBeGreaterThan(0)
    }
  })
})
