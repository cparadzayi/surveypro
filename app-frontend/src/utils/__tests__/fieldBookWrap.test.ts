/**
 * A long description wraps in the field book instead of being cut ("12mm iron peg in concrete (Reference Mark)"
 * printed as "12mm iron peg in..."). A wrapped point takes a row per line, so the pages are counted in rows,
 * and the page every other document cites for a point is the page it is printed on.
 */
import { describe, it, expect } from 'vitest'
import { descriptionLines, paginateFieldBook, FIELD_BOOK_POINTS_PER_PAGE } from '../fieldBookPagination'
import { FieldBookGenerator } from '../field-book'

const RM = '12mm iron peg in concrete (Reference Mark)'
const pt = (id: string, description = '12mm iron peg in concrete') =>
  ({ id, y: -85000, x: 2144000, status: 'F', description, surveyDate: '2026-07-02' })
const pageText = (pdf: any, n: number) => (pdf.internal.pages.at(n) as string[]).join('\n')

describe('descriptionLines', () => {
  it('keeps a description that fits on one line and wraps a longer one, losing no word', () => {
    expect(descriptionLines('12mm iron peg in concrete')).toEqual(['12mm iron peg in concrete'])
    const rm = descriptionLines(RM)
    expect(rm.length).toBe(2)
    expect(rm.join(' ')).toBe(RM)
    expect(descriptionLines('')).toEqual(['-'])
  })

  it('stops at three lines, ending the last in "..."', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
    const lines = descriptionLines(long)
    expect(lines.length).toBe(3)
    expect(lines[2].endsWith('...')).toBe(true)
  })
})

describe('the field book with wrapped descriptions', () => {
  it('prints the whole description over two rows', async () => {
    const { pdf } = await new FieldBookGenerator().generateFieldBookPDF([pt('RM16', RM), pt('SD1')], { surveyorName: 'C' })
    const page = pageText(pdf, 3)   // cover, E1, then the point page
    expect(page).toContain('(12mm iron peg in concrete \\(Reference) Tj')
    expect(page).toContain('(Mark\\)) Tj')
    expect(page).not.toContain('in...')
  })

  it('counts pages in rows, and puts each point on the page the pagination says', async () => {
    // A page of points fills exactly; one wrapped description among them pushes the last point onto the next page.
    const points = Array.from({ length: FIELD_BOOK_POINTS_PER_PAGE }, (_, i) => pt(`P${i + 1}`, i === 0 ? RM : undefined))
    const plain = paginateFieldBook(points.map((p) => ({ id: p.id })), { hasCalibration: false, hasCover: true })
    const wrapped = paginateFieldBook(points, { hasCalibration: false, hasCover: true })
    const last = `P${FIELD_BOOK_POINTS_PER_PAGE}`
    expect(plain.pointPageMap[last]).toBe('E2')
    expect(wrapped.pointPageMap[last]).toBe('E3')
    expect(wrapped.observationPages.map((p) => p.length)).toEqual([FIELD_BOOK_POINTS_PER_PAGE - 1, 1])

    const { pdf, pointPageMap } = await new FieldBookGenerator().generateFieldBookPDF(points, { surveyorName: 'C' })
    expect(pointPageMap).toEqual(wrapped.pointPageMap)
    const e3 = pageText(pdf, 4)
    expect(e3).toContain('(E3)')
    expect(e3).toContain(`(${last})`)
    expect(pageText(pdf, 3)).not.toContain(`(${last})`)
  })
})
