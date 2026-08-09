import { describe, test, expect } from '@jest/globals'
import zlib from 'zlib'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { generateDXF } from '../dxfGenerator.js'

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }

// PDFKit's default content stream is FlateDecode-compressed, and its
// fontkit-based text layout emits glyph runs as hex strings inside Tj/TJ
// operators rather than literal "(...)" strings — even for the standard
// Helvetica family. So a plain `pdfBuffer.toString('latin1')` never
// contains literal label text. Inflate every stream...endstream block,
// then hex-decode the glyph runs back to text so cartographic labels can
// be matched directly. (Same technique as pdfkitGeoPDF.tickMarks.test.js.)
function extractPdfText(pdfBuffer) {
  const raw = pdfBuffer.toString('latin1')
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

const Y0 = 97360, X0 = 2247150, W = 370, H = 250
const ring = [[Y0, X0], [Y0 + W, X0], [Y0 + W, X0 + H], [Y0, X0 + H], [Y0, X0]]
const sharedPlan = {
  metadata: { designation: 'Stand 1 Test', township: 'T', district: 'D', standCount: 1, standRange: '1', beaconSequence: 'ABCDA', date: '2026-06-15', centralMeridian: 31 },
  parcels: { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { stand: '1', area_m2: W * H } }] },
  beacons: { type: 'FeatureCollection', features: ring.slice(0, 4).map((c, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { name: 'ABCD'[i], pointId: 'ABCD'[i] } })) },
  outsideFigure: {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} }],
  },
  outsideFigureData: {
    edges: [
      { side: 'AB', metres: W.toFixed(3), direction: '90°00\'00"', y: Y0 + W, x: X0 },
      { side: 'BC', metres: H.toFixed(3), direction: '0°00\'00"', y: Y0 + W, x: X0 + H },
      { side: 'CD', metres: W.toFixed(3), direction: '270°00\'00"', y: Y0, x: X0 + H },
      { side: 'DA', metres: H.toFixed(3), direction: '180°00\'00"', y: Y0, x: X0 },
    ],
    coordinates: ring.slice(0, 4).map((c, i) => ({ name: 'ABCD'[i], y: c[0], x: c[1] })),
  },
  sheetSize: 'ISO_A2', scale: { value: 500, label: '1:500' },
}

describe('tick mark count parity between PDF and DXF', () => {
  test('both formats emit the same number of Y= coordinate labels for the same plan', async () => {
    const { pdfBuffer } = await generateGeoPDF(sharedPlan, fakeLogger)
    const decodedText = extractPdfText(pdfBuffer)
    const pdfYLabels = decodedText.match(/Y = [+-][\d ]+/g) || []

    const { buffer: dxfBuffer } = generateDXF(sharedPlan, fakeLogger)
    const dxf = dxfBuffer.toString()
    const dxfLabels = []
    const parts = dxf.split(/^\s*0\s*\r?\n/m)
    for (const e of parts) {
      if (!/^\s*TEXT/.test(e)) continue
      if (!/^\s*8\r?\n\s*GRID\b/m.test(e)) continue
      const t = (e.match(/^\s*1\r?\n\s*([^\r\n]+)/m) || [])[1]
      if (t) dxfLabels.push(t.trim())
    }
    const dxfYLabels = dxfLabels.filter(t => /^Y = [+-][\d ]+$/.test(t))

    // NOTE: this only asserts count parity, not coordinate-value parity.
    // PDF's corner bounds (actualY_min/actualY_max in pdfkitGeoPDF.js) are
    // rounded to the nearest 5m/10m — a legacy cosmetic-rounding rule that
    // predates this feature — while DXF's corner bounds (xL/xR/yB/yT in
    // dxfGenerator.js) are snapped outward to the new
    // chooseTickIntervalMetres(scale) grid interval. The two renderers can
    // therefore land on genuinely different Y values for the same plan even
    // though both correctly space their own ticks at a ruler-safe interval —
    // this is a real, pre-existing PDF/DXF corner-rounding inconsistency
    // (confirmed via git blame to a commit predating this feature), not
    // something this test should paper over or that this feature is scoped
    // to fix. Tracked as a follow-up; asserting count-only here is the
    // honest thing this fixture can prove today.
    expect(pdfYLabels.length).toBe(dxfYLabels.length)
    expect(pdfYLabels.length).toBeGreaterThan(4)
  })
})
