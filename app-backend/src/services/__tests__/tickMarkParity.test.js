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
  sheetSize: 'SI727_500x400', scale: { value: 500, label: '1:500' },
}

describe('tick mark count parity between PDF and DXF', () => {
  test('PDF now uses the same scale-aware interval and clamps all 4 edges like DXF — a separate, deeper mapBounds-sizing gap remains for this fixture', async () => {
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

    // Two real, distinct PDF/DXF gaps were found and fixed in this area
    // (see docs/superpowers/specs/2026-08-10-pdf-dxf-corner-rounding-parity-design.md):
    //   1. PDF's corner-snap interval was a legacy fixed 5m/10m/50m rule;
    //      unified with DXF's scale-aware chooseTickIntervalMetres
    //      (Task 1, commit 2685ea9).
    //   2. PDF had no left/right (Westing) edge clamp at all, unlike DXF's
    //      four-sided clamp; added (Task 2, commit 835c178).
    // A THIRD, deeper divergence was found and deliberately NOT fixed here
    // (out of scope, tracked separately): for this fixture, PDF's
    // mapBounds (the drawing rectangle) reserves less room for the same
    // figure than DXF's content area does — the snapped tick corner lands
    // outside mapBounds by ~73pt even at a ZERO clamp margin, so no
    // margin-constant tuning (attempted, then abandoned as ineffective)
    // can close it; it needs its own investigation into PDF/DXF
    // mapBounds/content-area sizing parity, a materially different,
    // broader question than tick-corner rounding.
    //
    // As a direct, measured consequence, PDF now emits 10 Y-labels vs
    // DXF's 12 for this fixture. Before Tasks 1+2, this count happened to
    // be EQUAL (both 12) — but that was coincidence, not agreement: the
    // old PDF logic (wrong snap interval, no Westing clamp at all) and
    // DXF's logic were each wrong in ways that happened to cancel out for
    // this specific geometry. Tasks 1+2 make PDF's logic correct on its
    // own terms, which is why this exact number changed — not a
    // regression, a more honest count that surfaces the real, separate,
    // now-documented gap instead of masking it.
    //
    // Task 3 (SI 727 native sheet sizes): this fixture's sheetSize was
    // renamed ISO_A2 -> SI727_500x400, which is a real, smaller drawing
    // area (500x400mm vs the old 594x420mm substitute), not just a string
    // swap. DXF's grid-tick emission has less room for intermediate ticks
    // on the smaller sheet, so its Y-label count dropped from 12 to 10 —
    // confirmed empirically via Jest actual output. This happens to close
    // the PDF/DXF count gap for this specific fixture (both now 10), but
    // the underlying mapBounds/content-area sizing gap this test documents
    // is unrelated and remains open (see comment above).
    //
    // Inward tick bounds (2026-08-12, computeInwardTickBounds): both PDF
    // call sites now round the figure's true min/max INWARD instead of
    // outward. Both counts stay at 10 and — verified by dumping the actual
    // decoded label values before and after — the emitted labels are
    // byte-identical (Y 97400..97700, X 2247200..2247400). That is not the
    // fix failing to apply: for THIS fixture the pre-existing map-edge
    // clamp (the ~73pt mapBounds gap documented above) was already walking
    // the outward-rounded bounds all the way down to exactly the values
    // inward rounding now produces directly. The clamp only ever moves
    // bounds further inward, so it composes on top of the new, already
    // more-inward starting point and this clamp-dominated fixture is
    // insensitive to the change. computeInwardTickBounds' own rounding is
    // covered directly in block-definitions-tickmarks.test.js.
    expect(pdfYLabels.length).toBe(10)
    expect(dxfYLabels.length).toBe(10)
  })
})
