/**
 * The Report on Survey fits on a single page, signature included, where it can: drawn as it always was when that
 * fits, else compacted only as far as it needs (REPORT_LAYOUTS), else on as few pages as possible.
 */
import { describe, it, expect } from 'vitest'
import { generateNarrativeReportOnSurveyPDF, NarrativeReportOnSurveyGenerator, REPORT_LAYOUTS } from '../reportOnSurveyNarrativeGenerator'

const raw = async (b: Blob) => Buffer.from(new Uint8Array(await b.arrayBuffer())).toString('latin1')
const report = (unusual: string) => ({
  srNumber: '188/2026',
  purpose: { type: 'private-land', reference: '' },
  surveyBasis: { trigStations: false, townSurveyMarks: false, officialControlPoints: false, previousSurvey: false, localSystem: false },
  beacons: [], curvilinearBoundaries: { applicable: false }, unusualOccurrences: unusual,
}) as any
const opts = { surveyorName: 'C. Paradzayi', licenseNumber: '293', firm: '', address: '', surveyDate: '2026-07-30', surveyOf: 'Stands 403 - 405', district: 'Gwelo' }
const sentence = 'The fence on the eastern boundary encroaches 0.4 m onto the road reserve and was pointed out to the owner. '

describe('the Report on Survey on one page', () => {
  it('keeps the standard layout when the report already fits', async () => {
    const r = await generateNarrativeReportOnSurveyPDF(report(''), opts)
    expect(r.pageCount).toBe(1)
    expect(r.layout).toBe('standard')
  })

  it('compacts a report that would run to a second page, keeping the signature on the page', async () => {
    const text = sentence.repeat(14)
    const standard = await new NarrativeReportOnSurveyGenerator(REPORT_LAYOUTS[0]).generate(report(text), opts)
    expect(standard.pageCount).toBe(2)
    const r = await generateNarrativeReportOnSurveyPDF(report(text), opts)
    expect(r.pageCount).toBe(1)
    expect(r.layout).not.toBe('standard')
    const t = await raw(r.pdf)
    expect(t).toContain('(Land Surveyor) Tj')
    expect(t).toContain('(C. Paradzayi) Tj')
  })

  it('prints a report too long for any layout in full, on as few pages as possible', async () => {
    const r = await generateNarrativeReportOnSurveyPDF(report(sentence.repeat(80)), opts)
    expect(r.pageCount).toBeGreaterThan(1)
    const counts = await Promise.all(REPORT_LAYOUTS.map(async (L) => (await new NarrativeReportOnSurveyGenerator(L).generate(report(sentence.repeat(80)), opts)).pageCount))
    expect(r.pageCount).toBe(Math.min(...counts))
  })
})
