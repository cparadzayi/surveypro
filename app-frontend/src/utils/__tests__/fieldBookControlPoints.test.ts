/**
 * E1 of the field book: the site calibration when there is one, otherwise the control points the survey was tied
 * to, with their co-ordinates. And the Co-ordinate List's S.R. number before the office issues one.
 */
import { describe, it, expect } from 'vitest'
import { FieldBookGenerator, controlPointRows } from '../field-book'
import { srNumberValue } from '../coordinate-list'

const points = [{ id: 'SD1', y: -85765.137, x: 2144017.161, status: 'P', description: 'peg', surveyDate: '2026-07-30' }]
const control = [
  { id: 11, monu_num: '170/P', monu_name: 'Mnyami', type: 'TRIG', y_gauss: '-81572.343', x_gauss: '2147611.204' },
  { id: 12, monu_num: '6091/V', monu_name: '', type: 'OCP', y_gauss: -85001.5, x_gauss: 2144500.25 },
  { id: 13, monu_num: 'BAD', y_gauss: null, x_gauss: 1 },
]
const pageText = (pdf: any, n: number) => (pdf.internal.pages.at(n) as string[]).join('\n')

describe('controlPointRows', () => {
  it('lists each control point with its kind and signed 3 dp co-ordinates, and leaves out one without both', () => {
    expect(controlPointRows(control)).toEqual([
      { station: '170/P', name: 'Mnyami', kind: 'TRIG', y: '-81572.343', x: '+2147611.204' },
      { station: '6091/V', name: '', kind: 'OCP', y: '-85001.500', x: '+2144500.250' },
    ])
  })
})

describe('field book E1', () => {
  it('lists the control points used when there is no calibration', async () => {
    const { pdf, pointPageMap } = await new FieldBookGenerator().generateFieldBookPDF(points, { surveyorName: 'C. Paradzayi' }, undefined, [], control)
    const e1 = pageText(pdf, 2)   // physical page 2: after the cover
    expect(e1).toContain('(E1)')
    expect(e1).toContain('(CONTROL POINTS USED)')
    expect(e1).toContain('(170/P)')
    expect(e1).toContain('(Mnyami)')
    expect(e1).toContain('(-81572.343)')
    expect(e1).toContain('(+2147611.204)')
    expect(e1).toContain('(OCP)')
    expect(pointPageMap.SD1).toBe('E2')
  })

  it('says so when there is neither a calibration nor a control point', async () => {
    const { pdf } = await new FieldBookGenerator().generateFieldBookPDF(points, { surveyorName: 'C. Paradzayi' })
    expect(pageText(pdf, 2)).toContain('No site calibration and no control points were recorded for this survey.')
  })
})

describe("the Co-ordinate List's S.R. number", () => {
  const now = new Date('2026-11-20T12:00:00Z')
  it('leaves room for the number with the current year until one is issued', () => {
    expect(srNumberValue(undefined, now)).toBe('.... / 2026')
    expect(srNumberValue('  ', now)).toBe('.... / 2026')
    expect(srNumberValue('N/A', now)).toBe('.... / 2026')
  })
  it('prints an issued number as it is', () => {
    expect(srNumberValue('188/2026', now)).toBe('188/2026')
  })
})

describe('a point page', () => {
  it('ends with its last observation: no empty ruled rows after the field notes', async () => {
    const two = await new FieldBookGenerator().generateFieldBookPDF(
      [points[0], { ...points[0], id: 'SD2' }], { surveyorName: 'C. Paradzayi' }, undefined, [], control)
    const page = pageText(two.pdf, 3)   // cover, E1 control points, then the point page E2
    expect(page).toContain('(E2)')
    expect(page).toContain('(SD2)')
    // Only the rule under the column header: the 40-odd empty rows used to be ruled to the foot of the page.
    expect((page.match(/ l\b/g) || []).length).toBeLessThanOrEqual(2)
  })
})
