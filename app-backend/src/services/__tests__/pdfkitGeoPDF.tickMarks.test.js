import { describe, test, expect } from '@jest/globals'
import zlib from 'zlib'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'

const fakeLogger = { info: () => {}, warn: () => {}, error: () => {} }

// PDFKit's default content stream is FlateDecode-compressed, and its
// fontkit-based text layout emits glyph runs as hex strings inside Tj/TJ
// operators (e.g. "<47454e4552414c20504c414e> Tj" for "GENERAL PLAN")
// rather than literal "(...)" strings — even for the standard Helvetica
// family. So a plain `pdfBuffer.toString('latin1')` never contains literal
// label text. Inflate every stream...endstream block, then hex-decode the
// glyph runs back to text so cartographic labels can be matched directly.
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

// A figure sized like the real Shabani plan that motivated this feature:
// 1:500 scale, ~370m x 250m extent. At 4-corners-only, the shorter edge
// alone (250m -> 50cm on paper) already exceeds a 30cm ruler.
const Y0 = 97360, X0 = 2247150, W = 370, H = 250
const ring = [[Y0, X0], [Y0 + W, X0], [Y0 + W, X0 + H], [Y0, X0 + H], [Y0, X0]]
const shabaniLikePlan = {
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
  sheetSize: 'SI727_500x400', scale: { value: 500, label: '1:500' },
}

describe('renderOutsideFigureTickMarks — grid compliance', () => {
  test('emits a coordinate grid with intermediate nodes, every cross carrying both axes', async () => {
    const { pdfBuffer } = await generateGeoPDF(shabaniLikePlan, fakeLogger)
    const decodedText = extractPdfText(pdfBuffer)
    const ys = [...new Set(decodedText.match(/Y = [+-]\d+/g) || [])]
    const xs = [...new Set(decodedText.match(/X = [+-]\d+/g) || [])]
    // A coordinate cross marks a grid INTERSECTION, so it carries both a Y and
    // an X label — the convention on the Surveyor-General reference plan.
    expect(ys.length).toBeGreaterThan(2)
    expect(xs.length).toBeGreaterThan(2)
  })

  test('labels use the reference format — signed, no thousands separators', async () => {
    const { pdfBuffer } = await generateGeoPDF(shabaniLikePlan, fakeLogger)
    const decodedText = extractPdfText(pdfBuffer)
    // The reference plan writes "X = +2247100", grouping nothing. The old
    // space-grouped form ("X = +2 247 100") was ours, not the standard.
    expect(decodedText).toMatch(/Y = \+97\d{3}/)
    expect(decodedText).not.toMatch(/Y = \+97 \d/)
    expect(decodedText).not.toMatch(/X = \+2 247/)
  })

  test('every grid node sits on a whole multiple of the interval', async () => {
    const { pdfBuffer } = await generateGeoPDF(shabaniLikePlan, fakeLogger)
    const decodedText = extractPdfText(pdfBuffer)
    const ys = [...new Set(decodedText.match(/Y = [+-]\d+/g) || [])]
      .map(t => Math.abs(Number(t.replace('Y = ', ''))))
    expect(ys.length).toBeGreaterThan(0)
    // 1:500 with the reference's 100mm paper target resolves to a 50m grid.
    for (const v of ys) expect(v % 50).toBe(0)
  })
})
