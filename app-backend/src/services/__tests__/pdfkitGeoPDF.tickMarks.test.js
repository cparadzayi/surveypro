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
  test('emits an intermediate grid tick, not just the two extremes, on each axis', async () => {
    const { pdfBuffer } = await generateGeoPDF(shabaniLikePlan, fakeLogger)
    const decodedText = extractPdfText(pdfBuffer)
    // Ticks are now BORDER (graticule) ticks on the map neatline rather than
    // crosses over the figure, so each grid VALUE is labelled once per axis
    // instead of once per perimeter cross. The old ">4" count counted crosses;
    // under this model the meaningful property is that the grid is not degenerate
    // — at least one tick between the two extremes, so a Surveyor-General has an
    // adjacent pair to check with a 30cm scale ruler.
    const yLabels = [...new Set(decodedText.match(/Y = [+-][\d ]+/g) || [])]
    const xLabels = [...new Set(decodedText.match(/X = [+-][\d ]+/g) || [])]
    // Fixture Y 97360-97730, X 2247150-2247400 at 1:500 -> interval 100,
    // giving Y 97400/97500/97600/97700 and X 2247200/2247300/2247400.
    expect(yLabels.length).toBe(4)
    expect(xLabels.length).toBe(3)
    expect(yLabels.length).toBeGreaterThan(2)
    expect(xLabels.length).toBeGreaterThan(2)
  })

  test('left/right tick corners clamp inward when they would overflow the map edge (Westing axis)', async () => {
    // shabaniLikePlan (defined above): a figure whose Y (Westing) extent,
    // once snapped to the tick interval, would place a corner tick's label
    // past the left or right map edge. Reuses the same Y0/X0/W/H shape as
    // tickMarkParity.test.js's sharedPlan fixture.
    const { pdfBuffer } = await generateGeoPDF(shabaniLikePlan, fakeLogger)
    const decodedText = extractPdfText(pdfBuffer)
    const yLabels = (decodedText.match(/Y = [+-][\d ]+/g) || []).map(s => s.trim())
    // Before this task's fix, PDF's Y bounds were always the raw
    // actualY_min/actualY_max (97300/97800 for this fixture) — never
    // clamped. After the fix, if the left or right edge would overflow,
    // the corresponding bound steps inward by _tickIntervalM. This
    // fixture's DXF corner-cross output (already correct, unaffected by
    // this task) shows Y clamping to 97400-97700 — assert PDF now matches.
    expect(yLabels).toEqual(expect.arrayContaining(['Y = +97 400', 'Y = +97 700']))
    expect(yLabels).not.toEqual(expect.arrayContaining(['Y = +97 300']))
    expect(yLabels).not.toEqual(expect.arrayContaining(['Y = +97 800']))
  })
})
