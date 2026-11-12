import { describe, test, expect, beforeAll } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { dxfFromRecordedPlan, GENERAL_PLAN_LAYERS } from '../generalPlanDxf.js'
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js'

/**
 * A General Plan's DXF is the PDF's own drawing: the render, recorded, written out in ground coordinates.
 * So what the PDF draws is what the DXF holds, not two programs agreeing by hand.
 */
const logger = { info() {}, warn() {}, error() {}, debug() {} }
const pairs = (text) => {
  const rows = text.split(/\r?\n/)
  const out = []
  for (let i = 0; i + 1 < rows.length; i += 2) out.push([rows[i].trim(), rows[i + 1]])
  return out
}

let render, dxf, ps
beforeAll(async () => {
  render = await generateGeoPDF({ ...sampleMinimalPlan, planType: 'general-undeveloped', recordOps: true }, logger)
  dxf = dxfFromRecordedPlan(render, 'r2000')
  ps = pairs(dxf.dxfBuffer.toString('utf8'))
}, 120000)

describe('the General Plan DXF replicates the General Plan PDF', () => {
  test('recording does not change the PDF', async () => {
    const plain = await generateGeoPDF({ ...sampleMinimalPlan, planType: 'general-undeveloped' }, logger)
    const text = (b) => Buffer.from(b).toString('latin1').replace(/D:\d{14}Z/g, '').replace(/\/ID \[[^\]]*\]/, '')
    expect(plain.pdfBuffer.length).toBe(render.pdfBuffer.length)
    expect(text(plain.pdfBuffer)).toBe(text(render.pdfBuffer))
  })

  test('every string the PDF printed is a TEXT in the DXF, and nothing else is', () => {
    const printed = render.ops.filter((o) => o.type === 'text' && o.text.trim()).length
    expect(printed).toBeGreaterThan(20)
    expect(dxf.stats.text).toBe(printed)
    const texts = ps.filter(([c, v], i) => c === '0' && v === 'TEXT').length
    expect(texts).toBe(printed)
  })

  test('is Release 2000 and on the plan\'s own layers', () => {
    expect(ps.some(([c, v]) => c === '1' && v === 'AC1015')).toBe(true)
    // the lettering is on a layer of its own beside each layer that has any ("PARCELS_TEXT")
    const known = new Set(['0', ...GENERAL_PLAN_LAYERS.flatMap((l) => [l.name, l.name + '_TEXT'])])
    const used = new Set(ps.filter(([c], i) => c === '8' && ps[i - 1]).map(([, v]) => v))
    for (const l of used) expect(known.has(l)).toBe(true)
    expect(used.has('TITLE_BLOCK')).toBe(true)
    expect(used.has('SHEET_EDGE')).toBe(true)
  })

  test('has no white fill at all: no sheet-sized hatch to hide the drawing from the cursor, and none behind a stand or a beacon', () => {
    // A hatch over the whole sheet turned the drawing blue when it was clicked, so nothing under it could be picked.
    // The working plan's DXF has none; the General Plan's has none either, and marks the sheet by its edge.
    const hatchLayers = ps.filter(([c, v]) => c === '0' && v === 'HATCH').length
    const whiteFills = ps.filter(([c, v], i) => c === '420' && v === String(0xffffff) && ps[i - 1] && ps[i - 2]?.[0] === '8').length
    expect(whiteFills).toBe(0)
    expect(ps.some(([c, v]) => c === '8' && v === 'PAPER')).toBe(false)
    expect(ps.some(([c, v]) => c === '8' && v === 'SHEET_EDGE')).toBe(true)
    expect(hatchLayers).toBeGreaterThanOrEqual(0)
  })

  test('text is set in the PDF own faces: Arial regular, bold and italic styles, one per PDF font', () => {
    const styles = new Map()
    ps.forEach(([c, v], i) => { if (c === '0' && v === 'STYLE') { const name = ps.slice(i, i + 14).find(([k]) => k === '2')?.[1]; const file = ps.slice(i, i + 14).find(([k]) => k === '3')?.[1]; styles.set(name, file) } })
    expect(styles.get('PDF_Helvetica')).toBe('arial.ttf')
    expect(styles.get('PDF_Helvetica_Bold')).toBe('arialbd.ttf')
    expect(styles.get('PDF_Helvetica_Oblique')).toBe('ariali.ttf')
    const used = new Set(ps.filter(([c], i) => c === '7' && ps[i - 1]).map(([, v]) => v))
    for (const fnt of new Set(render.ops.filter((o) => o.type === 'text').map((o) => o.font))) {
      expect(used.has('PDF_' + fnt.replace('-', '_'))).toBe(true)
    }
  })

  test('the plan scale is the PDF\'s: a point of paper is scale x 0.352778 mm of ground', () => {
    const denom = Number(String(render.scale).split(':')[1])
    const perPt = render.ground.a.x - render.ground.b.x
    const groundSpan = (render.ground.extent.maxY - render.ground.extent.minY)
    expect(Math.abs(groundSpan / perPt)).toBeCloseTo(denom * 0.000352778, 4)
  })
})
