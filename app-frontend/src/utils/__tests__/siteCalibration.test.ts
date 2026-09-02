// @vitest-environment happy-dom
//
// The parser uses the browser's native DOMParser, which is free at runtime but
// absent from this project's default Node test environment. happy-dom supplies
// one for this file only, so production code carries no XML dependency.
import { describe, it, expect } from 'vitest'
// Vite's ?raw import, rather than reading from disk: under happy-dom
// `import.meta.url` is not a file: URL, so fs-based fixture loading fails.
// @ts-expect-error — ?raw has no ambient type declaration in this project
import sampleXml from './fixtures/siteCalibrationReport.xml?raw'
import { parseSiteCalibration } from '../siteCalibration'

describe('parseSiteCalibration', () => {
  it('reads the header and the adjusted horizontal parameters', () => {
    const cal = parseSiteCalibration(sampleXml)

    expect(cal.reportName).toBe('Site Calibration Report')
    expect(cal.projectIdentifier).toBe('cf5f38d9-25a2-4090-b00b-eb99878379ec')

    // Verbatim from the sample, so a transcription slip in the parser shows up here.
    expect(cal.horizontal).not.toBeNull()
    expect(cal.horizontal!.rotationCentreNorthing).toBeCloseTo(2144245.27098077, 6)
    expect(cal.horizontal!.rotationCentreEasting).toBeCloseTo(-80371.548317431443, 6)
    expect(cal.horizontal!.translationNorth).toBeCloseTo(-0.0043974015861749649, 9)
    expect(cal.horizontal!.translationEast).toBeCloseTo(-0.0028325550811132416, 9)
    expect(cal.horizontal!.scaleFactor).toBeCloseTo(0.999999658860241, 12)
  })

  it('converts the rotation from radians to degrees', () => {
    const cal = parseSiteCalibration(sampleXml)
    // -9.57842920931818E-07 rad — a rotation this small is meaningless printed
    // as radians, and is the whole reason the parser converts.
    expect(cal.horizontal!.rotationDegrees).toBeCloseTo(-9.57842920931818e-7 * (180 / Math.PI), 12)
  })

  it('reads every control pair with its residual', () => {
    const cal = parseSiteCalibration(sampleXml)
    expect(cal.pairs).toHaveLength(3)

    const first = cal.pairs[0]
    expect(first.pointId).toBe('49/T')       // the GRID point's ID is the surveyor's name for it
    expect(first.globalPointId).toBe('49T')
    expect(first.usage).toBe('HorizontalOnly')
    expect(first.controlNorthing).toBeCloseTo(2146856.3927760976, 6)
    expect(first.controlEasting).toBeCloseTo(-88453.696193198732, 6)
    expect(first.calculatedNorthing).toBeCloseTo(2146856.3875822145, 6)
    expect(first.calculatedEasting).toBeCloseTo(-88453.690375924736, 6)
    expect(first.horizontalResidual).toBeCloseTo(0.0077985318018890856, 9)

    expect(cal.pairs.map(p => p.pointId)).toEqual(['49/T', '170/P', '176/P'])
  })

  it('converts the global latitude and longitude from radians to degrees', () => {
    const cal = parseSiteCalibration(sampleXml)
    // -0.3387506027889603 rad is -19.408980°, i.e. Zimbabwe. Printed as radians it
    // would be unreadable, and printed as degrees-without-conversion, wrong.
    expect(cal.pairs[0].globalLatitudeDegrees).toBeCloseTo(-19.408979847, 6)
    expect(cal.pairs[0].globalLongitudeDegrees).toBeCloseTo(29.841989592, 6)
    expect(cal.pairs[0].globalHeight).toBeCloseTo(1465.3829073213, 6)
  })

  it('tolerates the misspelled <Latitiude> tag Trimble emits, and the correct spelling', () => {
    // The sample really does misspell it. A parser matching only the correct
    // spelling silently yields NaN for every latitude, so both must work.
    expect(sampleXml).toContain('<Latitiude>')

    const corrected = sampleXml.replace(/Latitiude/g, 'Latitude')
    const cal = parseSiteCalibration(corrected)
    expect(cal.pairs[0].globalLatitudeDegrees).toBeCloseTo(-19.408979847, 6)
  })

  it('reads the summary, including the point the worst residual belongs to', () => {
    const cal = parseSiteCalibration(sampleXml)
    expect(cal.summary.maxHorizontalResidual).toBeCloseTo(0.0084389872162713639, 9)
    expect(cal.summary.maxHorizontalResidualPointSerial).toBe('5124')
    expect(cal.summary.rmsHorizontal).toBeCloseTo(0.0074528415922655491, 9)
  })

  it('reports a horizontal-only calibration as having no vertical component', () => {
    const cal = parseSiteCalibration(sampleXml)
    // <MaxVerticalInclination /> is present but empty, and every pair is
    // Usage="HorizontalOnly". That must read as "no vertical adjustment was
    // performed", not as a vertical adjustment of zero — the field book renders
    // the two very differently.
    expect(cal.hasVertical).toBe(false)
    expect(cal.vertical).toBeNull()
    expect(cal.summary.maxVerticalInclination).toBeNull()
  })

  it('rejects a file that is not a site calibration report', () => {
    expect(() => parseSiteCalibration('<?xml version="1.0"?><SomethingElse/>'))
      .toThrow(/not a .*Site Calibration Report/i)
  })

  it('rejects malformed XML rather than returning empty values', () => {
    expect(() => parseSiteCalibration('<not-closed>')).toThrow()
  })
})
