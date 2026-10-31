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
    const known = new Set(['0', ...GENERAL_PLAN_LAYERS.map((l) => l.name)])
    const used = new Set(ps.filter(([c], i) => c === '8' && ps[i - 1]).map(([, v]) => v))
    for (const l of used) expect(known.has(l)).toBe(true)
    expect(used.has('TITLE_BLOCK')).toBe(true)
    expect(used.has('SHEET_EDGE')).toBe(true)
  })

  test('the plan scale is the PDF\'s: a point of paper is scale x 0.352778 mm of ground', () => {
    const denom = Number(String(render.scale).split(':')[1])
    const perPt = render.ground.a.x - render.ground.b.x
    const groundSpan = (render.ground.extent.maxY - render.ground.extent.minY)
    expect(Math.abs(groundSpan / perPt)).toBeCloseTo(denom * 0.000352778, 4)
  })
})
