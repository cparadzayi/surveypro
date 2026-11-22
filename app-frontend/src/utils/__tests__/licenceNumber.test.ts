/**
 * The surveyor's licence number is stated once, on the DSG certificate (1/96), where the surveyor certifies the
 * survey, and spelled the British way ("Licence"). The working documents name the surveyor only.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DSG_COMMON_PHRASES } from '../../data/dsgCertificatePatterns'
import { generateBeaconComparisonReportPDF } from '../beaconComparisonReportGenerator'

const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')

describe('the licence number', () => {
  it('is on the DSG certificate, as "Licence No."', () => {
    const phrases = JSON.stringify(DSG_COMMON_PHRASES)
    expect(phrases).toContain('Licence No. {licenseNumber}')
    expect(phrases).not.toContain('License No.')
    expect(src('dsgCertificateGenerator.ts')).toContain('`Licence No. ${data.licenseNumber}`')
  })

  it('is not printed on the working documents', () => {
    for (const f of ['coordinate-list.ts', 'calculations-part1.ts', 'cover-page.ts', 'area-computation-report.ts',
      'reportOnSurveyGenerator.ts', 'reportOnSurveyNarrativeGenerator.ts', 'beaconComparisonReportGenerator.ts',
      'surveyPlanSummaryGenerator.ts', 'surveyPlanSummaryReport.ts']) {
      expect(src(f), f).not.toMatch(/Licen[cs]e( No|:| Number)/)
    }
  })

  it('does not reach the Beacon Comparison Report', async () => {
    const r = await generateBeaconComparisonReportPDF({
      srNumber: '', beacons: [{
        beaconId: '86B', status: 'found', currentCoordinates: { y: -85728.7, x: 2143972.14 },
        originalData: { coordinates: { y: -85728.77, x: 2143972.22 } }, discrepancy: { dy: 0.07, dx: -0.08 },
      }],
      beaconComparison: { method: 'tabulation', currentSRNumber: 'This Survey', toleranceThreshold: 0, conclusion: 'x' },
    } as any, { surveyorName: 'C. Paradzayi', licenseNumber: '293', surveyDate: '2026-07-30', surveyOf: 'x' }, 1)
    const raw = Buffer.from(new Uint8Array(await r!.pdf.arrayBuffer())).toString('latin1')
    expect(raw).toContain('(Land Surveyor: C. Paradzayi) Tj')
    expect(raw).not.toMatch(/Licen[cs]e|293\)/)
  })
})
