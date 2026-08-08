import { describe, test, expect } from '@jest/globals'
import { drawScheduleTableGrid } from '../pdfkitGeoPDF.js'

// Minimal chainable PDFKit stand-in recording moveTo/lineTo pairs as lines.
function fakeDoc() {
  const lines = []
  let cursor = null
  const doc = {
    lines,
    lineWidth: () => doc,
    moveTo: (x, y) => { cursor = { x, y }; return doc },
    lineTo: (x, y) => { lines.push({ x1: cursor.x, y1: cursor.y, x2: x, y2: y }); cursor = { x, y }; return doc },
    stroke: () => doc,
  }
  return doc
}

// SI 727 default column widths (sum 260), used across all tests below.
const colWidths = [35, 60, 40, 40, 35, 50]

describe('drawScheduleTableGrid', () => {
  test('draws top, left, bottom — no right edge', () => {
    const doc = fakeDoc()
    drawScheduleTableGrid(doc, { x: 0, headerY: 100, headerHeight: 25, colWidths, rowHeight: 15, rowCount: 3 })
    const tableWidth = 260
    const bottomY = 100 + 25 + 3 * 15
    const top    = doc.lines.find(l => l.y1 === 100 && l.y2 === 100 && l.x1 === 0 && l.x2 === tableWidth)
    const left   = doc.lines.find(l => l.x1 === 0 && l.x2 === 0 && l.y1 === 100 && l.y2 === bottomY)
    const bottom = doc.lines.find(l => l.y1 === bottomY && l.y2 === bottomY && l.x1 === 0 && l.x2 === tableWidth)
    const right  = doc.lines.find(l => l.x1 === tableWidth && l.x2 === tableWidth)
    expect(top).toBeDefined()
    expect(left).toBeDefined()
    expect(bottom).toBeDefined()
    expect(right).toBeUndefined()
  })

  test('draws exactly one full-width horizontal below the header, regardless of row count', () => {
    const doc = fakeDoc()
    drawScheduleTableGrid(doc, { x: 0, headerY: 100, headerHeight: 25, colWidths, rowHeight: 15, rowCount: 10 })
    const tableWidth = 260
    const fullWidthHorizontals = doc.lines.filter(l => l.y1 === l.y2 && l.x1 === 0 && l.x2 === tableWidth)
    // top + header/body divider + bottom = 3, independent of rowCount.
    expect(fullWidthHorizontals.length).toBe(3)
  })

  test('draws 5 column dividers running the full table height, except DEED|DATE which starts at the sub-header row', () => {
    const doc = fakeDoc()
    drawScheduleTableGrid(doc, { x: 0, headerY: 100, headerHeight: 25, colWidths, rowHeight: 15, rowCount: 2 })
    const bottomY = 100 + 25 + 2 * 15
    const dividerXs = [35, 95, 135, 175, 210]
    for (const dx of dividerXs) {
      expect(doc.lines.some(l => l.x1 === dx && l.x2 === dx)).toBe(true)
    }
    // DEED|DATE divider (x=175) starts at deedHeaderY (headerY + 12), not headerY.
    const deedDivider = doc.lines.find(l => l.x1 === 175 && l.x2 === 175)
    expect(deedDivider.y1).toBe(112)
    // A regular divider (x=35) spans the full header+body height.
    const stdDivider = doc.lines.find(l => l.x1 === 35 && l.x2 === 35)
    expect(stdDivider.y1).toBe(100)
    expect(stdDivider.y2).toBe(bottomY)
  })

  test('table width scales with wider colWidths (15cm target)', () => {
    const doc = fakeDoc()
    const widerColWidths = [57, 98, 65, 65, 57, 82] // sums to 424 (~15cm)
    drawScheduleTableGrid(doc, { x: 0, headerY: 0, headerHeight: 25, colWidths: widerColWidths, rowHeight: 15, rowCount: 1 })
    const tableWidth = widerColWidths.reduce((a, b) => a + b, 0)
    const top = doc.lines.find(l => l.y1 === 0 && l.y2 === 0 && l.x1 === 0 && l.x2 === tableWidth)
    expect(top).toBeDefined()
  })
})
