/**
 * The field book renders OBSERVATIONS, and a re-observed beacon appears under
 * the SAME point id on two different pages -- that is exactly what
 * Calculations Part 1's duplicate analysis exists to handle. `pointPageMap`
 * is keyed by id and last-write-wins, so a page label derived by looking up
 * `pointPageMap[pagePoints[0].id]` prints whichever page the id was LAST
 * seen on, not the page actually being rendered. Two pages then carry the
 * same E-number and none carries the other -- in a lodged document.
 */
import { describe, it, expect } from 'vitest'
import { FieldBookGenerator, type FieldBookPoint } from '../field-book'
import { FIELD_BOOK_POINTS_PER_PAGE } from '../fieldBookPagination'

describe('field book pages with a re-observed beacon', () => {
  it('labels each page from its own position, not a by-id lookup', async () => {
    // Page 1 holds P1..P27 (P1's first observation). Page 2 re-observes P1 as
    // its very first point -- pointPageMap['P1'] ends up 'E2' because the map
    // keeps only the last write, but the physical PAGE that renders P1..P27
    // must still say E1.
    const page1Ids = Array.from({ length: FIELD_BOOK_POINTS_PER_PAGE }, (_, i) => `P${i + 1}`)
    const page2Ids = ['P1', 'P28', 'P29']
    const ids = [...page1Ids, ...page2Ids]

    const points: FieldBookPoint[] = ids.map((id, i) => ({
      id, y: i, x: i, status: 'P', description: 'peg', surveyDate: '2026-01-01',
    }))

    const { pdf, pointPageMap } = await new FieldBookGenerator().generateFieldBookPDF(
      points, { surveyorName: 'C. Paradzayi' },
    )

    // The map itself legitimately reflects the last write -- that is what
    // makes the bug possible, not what this test is pinning.
    expect(pointPageMap.P1).toBe('E2')

    // No calibration, so the cover is physical page 1 and the two point
    // pages are physical pages 2 and 3 (jsPDF's internal.pages[0] is unused).
    const page1Text = (pdf as any).internal.pages.at(2).join(' ')
    const page2Text = (pdf as any).internal.pages.at(3).join(' ')

    expect(page1Text).toContain('(E1)')
    expect(page1Text).not.toContain('(E2)')
    expect(page2Text).toContain('(E2)')
  })
})
