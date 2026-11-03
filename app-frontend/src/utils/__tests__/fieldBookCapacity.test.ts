/**
 * The renderer stops drawing at FIELD_BOOK_LAYOUT.bottomY, and the capacities are derived from the same grid.
 * If the two ever drift, the last rows of a full page are simply not drawn: no error, a short lodged record.
 * So a FULL page of each kind must carry every one of its rows.
 */
import { describe, it, expect } from 'vitest'
import { FieldBookGenerator, type FieldBookPoint } from '../field-book'
import {
  FIELD_BOOK_POINTS_PER_PAGE as N, PARTY_WALL_ROWS_PER_PAGE as R, FIELD_BOOK_LAYOUT,
} from '../fieldBookPagination'

const metadata = { surveyorName: 'C. Paradzayi', surveyOf: 'STANDS 1-3', surveyDate: '2026-01-01' }
const point = (id: string): FieldBookPoint => ({
  id, y: 1, x: 2, status: 'P', description: 'peg', surveyDate: '2026-01-01',
})
const text = (pdf: any): string => pdf.output()

describe('field book page capacity', () => {
  it('lets the last row of a full page clear the bottom of the grid', () => {
    const { headerY, firstRowOffset, rowHeight, bottomY } = FIELD_BOOK_LAYOUT
    expect(headerY + firstRowOffset + (N - 1) * rowHeight).toBeLessThanOrEqual(bottomY)
    // ...and one more would not
    expect(headerY + firstRowOffset + N * rowHeight).toBeGreaterThan(bottomY - rowHeight)
  })

  it('draws every point of a full observation page', async () => {
    const points = Array.from({ length: N }, (_, i) => point(`Q${i + 1}`))
    const { pdf } = await new FieldBookGenerator().generateFieldBookPDF(points, metadata)
    const out = text(pdf)
    for (const id of [`Q1`, `Q${N}`]) expect(out).toContain(`(${id})`)
  })

  it('draws every row of a full party-wall first page and a full calculated-points block', async () => {
    const walls = Array.from({ length: R - 2 }, (_, i) => ({ stands: `Wall${i + 1}`, boundary: `B${i}-B${i + 1}` }))
    const { pdf } = await new FieldBookGenerator().generateFieldBookPDF([point('Q1')], metadata, undefined, walls)
    const out = text(pdf)
    expect(out).toContain(`(Wall${R - 2})`)
    expect(out).not.toContain(`(Wall${R - 1})`)
  })
})

describe('party-wall grid', () => {
  it('puts the last row of every page, first or continuation, above the bottom of the grid', async () => {
    const { partyWallGrid } = await import('../fieldBookPagination')
    const { rowHeight, bottomY } = FIELD_BOOK_LAYOUT
    // the first page gives two row-slots to the heading and column header
    expect(partyWallGrid(true).firstRowY + (R - 3) * rowHeight).toBeLessThanOrEqual(bottomY)
    expect(partyWallGrid(false).firstRowY + (R - 1) * rowHeight).toBeLessThanOrEqual(bottomY)
  })
})
