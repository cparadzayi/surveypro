// @vitest-environment happy-dom
//
// jsPDF needs a DOM to construct.
import { describe, it, expect } from 'vitest'
// @ts-expect-error — ?raw has no ambient type declaration in this project
import sampleXml from './fixtures/siteCalibrationReport.xml?raw'
import { parseSiteCalibration } from '../siteCalibration'
import { FieldBookGenerator, type FieldBookPoint, type FieldBookMetadata } from '../field-book'
import { buildCalibrationReportPDF, generateCalibrationReportPDF, renderCalibrationContent } from '../calibration-pdf'

const cal = parseSiteCalibration(sampleXml)

const metadata: FieldBookMetadata = { surveyorName: 'A. Surveyor' }
const points: FieldBookPoint[] = [{ id: 'P1', y: 97538.004, x: 2247107.872, status: 'F', description: 'peg' }]

/** Text emitted on physical page 1 of the standalone report. */
function reportText() {
  return (buildCalibrationReportPDF(cal, {
    surveyorName: 'A. Surveyor',
    projectTitle: 'Erf 5 Harare',
  }) as any).internal.pages.at(1).join(' ')
}

describe('generateCalibrationReportPDF', () => {
  it('returns a one-page PDF blob', () => {
    const result = generateCalibrationReportPDF(cal)
    expect(result.pageCount).toBe(1)
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.blob.size).toBeGreaterThan(0)
  })

  it('titles the report and names the survey when known', () => {
    const text = reportText()
    expect(text).toContain('GNSS SITE CALIBRATION')
    expect(text).toContain(cal.reportName)
    expect(text).toContain('Project:')
    expect(text).toContain('Surveyor: A. Surveyor')
    expect(text).toContain('Erf 5 Harare')
  })

  it('omits the surveyor/meta lines when none are supplied', () => {
    const text = (buildCalibrationReportPDF(cal) as any).internal.pages.at(1).join(' ')
    expect(text).toContain('GNSS SITE CALIBRATION')
    expect(text).not.toContain('Surveyor:')
  })

  it('carries the same evidence as the field book E1 page', async () => {
    const report = reportText()
    const { pdf } = await new FieldBookGenerator().generateFieldBookPDF(points, metadata, cal)
    // The cover is physical page 1, so the calibration that opens the numbered
    // book is physical page 2 (pages[0] is unused).
    const fieldBookPage = (pdf as any).internal.pages.at(2).join(' ')

    // The report is fronted by its own title block, so the two cannot be
    // identical; the shared body must be. Every calibration detail the field
    // book shows must appear in the standalone report.
    expect(report).toContain('Scale Factor')
    expect(report).toContain('Rotation')
    expect(report).toContain('Adjusted parameters')
    expect(report).toContain('Control points')
    expect(report).toContain('Largest horizontal residual')
    expect(report).toMatch(/Horizontal[- ]only/i)
    expect(report).toContain('0.008 m')

    for (const pair of cal.pairs) {
      expect(report).toContain(pair.pointId)
      expect(fieldBookPage).toContain(pair.pointId)
    }
  })

  it('renders the shared body only below the title block', () => {
    // renderCalibrationContent must ignore its caller's title: the report does
    // not repeat "GNSS SITE CALIBRATION" mid-paragraph or bleed into the meta.
    expect((reportText().match(/GNSS SITE CALIBRATION/g) || []).length).toBe(1)
  })
})

describe('renderCalibrationContent bounds', () => {
  it('breaks the residuals table at maxY instead of overflowing the page', () => {
    const pdf = buildCalibrationReportPDF({ ...cal, pairs: Array(500).fill(cal.pairs[0]) })
    const text = (pdf as any).internal.pages.at(1).join(' ')
    expect(text).toMatch(/remaining control points omitted/)
  })
})