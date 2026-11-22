/**
 * Once the Surveyor-General's office issues the S.R. number (saved with the project), every document prints it:
 * Brackenhurst's diagrams printed 188/2026 while its Report on Survey, Co-ordinate List and Beacon Comparison
 * printed ".... / 2026", because each read a different field.
 */
import { describe, it, expect } from 'vitest'
import { issuedSrNumber, withIssuedSrNumber } from '../srNumber'
import { generateNarrativeReportOnSurveyPDF } from '../reportOnSurveyNarrativeGenerator'
import { generateBeaconComparisonReportPDF } from '../beaconComparisonReportGenerator'
import { srNumberValue } from '../coordinate-list'

const raw = async (b: Blob) => Buffer.from(new Uint8Array(await b.arrayBuffer())).toString('latin1')
const report = {
  srNumber: '',
  purpose: { type: 'private-land', reference: '' },
  surveyBasis: { trigStations: false, townSurveyMarks: false, officialControlPoints: false, previousSurvey: false, localSystem: false },
  beacons: [{
    beaconId: '86B', status: 'found', currentCoordinates: { y: -85728.7, x: 2143972.14 },
    originalData: { coordinates: { y: -85728.77, x: 2143972.22 } }, discrepancy: { dy: 0.07, dx: -0.08 },
  }],
  beaconComparison: { method: 'tabulation', currentSRNumber: 'This Survey', toleranceThreshold: 0, conclusion: 'x' },
  curvilinearBoundaries: { applicable: false }, unusualOccurrences: '',
} as any
const opts = { surveyorName: 'C. Paradzayi', licenseNumber: '293', firm: '', address: '', surveyDate: '2026-07-30', surveyOf: 'x' }

describe('issuedSrNumber', () => {
  it("takes the first number actually issued, the project's first", () => {
    expect(issuedSrNumber('188/2026', '12/2025')).toBe('188/2026')
    expect(issuedSrNumber('', null, '188/2026')).toBe('188/2026')
  })
  it('does not take a placeholder for a number', () => {
    for (const v of ['', '  ', 'N/A', 'n/a', '-', '.... / 2026', '....', 'This Survey']) expect(issuedSrNumber(v)).toBe('')
  })
})

describe('the documents, once the number is issued', () => {
  const issued = withIssuedSrNumber(report, '188/2026')

  it('the Report on Survey prints it', async () => {
    const { pdf } = await generateNarrativeReportOnSurveyPDF(issued, opts)
    const t = await raw(pdf)
    expect(t).toContain('(S.R. No: 188/2026) Tj')
    expect(t).not.toMatch(/\.\.\.\. \/ \d{4}/)
  })

  it('the Beacon Comparison prints it, as its number and as the current survey', async () => {
    const r = await generateBeaconComparisonReportPDF(issued, opts, 1)
    const t = await raw(r!.pdf)
    expect(t).toContain('(S.R. Number: 188/2026) Tj')
    expect(t).toContain('(Current Survey: 188/2026) Tj')
  })

  it('the Co-ordinate List prints it', () => {
    expect(srNumberValue('188/2026')).toBe('188/2026')
  })

  it('leaves the report as it was when no number is issued', () => {
    expect(withIssuedSrNumber(report, '')).toBe(report)
    expect(withIssuedSrNumber(report, '188/2026').beaconComparison.currentSRNumber).toBe('188/2026')
    // a current survey the surveyor named themselves is kept
    const named = { ...report, beaconComparison: { ...report.beaconComparison, currentSRNumber: 'SR 5/2026' } }
    expect(withIssuedSrNumber(named, '188/2026').beaconComparison.currentSRNumber).toBe('SR 5/2026')
  })
})
