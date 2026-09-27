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
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { generateSheetedGeoPDF } from '../pdfkitGeoPDF.js'

const P = (y, x) => ({ y, x })
const box = (y0, x0, y1, x1) => [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)]

/**
 * Two sheets, as buildSheetPayloads would hand them over: a 200 x 100 m figure
 * cut down the middle, ONE stand each side, each carrying its own parcel.
 */
const payloads = () => [
  {
    sheetNumber: 1, totalSheets: 2,
    figureLabel: 'Outside Figure Sheet 1', otherSheets: 'Sheet 2',
    ring: [P(50, 0), P(50, 100), P(0, 100), P(0, 0)],
    stands: ['1686'],
    parcels: [{ name: '1686', ring: box(10, 10, 40, 40), area_m2: 8000 }],
    vertices: [], edges: [], constants: { pointId: 'A', y: 50, x: 0 },
    servitudeRows: [], standRange: '1686 to 1687', totalStandCount: 2, newPoints: [],
  },
  {
    sheetNumber: 2, totalSheets: 2,
    figureLabel: 'Outside Figure Sheet 2', otherSheets: 'Sheet 1',
    ring: [P(50, 100), P(50, 0), P(100, 0), P(100, 100)],
    stands: ['1687'],
    parcels: [{ name: '1687', ring: box(60, 10, 90, 40), area_m2: 25000 }],
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

/**
 * Every text run the PDF actually drew, in the order pdfjs-dist reports them,
 * with its page and position. Uses pdfjs-dist — the same extraction
 * `pdfkitGeoPDF.snapshot.test.js` reads positions with — rather than re-parsing
 * the content stream, because the hex-decoder above deliberately throws the
 * coordinates away AND concatenates every glyph run in the file with no
 * separator, so a short numeric assertion against it can be satisfied by binary
 * noise: '8000' out of an unfixed renderer was a false positive, which is
 * exactly how a test that cannot fail gets written.
 */
async function textItemsOf(pdfBuffer) {
  const pdf = await (await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer), useSystemFonts: false, verbosity: 0,
  })).promise
  const items = []
  for (let p = 1; p <= pdf.numPages; p++) {
    for (const it of (await (await pdf.getPage(p)).getTextContent()).items) {
      if (!it.str || !it.str.trim()) continue
      items.push({
        page: p,
        text: it.str.trim(),
        x: Math.round(it.transform[4] * 10) / 10,
        y: Math.round(it.transform[5] * 10) / 10,
      })
    }
  }
  return items
}

/** The exact strings drawn for `needle`, with where. */
const positionsOf = async (pdfBuffer, needle) =>
  (await textItemsOf(pdfBuffer)).filter((i) => i.text === needle)

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
    // Asserted as 'SHEET 1', not 'SHEET 1 OF': the test claims there is NO sheet
    // chrome, and a single sheet has no other sheet to refer to, so the label
    // would say nothing. The narrower string would pass even if 'SHEET 1' were
    // drawn, which is the thing this test exists to forbid.
    expect(textOf(pdf)).not.toContain('SHEET 1')
  })

  test("a sheet's schedule carries its parcels' areas, not blank cells", async () => {
    // The payload carried stand NAMES only at first, and every Area cell came out
    // blank — a schedule of areas with no areas is not lodgeable. Found by
    // rendering a page, not by a test; the other assertions in this file are all
    // about names and chrome and cannot see it.
    const { pages } = await generateSheetedGeoPDF({ sheets: payloads(), metadata: {}, returnPages: true })
    // 8000 m2 prints as whole square metres; 25000 m2 as 2.5 Ha, because
    // formatAreaValue switches to hectares at 1 Ha. Asserted on the exact drawn
    // run, not on a substring of the whole file.
    expect((await textItemsOf(pages[1])).map((i) => i.text)).toContain('8000')
    expect((await textItemsOf(pages[2])).map((i) => i.text)).toContain('2.5000Ha')
  })

  test('two stands on one sheet are labelled where their own parcels put them', async () => {
    // With synthetic parcels sharing the sheet's ring there was nothing to place
    // a stand by, so two number labels landed on top of each other. Distinct
    // positions is the claim; the exact spot belongs to the placement engine.
    const twoOnOneSheet = [{
      ...payloads()[0],
      sheetNumber: 1, totalSheets: 1, figureLabel: 'Outside Figure', otherSheets: '',
      ring: [P(0, 0), P(100, 0), P(100, 100), P(0, 100)],
      stands: ['1686', '1687'],
      parcels: [
        { name: '1686', ring: box(10, 10, 40, 40), area_m2: 1200 },
        { name: '1687', ring: box(60, 60, 90, 90), area_m2: 900 },
      ],
    }]
    const { pdf } = await generateSheetedGeoPDF({ sheets: twoOnOneSheet, metadata: {} })

    const at1686 = await positionsOf(pdf, '1686')
    const at1687 = await positionsOf(pdf, '1687')
    // Each stand is named at least once (schedule, figure label, designation).
    expect(at1686.length).toBeGreaterThan(0)
    expect(at1687.length).toBeGreaterThan(0)
    // ...and no drawing of one sits on top of a drawing of the other.
    for (const a of at1686) {
      for (const b of at1687) {
        const apart = Math.hypot(a.x - b.x, a.y - b.y)
        expect(apart).toBeGreaterThan(5)
      }
    }
  }, 120000)
})
