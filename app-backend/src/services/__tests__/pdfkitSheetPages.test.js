/**
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js pdfkitSheetPages
 *
 * generateSheetedGeoPDF renders one PDF page per SheetPayload (task 4 of the
 * multi-sheet-rendering plan). Payloads are produced by
 * app-frontend/src/utils/sheetPayloads.ts and serialised as plain JSON.
 *
 * NOTE on text extraction: PDFKit's content stream is FlateDecode-compressed
 * AND its text-showing operators emit glyph runs as hex strings inside Tj/TJ
 * (e.g. "<53484545542031>" for "SHEET 1") rather than literal "(...)" strings —
 * even for the standard Helvetica family, and independent of the `compress`
 * option (verified empirically: a minimal compress:false PDFKit doc still hex-
 * encodes "SHEET 1" as `<53484545542031>`). A plain `pdfBuffer.toString('latin1')`
 * therefore never contains literal label text. This is exactly the discovery
 * already recorded in `pdfkitGeoPDF.tickMarks.test.js` (see its own
 * `extractPdfText` helper) — the brief's proposed `textOf` helper (naive
 * `.toString('latin1')`, no inflate/hex-decode step) cannot pass regardless of
 * implementation correctness, so this file inflates every stream and hex-decodes
 * the glyph runs, matching the established convention, instead of copying the
 * brief's helper verbatim. See task-4-report.md for the full objection.
 */
import { describe, test, expect } from '@jest/globals'
import zlib from 'zlib'
import { generateSheetedGeoPDF } from '../pdfkitGeoPDF.js'

const P = (y, x) => ({ y, x })

/** Two sheets, as buildSheetPayloads would hand them over. */
const payloads = () => [
  {
    sheetNumber: 1, totalSheets: 2,
    figureLabel: 'Outside Figure Sheet 1', otherSheets: 'Sheet 2',
    ring: [P(50, 0), P(50, 100), P(0, 100), P(0, 0)],
    stands: ['1686'],
    vertices: [], edges: [], constants: { pointId: 'A', y: 50, x: 0 },
    servitudeRows: [], standRange: '1686 to 1687', totalStandCount: 2, newPoints: [],
  },
  {
    sheetNumber: 2, totalSheets: 2,
    figureLabel: 'Outside Figure Sheet 2', otherSheets: 'Sheet 1',
    ring: [P(50, 100), P(50, 0), P(100, 0), P(100, 100)],
    stands: ['1687'],
    vertices: [], edges: [], constants: { pointId: 'A', y: 50, x: 100 },
    servitudeRows: [], standRange: '1686 to 1687', totalStandCount: 2, newPoints: [],
  },
]

/** Inflate every stream…endstream block, then hex-decode the Tj/TJ glyph runs. */
function extractPdfText(pdfBuffer) {
  const raw = Buffer.from(pdfBuffer).toString('latin1')
  let inflatedText = ''
  let idx = 0
  while (true) {
    const streamIdx = raw.indexOf('stream', idx)
    if (streamIdx === -1) break
    let bodyStart = streamIdx + 6
    if (raw[bodyStart] === '\r') bodyStart++
    if (raw[bodyStart] === '\n') bodyStart++
    const endIdx = raw.indexOf('endstream', bodyStart)
    if (endIdx === -1) break
    try {
      const body = Buffer.from(raw.slice(bodyStart, endIdx), 'latin1')
      inflatedText += zlib.inflateSync(body).toString('latin1')
    } catch {
      // Not a Flate-compressed stream (e.g. an embedded font program) — skip.
    }
    idx = endIdx + 9
  }
  let decodedText = ''
  const hexStringRe = /<([0-9a-fA-F]+)>/g
  let match
  while ((match = hexStringRe.exec(inflatedText))) {
    decodedText += Buffer.from(match[1], 'hex').toString('latin1')
  }
  return decodedText
}

const textOf = (pdf) => extractPdfText(pdf)

describe('generateSheetedGeoPDF', () => {
  test('emits one page per sheet, plus the key plan', async () => {
    const { pageCount } = await generateSheetedGeoPDF({ sheets: payloads(), metadata: {} })
    expect(pageCount).toBe(3)
  })

  test('each page names its own sheet, not the plan', async () => {
    const { pdf } = await generateSheetedGeoPDF({ sheets: payloads(), metadata: {} })
    const raw = textOf(pdf)
    expect(raw).toContain('SHEET 1')
    expect(raw).toContain('SHEET 2')
  })

  test('a sheet carries only its own stands in its schedule', async () => {
    // The whole point of per-sheet derivation: 1687 must not appear on sheet 1.
    const { pages } = await generateSheetedGeoPDF({ sheets: payloads(), metadata: {}, returnPages: true })
    const pageText = pages.map(textOf)
    expect(pageText[1]).toContain('1686')
    expect(pageText[1]).not.toContain('1687')
    expect(pageText[2]).toContain('1687')
    expect(pageText[2]).not.toContain('1686')
  })

  test('a single-sheet plan gets no SHEET chrome and no key plan', async () => {
    const one = [{ ...payloads()[0], sheetNumber: 1, totalSheets: 1, figureLabel: 'Outside Figure', otherSheets: '' }]
    const { pageCount, pdf } = await generateSheetedGeoPDF({ sheets: one, metadata: {} })
    expect(pageCount).toBe(1)
    expect(textOf(pdf)).not.toContain('SHEET 1 OF')
  })
})
