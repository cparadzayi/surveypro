import { describe, test, expect } from '@jest/globals'
import {
  DIAGRAM_MARGINS_MM, CONTENT_PAD, pageDimsPt, marginsPt, computeDiagramLayout,
} from '../diagramLayout.js'

const MM = 72 / 25.4

describe('pageDimsPt', () => {
  test('A4 and A3 portrait; default A4', () => {
    expect(pageDimsPt('A4').width).toBeCloseTo(595.28, 2)
    expect(pageDimsPt('A3').height).toBeCloseTo(1190.55, 1)
    expect(pageDimsPt('bogus')).toEqual(pageDimsPt('A4'))
  })
})

describe('marginsPt', () => {
  test('35mm left, 15mm others in points', () => {
    const m = marginsPt()
    expect(m.left).toBeCloseTo(35 * MM, 3)
    expect(m.top).toBeCloseTo(15 * MM, 3)
    expect(m.right).toBeCloseTo(15 * MM, 3)
    expect(m.bottom).toBeCloseTo(15 * MM, 3)
  })
})

describe('computeDiagramLayout', () => {
  const dims = pageDimsPt('A4')
  const margins = marginsPt()
  const L = computeDiagramLayout({ pageWidthPt: dims.width, pageHeightPt: dims.height, margins })

  test('border is the content box (page minus margins)', () => {
    expect(L.border.x).toBeCloseTo(35 * MM, 3)
    expect(L.border.y).toBeCloseTo(15 * MM, 3)
    expect(L.border.width).toBeCloseTo(dims.width - 50 * MM, 3)   // 35 + 15
    expect(L.border.height).toBeCloseTo(dims.height - 30 * MM, 3) // 15 + 15
  })

  test('bands are inset from the border by CONTENT_PAD so text clears the margins', () => {
    expect(CONTENT_PAD).toBeGreaterThan(0)
    expect(L.table.x).toBeCloseTo(L.border.x + CONTENT_PAD, 3)
    expect(L.table.y).toBeCloseTo(L.border.y + CONTENT_PAD, 3)
    expect(L.figure.width).toBeCloseTo(L.border.width - 2 * CONTENT_PAD, 3)
  })

  test('figure flexes = padded content height minus fixed bands', () => {
    const fixed = 150 + 66 + 34 + 92 + 100
    expect(L.figure.height).toBeCloseTo(L.border.height - 2 * CONTENT_PAD - fixed, 3)
  })

  test('bands stack top-to-bottom without gaps or overlap', () => {
    expect(L.figure.y).toBeCloseTo(L.table.y + L.table.height + 66, 3) // header band = 66
    expect(L.scaleBar.y).toBeCloseTo(L.figure.y + L.figure.height, 3)
    expect(L.statement.y).toBeCloseTo(L.scaleBar.y + 34, 3)
    expect(L.refGrid.y).toBeCloseTo(L.statement.y + 92, 3)
    // last band bottom sits within the content box (inside the border)
    expect(L.refGrid.y + L.refGrid.height).toBeLessThanOrEqual(L.border.y + L.border.height + 0.01)
  })

  test('sgNoBox is right-aligned inside the padded content box', () => {
    expect(L.sgNoBox.x + L.sgNoBox.width).toBeCloseTo(L.border.x + L.border.width - CONTENT_PAD, 3)
  })

  test('every region is inside the content box', () => {
    const inside = (r) =>
      r.x >= L.border.x - 0.01 &&
      r.y >= L.border.y - 0.01 &&
      r.x + r.width <= L.border.x + L.border.width + 0.01 &&
      r.y + r.height <= L.border.y + L.border.height + 0.01
    for (const key of ['table', 'beaconDesc', 'northArrow', 'approved', 'figure', 'scaleBar', 'statement', 'refGrid']) {
      expect(inside(L[key])).toBe(true)
    }
  })

  test('A3 gives a taller figure than A4', () => {
    const d3 = pageDimsPt('A3')
    const L3 = computeDiagramLayout({ pageWidthPt: d3.width, pageHeightPt: d3.height, margins })
    expect(L3.figure.height).toBeGreaterThan(L.figure.height)
  })

  test('DIAGRAM_MARGINS_MM is 35 left / 15 others', () => {
    expect(DIAGRAM_MARGINS_MM).toEqual({ left: 35, top: 15, right: 15, bottom: 15 })
  })
})
