import { describe, it, expect } from 'vitest'
import { generateDispensationCertificatePDF, type DispensationCertificateData } from '../dispensationCertificateGenerator'

const base: DispensationCertificateData = {
  portion: 'developed',
  heading: 'DISPENSATION CERTIFICATE — DEVELOPED PORTION',
  township: 'MAGLAS TOWNSHIP',
  district: 'SHABANI',
  generalPlanNumber: 'GP 1234',
  dispensationClause: 'Regulation 78 of the Land Survey Regulations',
  surveyorName: 'F. Chitsike',
  licenseNumber: 'RL 123',
  date: '2026-07-14',
  standCount: 2,
  totalArea: 349,
  rows: [
    { stand: '1620', areaM2: 174, servitudeText: 'The boundary (1620a – 1620b) is subject to a Party wall servitude between Stand 1620 and Stand 1621' },
    { stand: '1621', areaM2: 175, servitudeText: 'The boundary (1620a – 1620b) is subject to a Party wall servitude between Stand 1620 and Stand 1621' },
  ],
}

describe('generateDispensationCertificatePDF', () => {
  it('returns a non-empty PDF blob and at least one page (developed)', async () => {
    const { blob, pageCount } = await generateDispensationCertificatePDF(base)
    expect(blob.size).toBeGreaterThan(0)
    expect(pageCount).toBeGreaterThanOrEqual(1)
  })
  it('renders the undeveloped variant with many rows across pages', async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ stand: String(1600 + i), areaM2: 200, servitudeText: '' }))
    const { blob, pageCount } = await generateDispensationCertificatePDF({ ...base, portion: 'undeveloped', rows, standCount: 80 })
    expect(blob.size).toBeGreaterThan(0)
    expect(pageCount).toBeGreaterThanOrEqual(2)
  })
})
