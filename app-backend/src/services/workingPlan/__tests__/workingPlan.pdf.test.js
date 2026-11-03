import { describe, test, expect } from '@jest/globals'
import { generateWorkingPlan } from '../working-plan.js'
import { workingPlanPdf } from '../working-plan-pdf.js'
import { brackenhurstSpec } from './fixtures/brackenhurstSpec.js'

const PT = 72 / 25.4
/** The page's MediaBox, read from the (uncompressed) page dictionary. */
const mediaBox = (buf) => buf.toString('latin1').match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/).slice(1).map(Number)

describe('working plan PDF', () => {
  for (const [orientation, [w, h]] of Object.entries({ landscape: [297, 210], portrait: [210, 297] })) {
    test(`is one A4 ${orientation} page`, async () => {
      const out = generateWorkingPlan({ ...brackenhurstSpec, orientation })
      const pdf = await workingPlanPdf(out.model)
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
      const [mw, mh] = mediaBox(pdf)
      expect(mw).toBeCloseTo(w * PT, 1)
      expect(mh).toBeCloseTo(h * PT, 1)
      expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1)
    })
  }

  test('is drawn from the same shapes as the DXF, and the DXF is unchanged by recording them', () => {
    const out = generateWorkingPlan(brackenhurstSpec)
    const texts = out.model.doc.ops.filter((o) => o.t === 'text').map((o) => o.str)
    expect(texts).toEqual(expect.arrayContaining(['Survey of', 'SD1', '405']))
    for (const s of texts) expect(out.dxf).toContain(s)
    expect(Object.keys(out)).not.toContain('model')
  })
})
