import { paperSizeOptionsFor } from '../paperSizeOptions'

describe('paperSizeOptionsFor', () => {
  it('offers A4 then A3 for the diagram plan type', () => {
    expect(paperSizeOptionsFor('diagram').map(o => o.value)).toEqual(['A4', 'A3'])
  })
  it('offers auto + ISO sizes for general and working plans', () => {
    const expected = ['auto', 'ISO_A2', 'ISO_A1', 'ISO_A0']
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
