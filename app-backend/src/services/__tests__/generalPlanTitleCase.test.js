import { describe, test, expect } from '@jest/globals'
import { generateGeoPDF } from '../pdfkitGeoPDF.js'
import { sampleMinimalPlan } from './fixtures/sampleMinimalPlan.js'

/** Township, immediate parent property and district print in title case on a General Plan. */
const logger = { info() {}, warn() {}, error() {}, debug() {} }

describe('General Plan names are title-cased', () => {
  test('township, parent property and district', async () => {
    const metadata = {
      ...sampleMinimalPlan.metadata,
      surveyOf: 'Stands 1 - 2 MAGLAS TOWNSHIP', township: 'MAGLAS TOWNSHIP',
      parentProperty: 'SHABANI MINE SURFACE RIGHTS A', district: 'GWERU',
    }
    const r = await generateGeoPDF({ ...sampleMinimalPlan, metadata, planType: 'general-undeveloped', recordOps: true }, logger)
    const text = r.ops.filter((o) => o.type === 'text').map((o) => o.text).join('\n')
    expect(text).toContain('Maglas Township')
    expect(text).toContain('Shabani Mine Surface Rights A')
    expect(text).toContain('district of Gweru')
    expect(text).not.toMatch(/MAGLAS|SHABANI|GWERU/)
  }, 120000)
})
