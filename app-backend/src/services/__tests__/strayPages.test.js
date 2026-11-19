/**
 * Nothing off the sheet may make a page of its own: a General Plan of 217 stands came out as 15 pages (nine insets alone
 * on a sheet each) and, at 1:600, as 144.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js strayPages
 */
import { describe, test, expect } from '@jest/globals'
import PDFDocument from 'pdfkit'
import { pinPageToSheet } from '../pdfkitGeoPDF/pinPageToSheet.js'
import { calculateInsetPositions } from '../pdfkitGeoPDF.js'

const pages = (doc) => doc.bufferedPageRange().count
const newDoc = () => new PDFDocument({ size: [400, 300], margin: 0, bufferPages: true })

describe('pinPageToSheet', () => {
  test('without it, text below the sheet starts a page of its own (the defect)', () => {
    const doc = newDoc()
    doc.fontSize(8).text('below the sheet', 10, 320, { lineBreak: true, width: 200 })
    expect(pages(doc)).toBeGreaterThan(1)
  })

  test('with it, text below the sheet is clipped and no page is added', () => {
    const doc = pinPageToSheet(newDoc())
    doc.fontSize(8).text('below the sheet', 10, 320, { lineBreak: true, width: 200 })
    doc.fontSize(8).text('a caption well below it', 10, 5000, { width: 100 })
    expect(pages(doc)).toBe(1)
  })

  test('a page the renderer adds on purpose is pinned too, and still counts', () => {
    const doc = pinPageToSheet(newDoc())
    doc.addPage({ size: [400, 300], margin: 0 })
    doc.fontSize(8).text('below the second sheet', 10, 320, { width: 200 })
    expect(pages(doc)).toBe(2)
  })
})

describe('calculateInsetPositions never seats an inset off the sheet', () => {
  const logger = { info: () => {}, warn: () => {}, error: () => {} }
  const SIZE = 170                                                        // 60 mm
  const mapBounds = { x: 0, y: 0, width: 1000, height: 600 }
  const manager = (n) => ({
    getInsetDimensions: () => Array.from({ length: n }, (_, i) => ({
      id: `inset${i + 1}`, width: SIZE, height: SIZE, insetNumber: String(i + 1), insetData: {},
    })),
  })
  // A figure that fills the sheet: no free rectangle to find, so every inset reaches the last-resort stack.
  const figureRing = [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 600 }, { x: 0, y: 600 }]
  const run = (n) => {
    const unplaced = []
    const out = calculateInsetPositions(manager(n), mapBounds, null, [], logger, {
      figureRing, footerReserve: 22, unplaced,
    })
    return { out, unplaced }
  }

  test('every position it gives is on the sheet, above the footer band', () => {
    const { out } = run(12)
    for (const p of Object.values(out)) {
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y + p.height).toBeLessThanOrEqual(600 - 22)
    }
  })

  test('the insets with no room are named, not given a position below the sheet', () => {
    const { out, unplaced } = run(12)
    expect(unplaced.length).toBeGreaterThan(0)
    expect(Object.keys(out).length + unplaced.length).toBe(12)
    for (const n of unplaced) expect(out[`inset${n}`]).toBeUndefined()
  })

  test('a few insets that fit are all placed and nothing is reported', () => {
    const { out, unplaced } = run(2)
    expect(unplaced).toEqual([])
    expect(Object.keys(out)).toHaveLength(2)
  })
})
