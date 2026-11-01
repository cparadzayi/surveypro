import { describe, test, expect } from '@jest/globals'
import PDFDocument from 'pdfkit'
import { recordPdfOps } from '../pdfOps.js'

/** PDFKit wraps text given a width; the record must hold the lines it printed, not the one long string. */
const fresh = () => recordPdfOps(new PDFDocument({ size: [400, 400], margin: 0 }))

describe('the recorder wraps text where PDFKit does', () => {
  test('a string wider than its box becomes one op per line, stacked downward', () => {
    const { doc, ops } = fresh()
    doc.fontSize(10).fillColor('#000000')
    doc.text('PART OF THE REMAINING EXTENT OF SHABANI MINE SURFACE RIGHTS', 20, 50, { width: 120 })
    const t = ops.filter((o) => o.type === 'text')
    expect(t.length).toBeGreaterThan(1)
    expect(t.map((o) => o.text).join(' ')).toBe('PART OF THE REMAINING EXTENT OF SHABANI MINE SURFACE RIGHTS')
    for (const o of t) expect(o.width).toBeLessThanOrEqual(120 + 0.001)
    for (let i = 1; i < t.length; i++) expect(t[i].y).toBeGreaterThan(t[i - 1].y)
  })

  test('a string that fits, and a string with no width, stay single ops', () => {
    const { doc, ops } = fresh()
    doc.fontSize(10)
    doc.text('SHORT', 20, 50, { width: 120 })
    doc.text('NO BOX AT ALL SO IT RUNS ON AS ONE LINE', 20, 80)
    expect(ops.filter((o) => o.type === 'text')).toHaveLength(2)
  })

  test('underlined text records a rule under each line, as wide as the line', () => {
    const { doc, ops } = fresh()
    doc.fontSize(10)
    doc.text('Stand 1345 of Sebanga Poort', 20, 50, { width: 300, align: 'center', underline: true })
    const t = ops.find((o) => o.type === 'text'), u = ops.find((o) => o.type === 'stroke')
    expect(u).toBeDefined()
    expect(u.pts[0][1]).toBeGreaterThan(t.y)
    expect(Math.abs(u.pts[1][0] - u.pts[0][0] - t.width)).toBeLessThan(0.01)
  })
})
