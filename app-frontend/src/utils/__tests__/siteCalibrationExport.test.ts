// @vitest-environment happy-dom
//
// The Site Calibration step offers the loaded calibration for download (PDF report and CSV data) and a sample
// calibration file. The sample must be a report the app itself reads, and the CSV must carry every pair.
import { describe, it, expect } from 'vitest'
import sampleTemplate from '../../../public/templates/site-calibration-sample.xml?raw'
import fixtureXml from './fixtures/siteCalibrationReport.xml?raw'
import { parseCalibrationReport, parseSiteCalibration } from '../siteCalibration'
import { calibrationCsv, SAMPLE_CALIBRATION_URL } from '../siteCalibrationExport'

describe('the sample calibration file', () => {
  it('is served from public/templates and loads as a calibration, with generic station names', () => {
    expect(SAMPLE_CALIBRATION_URL).toBe('/templates/site-calibration-sample.xml')
    const cal = parseCalibrationReport(sampleTemplate)
    expect(cal.pairs.map((p) => p.pointId)).toEqual(['CP1', 'CP2', 'CP3'])
    expect(cal.horizontal).not.toBeNull()
    expect(cal.summary.maxHorizontalResidual).toBeGreaterThan(0)
  })

  it('says it is illustrative', () => {
    expect(sampleTemplate).toMatch(/ILLUSTRATIVE ONLY/)
    expect(sampleTemplate).not.toMatch(/49\/T|170\/P|176\/P/)
  })
})

describe('calibrationCsv', () => {
  const cal = parseSiteCalibration(fixtureXml)
  const csv = calibrationCsv(cal)
  const lines = csv.trim().split(/\r\n/)

  it('has a header and one row per control pair, with its grid co-ordinates and residual', () => {
    expect(lines[0]).toMatch(/^Point,GNSS ID,Usage,Latitude \(deg\)/)
    const pairRows = lines.slice(1, 1 + cal.pairs.length)
    expect(pairRows.map((r) => r.split(',')[0])).toEqual(cal.pairs.map((p) => p.pointId))
    const first = pairRows[0].split(',')
    expect(Number(first[6])).toBeCloseTo(cal.pairs[0].controlNorthing, 3)
    expect(Number(first[12])).toBeCloseTo(cal.pairs[0].horizontalResidual, 4)
  })

  it('ends with the fitted parameters and the summary', () => {
    expect(csv).toMatch(/Scale factor,0\.99999/)
    expect(csv).toMatch(/Max horizontal residual \(m\),0\.0084/)
    expect(csv).toMatch(/Vertical adjustment,none/)
  })
})
