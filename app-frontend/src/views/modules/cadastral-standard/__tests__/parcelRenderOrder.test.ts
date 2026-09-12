import { describe, it, expect } from 'vitest'
import { outsideFigureFirst } from '../parcelRenderOrder'

const f = (designation: string | null | undefined, extra: Record<string, any> = {}) =>
  ({ type: 'Feature', properties: { designation, ...extra } })

const names = (features: any[]) => features.map(x => x.properties?.designation ?? x.properties?.stand ?? null)

describe('outsideFigureFirst', () => {
  it('moves a trailing Outside Figure to the front so it draws underneath', () => {
    const ordered = outsideFigureFirst([f('STAND 207'), f('STAND 208'), f('Outside Figure')])
    expect(names(ordered)).toEqual(['Outside Figure', 'STAND 207', 'STAND 208'])
  })

  it('preserves the relative order of every other parcel', () => {
    const ordered = outsideFigureFirst([f('STAND 3'), f('STAND 1'), f('Outside Figure'), f('STAND 2')])
    expect(names(ordered)).toEqual(['Outside Figure', 'STAND 3', 'STAND 1', 'STAND 2'])
  })

  it('keeps several Outside Figures in their original relative order', () => {
    const ordered = outsideFigureFirst([f('Outside Figure A'), f('STAND 1'), f('Outside Figure B')])
    expect(names(ordered)).toEqual(['Outside Figure A', 'Outside Figure B', 'STAND 1'])
  })

  it('matches the designation case-insensitively and as a substring', () => {
    const ordered = outsideFigureFirst([f('STAND 1'), f('Remainder of the OUTSIDE FIGURE')])
    expect(names(ordered)).toEqual(['Remainder of the OUTSIDE FIGURE', 'STAND 1'])
  })

  it('falls back to the stand property when there is no designation', () => {
    const ordered = outsideFigureFirst([f(undefined, { stand: 'STAND 1' }), f(null, { stand: 'Outside Figure' })])
    expect(names(ordered)).toEqual(['Outside Figure', 'STAND 1'])
  })

  it('leaves an array with no Outside Figure untouched', () => {
    const input = [f('STAND 1'), f('STAND 2')]
    expect(names(outsideFigureFirst(input))).toEqual(['STAND 1', 'STAND 2'])
  })

  it('tolerates features with no properties at all', () => {
    const ordered = outsideFigureFirst([{ type: 'Feature' } as any, f('Outside Figure')])
    expect(names(ordered)).toEqual(['Outside Figure', null])
  })

  it('does not mutate the array it was given', () => {
    const input = [f('STAND 1'), f('Outside Figure')]
    outsideFigureFirst(input)
    expect(names(input)).toEqual(['STAND 1', 'Outside Figure'])
  })
})
