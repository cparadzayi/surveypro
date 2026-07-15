import { describe, it, expect } from 'vitest'
import { generateDispensationCertificatePDF, type DispensationCertificateData } from '../dispensationCertificateGenerator'

const base: DispensationCertificateData = {
  portion: 'developed',
  township: 'MAGLAS TOWNSHIP',
  district: 'SHABANI',
  generalPlanNumber: 'GP 1234',
  certificateNumber: '47',
  surveyTitle: 'SURVEY OF STANDS 1620 - 1621 MAGLAS TOWNSHIP OF MAGLAS',
  dispensationClause: 'Regulation 78 of the Land Survey Regulations',
  surveyorName: 'F. Chitsike',
  licenseNumber: 'RL 123',
  date: '2026-07-14',
  standCount: 2,
  totalArea: 349,
  rows: [
    { stand: '1620', areaM2: 174, boundary: '1620a – 1620b', servitudeType: 'Party wall' },
    { stand: '1621', areaM2: 175, boundary: '1620a – 1620b', servitudeType: 'Party wall' },
  ],
}

describe('generateDispensationCertificatePDF', () => {
  it('returns a non-empty PDF blob and at least one page (developed)', async () => {
    const { blob, pageCount } = await generateDispensationCertificatePDF(base)
    expect(blob.size).toBeGreaterThan(0)
    expect(pageCount).toBeGreaterThanOrEqual(1)
  })
  it('renders without a heading field and with a blank certificate number', async () => {
    const { blob, pageCount } = await generateDispensationCertificatePDF({
      ...base, certificateNumber: undefined, surveyTitle: undefined,
    })
    expect(blob.size).toBeGreaterThan(0)
    expect(pageCount).toBeGreaterThanOrEqual(1)
  })
  it('renders the undeveloped variant with many rows across pages', async () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ stand: String(1600 + i), areaM2: 200, boundary: '', servitudeType: '' }))
    const { blob, pageCount } = await generateDispensationCertificatePDF({ ...base, portion: 'undeveloped', rows, standCount: 80 })
    expect(blob.size).toBeGreaterThan(0)
    expect(pageCount).toBeGreaterThanOrEqual(2)
  })
})
