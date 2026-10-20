/**
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitTitleBlock
 *
 * A long stand list wraps in the title block's designation line. The SHEET N line
 * and the figure description used to be positioned as if it had not, so SHEET N
 * was printed on top of the wrapped second line ("MAGLAS TOWNSHIP" over "SHEET 1",
 * 0.7pt apart, on the maglas2283 general plan).
 */
import { describe, test, expect } from '@jest/globals'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { generateSheetedGeoPDF } from '../pdfkitGeoPDF.js'

const P = (y, x) => ({ y, x })
const box = (y0, x0, y1, x1) => [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)]

const sheet = (n) => ({
  sheetNumber: n, totalSheets: 2,
  figureLabel: `Outside Figure Sheet ${n}`, otherSheets: `Sheet ${3 - n}`,
  ring: n === 1 ? [P(50, 0), P(50, 100), P(0, 100), P(0, 0)] : [P(50, 100), P(50, 0), P(100, 0), P(100, 100)],
  stands: [n === 1 ? '1686' : '1687'],
  parcels: [{ name: n === 1 ? '1686' : '1687', ring: box(10, 10, 40, 40), area_m2: 8000 }],
  vertices: [], edges: [], constants: { pointId: 'A', y: 50, x: 0 },
  servitudeRows: [], standRange: '1686 to 1687', totalStandCount: 2, newPoints: [],
})

async function titleItems(pdfBuffer) {
  const pdf = await (await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer), useSystemFonts: false, verbosity: 0 })).promise
  const page = await pdf.getPage(1)
  return (await page.getTextContent()).items
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({ text: i.str.trim(), x: i.transform[4], y: i.transform[5], h: i.height }))
}

const LONG = 'Stands 2283, 2288 - 2293, 2323 - 2361, 2398 - 2409, 2411 - 2433, 2463 - 2473, 2829 - 2833 Maglas Township'
const SHORT = 'Stands 1686 - 1687 Maglas Township'

async function sheetOne(designation) {
  const { pages } = await generateSheetedGeoPDF({
    sheets: [sheet(1), sheet(2)], metadata: { designation, planType: 'general-undeveloped' }, returnPages: true,
  })
  return titleItems(pages[1])
}

describe('title block: SHEET N never overprints the designation', () => {
  test('a designation that wraps leaves SHEET N clear below its LAST line', async () => {
    const items = await sheetOne(LONG)
    const sheetLabel = items.find((i) => i.text === 'SHEET 1')
    expect(sheetLabel).toBeDefined()
    // Designation runs: everything between GENERAL PLAN / "of" and the SHEET line.
    const desig = items.filter((i) => i.y > sheetLabel.y && i.y < sheetLabel.y + 80 &&
      i.text !== 'of' && i.text !== 'GENERAL PLAN')
    expect(desig.length).toBeGreaterThanOrEqual(2)        // it really did wrap
    const lastLineY = Math.min(...desig.map((i) => i.y))
    // The label's baseline sits at least its own line height below the last line's.
    expect(lastLineY - sheetLabel.y).toBeGreaterThanOrEqual(13)
  })

  test('no designation line shares a row with the SHEET N label', async () => {
    const items = await sheetOne(LONG)
    const sheetLabel = items.find((i) => i.text === 'SHEET 1')
    const sameRow = items.filter((i) => i !== sheetLabel && Math.abs(i.y - sheetLabel.y) < 8 &&
      Math.abs((i.x + 1) - sheetLabel.x) < 400)
    expect(sameRow.map((i) => i.text)).toEqual([])
  })

  test('a designation that fits on one line keeps SHEET N directly beneath it', async () => {
    const items = await sheetOne(SHORT)
    const sheetLabel = items.find((i) => i.text === 'SHEET 1')
    const desig = items.find((i) => /^STANDS/.test(i.text))
    expect(desig).toBeDefined()
    expect(desig.y - sheetLabel.y).toBeGreaterThanOrEqual(13)
    expect(desig.y - sheetLabel.y).toBeLessThan(30)        // not pushed down by a phantom wrap
  })
})
