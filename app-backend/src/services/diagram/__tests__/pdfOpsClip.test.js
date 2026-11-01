import { describe, test, expect } from '@jest/globals'
import PDFDocument from 'pdfkit'
import { recordPdfOps } from '../pdfOps.js'

/**
 * An inset draws its stands under a clip rectangle, so only what is inside the frame shows in the PDF.
 * The recorded drawing (and so the DXF) must be cut to the same frame, or the whole of every stand
 * the inset window only touches is drawn across the sheet.
 */
const fresh = () => recordPdfOps(new PDFDocument({ size: [400, 400], margin: 0 }))

describe('the recorder honours a clip rectangle', () => {
  test('a line crossing the frame is cut to it; one wholly outside is dropped', () => {
    const { doc, ops } = fresh()
    doc.save().rect(100, 100, 100, 100).clip()
    doc.moveTo(0, 150).lineTo(300, 150).stroke()
    doc.moveTo(0, 10).lineTo(300, 10).stroke()
    doc.restore()
    const strokes = ops.filter((o) => o.type === 'stroke')
    expect(strokes).toHaveLength(1)
    expect(strokes[0].pts).toEqual([[100, 150], [200, 150]])
  })

  test('a filled ring is cut to the frame', () => {
    const { doc, ops } = fresh()
    doc.save().rect(100, 100, 100, 100).clip()
    doc.rect(0, 0, 150, 150).fill('#000000')
    doc.restore()
    const fill = ops.find((o) => o.type === 'fill')
    const xs = fill.rings[0].map((p) => p[0]), ys = fill.rings[0].map((p) => p[1])
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([100, 150, 100, 150])
  })

  test('text and circles outside the frame are dropped, inside kept, and restore lifts the clip', () => {
    const { doc, ops } = fresh()
    doc.save().rect(100, 100, 100, 100).clip()
    doc.fontSize(8).text('in', 120, 120)
    doc.text('out', 300, 300)
    doc.circle(150, 150, 3).stroke()
    doc.circle(350, 350, 3).stroke()
    doc.restore()
    doc.text('after', 300, 300)
    expect(ops.filter((o) => o.type === 'text').map((o) => o.text)).toEqual(['in', 'after'])
    expect(ops.filter((o) => o.type === 'circle')).toHaveLength(1)
  })
})
