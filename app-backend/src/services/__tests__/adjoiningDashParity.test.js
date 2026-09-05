import { describe, test, expect } from '@jest/globals'
import { drawSubjectAdjoiningFeatures } from '../adjoiningFeatures.js'
import { emitSubjectAdjoiningFeaturesDxf } from '../adjoiningFeaturesDxf.js'
import { CONTIG_STUB_MM, ADJOINING_DASH_ON_MM, ADJOINING_DASH_OFF_MM } from '../diagram/contiguousMarks.js'

/**
 * The same abutment stub was dashed on the PDF and solid on the DXF: PDFKit can
 * dash a path natively, the DXF writers cannot, and nobody was comparing the
 * two. Both now cut the same pattern, and this is what says so.
 */
const PT_PER_MM = 72 / 25.4
const ptRing = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
const ann = [{ side: 'AB', role: 'contiguous', label: 'N', end: 'from' }]

function pdfSegments() {
  const segs = []
  let cur = null
  const doc = new Proxy({}, {
    get(_t, k) {
      if (k === 'widthOfString') return () => 10
      if (k === 'moveTo') return (x, y) => { cur = [x, y]; return doc }
      if (k === 'lineTo') return (x, y) => { segs.push([cur, [x, y]]); return doc }
      return () => doc
    },
  })
  drawSubjectAdjoiningFeatures(doc, { ptRing, annotations: ann, ptPerGroundM: 1 })
  return segs
}

function dxfSegments() {
  const out = []
  emitSubjectAdjoiningFeaturesDxf({
    addLine: (_l, x1, y1, x2, y2) => out.push([[x1, y1], [x2, y2]]),
    addText: () => {},
    ptRing,
    annotations: ann,
    // ground lengths that happen to equal the PDF's points, so the two are
    // directly comparable rather than compared through a scale
    geo: { textHeight: 8, stubLen: CONTIG_STUB_MM * PT_PER_MM, bandLen: 12, standoff: 4 },
    defaultLayer: 'ADJ',
    servitudeLayer: 'ADJ_S',
  })
  return out
}

describe('an abutment stub is drawn the same on both documents', () => {
  test('same number of dashes', () => {
    expect(dxfSegments()).toHaveLength(pdfSegments().length)
  })

  test('dashes break in the same places', () => {
    const p = pdfSegments(), d = dxfSegments()
    for (let i = 0; i < p.length; i++) {
      for (const k of [0, 1]) {
        expect(d[i][k][0]).toBeCloseTo(p[i][k][0], 6)
        expect(d[i][k][1]).toBeCloseTo(p[i][k][1], 6)
      }
    }
  })

  test('and it really is dashed — three dashes, per the stub’s own rule', () => {
    // 8.4 mm is exactly three periods of this pattern; that is where the length
    // came from in the first place.
    const period = ADJOINING_DASH_ON_MM + ADJOINING_DASH_OFF_MM
    expect(Math.floor((CONTIG_STUB_MM + ADJOINING_DASH_OFF_MM) / period)).toBe(3)
    expect(pdfSegments()).toHaveLength(3)
  })
})
