import {
  buildParcelOptions, filterParcelOptions, nextHighlightIndex, labelForOption,
} from '../parcelSelect'

const raw = [
  { id: 'B', stand: '303', designation: 'Stand 303', area_m2: 4000 },
  { id: 'A', stand: '302', designation: 'Stand 302', area_m2: 5000 },
  { id: 'OF', stand: '', designation: 'Outside Figure', area_m2: 100000 },
]

describe('buildParcelOptions', () => {
  it('maps raw parcels and sorts by stand number (blank stand last)', () => {
    expect(buildParcelOptions(raw).map(o => o.id)).toEqual(['A', 'B', 'OF'])
  })
  it('excludes the given id (Outside Figure)', () => {
    expect(buildParcelOptions(raw, { excludeId: 'OF' }).map(o => o.id)).toEqual(['A', 'B'])
  })
  it('coerces area to number, null when missing', () => {
    const o = buildParcelOptions([{ id: 1, stand: '5' }])
    expect(o[0].areaM2).toBeNull()
  })
})

describe('filterParcelOptions', () => {
  const opts = buildParcelOptions([
    { id: 'A', stand: '302', designation: 'Brackenhurst' },
    { id: 'B', stand: '303', designation: 'Hillside' },
  ])
  it('returns all for an empty/blank query', () => {
    expect(filterParcelOptions(opts, '  ')).toHaveLength(2)
  })
  it('matches on stand and designation, case-insensitive', () => {
    expect(filterParcelOptions(opts, '303').map(o => o.id)).toEqual(['B'])
    expect(filterParcelOptions(opts, 'brack').map(o => o.id)).toEqual(['A'])
  })
})

describe('nextHighlightIndex', () => {
  it('wraps forward and backward and seeds from -1', () => {
    expect(nextHighlightIndex(-1, 3, 1)).toBe(0)
    expect(nextHighlightIndex(2, 3, 1)).toBe(0)
    expect(nextHighlightIndex(0, 3, -1)).toBe(2)
    expect(nextHighlightIndex(-1, 3, -1)).toBe(2)
  })
  it('returns -1 for an empty list', () => {
    expect(nextHighlightIndex(0, 0, 1)).toBe(-1)
  })
})

describe('labelForOption', () => {
  it('uses Stand as primary and designation+area as secondary', () => {
    const l = labelForOption({ id: 'A', stand: '302', designation: 'Brackenhurst', areaM2: 5019 })
    expect(l.primary).toBe('Stand 302')
    expect(l.secondary).toContain('Brackenhurst')
  })
  it('falls back to #id when stand and designation are blank', () => {
    expect(labelForOption({ id: 7, stand: '', designation: '' }).primary).toBe('#7')
  })
})
