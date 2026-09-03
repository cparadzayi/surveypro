// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
// @ts-expect-error — ?raw has no ambient type declaration in this project
import sampleHtml from './fixtures/siteCalibrationReport.html?raw'
// @ts-expect-error — ?raw has no ambient type declaration in this project
import sampleXml from './fixtures/siteCalibrationReport.xml?raw'
import { parseCalibrationReport, parseSiteCalibrationHtml } from '../siteCalibration'

/**
 * Trimble Business Center exports the same report as XML and as HTML, and a
 * surveyor may have either to hand. These two fixtures are deliberately
 * DIFFERENT calibration runs of the same job: the HTML includes a fourth
 * control point (thornhill / 50/T) that the XML predates, which re-computed the
 * adjustment and changed every residual and parameter. That is not a defect in
 * either file, and the tests below assert each faithfully.
 */
describe('parseSiteCalibrationHtml', () => {
  const cal = parseSiteCalibrationHtml(sampleHtml)

  it('reads all four control pairs, including the one the XML predates', () => {
    expect(cal.pairs).toHaveLength(4)
    expect(cal.pairs.map(p => p.pointId)).toEqual(['50/T', '49/T', '170/P', '176/P'])
    // The GNSS point carries a survey name, not the grid designation.
    expect(cal.pairs[0].globalPointId).toBe('thornhill')
  })

  it('reads the control and calculated coordinates the right way round', () => {
    const p = cal.pairs[0]
    // Grid Point column = the known control coordinate.
    expect(p.controlEasting).toBeCloseTo(-88962.536, 3)
    expect(p.controlNorthing).toBeCloseTo(2151237.826, 3)
    expect(p.controlElevation).toBeCloseTo(1430.700, 3)
    // Calculated Point column = what the calibration produced.
    expect(p.calculatedEasting).toBeCloseTo(-88962.539, 3)
    expect(p.calculatedNorthing).toBeCloseTo(2151237.811, 3)
    expect(p.calculatedElevation).toBeCloseTo(1429.667, 3)
  })

  it('reads each residual, including the 15mm one the XML never saw', () => {
    expect(cal.pairs[0].horizontalResidual).toBeCloseTo(0.015, 4)
    expect(cal.pairs[1].horizontalResidual).toBeCloseTo(0.008, 4)
    expect(cal.pairs[2].horizontalResidual).toBeCloseTo(0.013, 4)
  })

  it('converts DMS latitude and longitude, honouring the hemisphere letter', () => {
    // S19°26'54.71908"  ->  -19.448533...   E29°50'49.33988" -> +29.847039...
    expect(cal.pairs[0].globalLatitudeDegrees).toBeCloseTo(-(19 + 26 / 60 + 54.71908 / 3600), 8)
    expect(cal.pairs[0].globalLongitudeDegrees).toBeCloseTo(29 + 50 / 60 + 49.33988 / 3600, 8)
    expect(cal.pairs[0].globalHeight).toBeCloseTo(1436.961, 3)
  })

  it('reads the horizontal parameters', () => {
    expect(cal.horizontal).not.toBeNull()
    expect(cal.horizontal!.translationEast).toBeCloseTo(-0.002, 4)
    expect(cal.horizontal!.translationNorth).toBeCloseTo(0.0, 4)
    expect(cal.horizontal!.rotationCentreEasting).toBeCloseTo(-82519.295, 3)
    expect(cal.horizontal!.rotationCentreNorthing).toBeCloseTo(2145993.407, 3)
    expect(cal.horizontal!.scaleFactor).toBeCloseTo(0.9999999711, 10)
  })

  it('reads the summary, including which point the worst residual belongs to', () => {
    expect(cal.summary.maxHorizontalResidual).toBeCloseTo(0.015, 4)
    expect(cal.summary.rmsHorizontal).toBeCloseTo(0.012, 4)
    expect(cal.summary.maxHorizontalResidualPointSerial).toBe('thornhill')
  })

  it('treats the all-"?" vertical section as no vertical adjustment', () => {
    // Trimble writes "?" for every vertical field when none was performed.
    // Read as a number that would be 0, or worse NaN, it would misrepresent the
    // survey — so it must come through as absent.
    expect(cal.hasVertical).toBe(false)
    expect(cal.summary.maxVerticalInclination).toBeNull()
    expect(cal.pairs.every(p => p.verticalResidual === null)).toBe(true)
  })

  it('rejects an HTML page that is not a calibration report', () => {
    expect(() => parseSiteCalibrationHtml('<html><body><h1>Traverse Report</h1></body></html>'))
      .toThrow(/not a .*Site Calibration Report/i)
  })
})

describe('parseCalibrationReport — one entry point for either export', () => {
  it('parses the XML export', () => {
    expect(parseCalibrationReport(sampleXml).pairs).toHaveLength(3)
  })

  it('parses the HTML export', () => {
    expect(parseCalibrationReport(sampleHtml).pairs).toHaveLength(4)
  })

  it('rejects anything that is neither', () => {
    expect(() => parseCalibrationReport('point,y,x\nP1,1,2')).toThrow()
  })
})
