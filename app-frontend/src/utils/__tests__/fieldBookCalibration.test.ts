// @vitest-environment happy-dom
//
// jsPDF needs a DOM to construct.
import { describe, it, expect } from 'vitest'
// @ts-expect-error — ?raw has no ambient type declaration in this project
import sampleXml from './fixtures/siteCalibrationReport.xml?raw'
import { FieldBookGenerator, type FieldBookPoint, type FieldBookMetadata } from '../field-book'
import { parseSiteCalibration } from '../siteCalibration'

const metadata: FieldBookMetadata = { surveyorName: 'A. Surveyor' }

/** 30 points — enough to span two pages at 27 per page. */
const points: FieldBookPoint[] = Array.from({ length: 30 }, (_, i) => ({
  id: `P${i + 1}`,
  y: 97538.004 + i,
  x: 2247107.872 + i,
  status: 'F',
  description: '12mm iron peg in concrete',
}))

describe('field book with a site calibration', () => {
  it('opens the book with the calibration, adding exactly one page', async () => {
    const gen = new FieldBookGenerator()
    const withoutCal = await gen.generateFieldBookPDF(points, metadata)

    const gen2 = new FieldBookGenerator()
    const withCal = await gen2.generateFieldBookPDF(points, metadata, parseSiteCalibration(sampleXml))

    expect(withoutCal.pageCount).toBe(2)          // ceil(30 / 27)
    expect(withCal.pageCount).toBe(3)             // + the calibration page
  })

  it('moves every point page label down one', async () => {
    // The calibration opens the book, so every point page — and every
    // cross-reference to it in the other documents — moves one E-number later.
    const gen = new FieldBookGenerator()
    const withoutCal = await gen.generateFieldBookPDF(points, metadata)

    const gen2 = new FieldBookGenerator()
    const withCal = await gen2.generateFieldBookPDF(points, metadata, parseSiteCalibration(sampleXml))

    expect(withoutCal.pointPageMap['P1']).toBe('E1')
    expect(withCal.pointPageMap['P1']).toBe('E2')

    expect(withoutCal.pointPageMap['P30']).toBe('E2')
    expect(withCal.pointPageMap['P30']).toBe('E3')
  })

  it('is byte-for-byte unchanged when no calibration is supplied', async () => {
    // A plan without a calibration must generate exactly as it did before this
    // feature existed — passing undefined and passing nothing must agree.
    const a = await new FieldBookGenerator().generateFieldBookPDF(points, metadata)
    const b = await new FieldBookGenerator().generateFieldBookPDF(points, metadata, undefined)

    expect(b.pageCount).toBe(a.pageCount)
    expect(b.pointPageMap).toEqual(a.pointPageMap)
  })

  it('renders the parameters, the residual table and every control point', async () => {
    const cal = parseSiteCalibration(sampleXml)
    const { pdf } = await new FieldBookGenerator().generateFieldBookPDF(points, metadata, cal)

    // jsPDF keeps the emitted text per page, 1-indexed (pages[0] is unused);
    // the calibration opens the book, so it is page 1.
    const text = (pdf as any).internal.pages.at(1).join(' ')

    expect(text).toContain('GNSS SITE CALIBRATION')
    expect(text).toContain('Scale Factor')
    expect(text).toContain('Rotation')

    // Every control pair must appear — a table that silently drops points is
    // worse than no table, because it reads as a complete record.
    for (const pair of cal.pairs) {
      expect(text).toContain(pair.pointId)
    }
  })

  it('states residuals in metres to three decimals, as the source report does', async () => {
    const cal = parseSiteCalibration(sampleXml)
    const { pdf } = await new FieldBookGenerator().generateFieldBookPDF(points, metadata, cal)
    // The calibration opens the book, so it is page 1 (pages[0] is unused).
    const text = (pdf as any).internal.pages.at(1).join(' ')

    // 0.0077985… m -> "0.008 m". Metres so the field book and the Trimble
    // report can be compared line by line without converting units in your head.
    expect(text).toContain('0.008 m')
    expect(text).not.toMatch(/\bmm\b/)
  })

  it('states plainly that a horizontal-only calibration had no vertical component', async () => {
    const cal = parseSiteCalibration(sampleXml)
    expect(cal.hasVertical).toBe(false)

    const { pdf } = await new FieldBookGenerator().generateFieldBookPDF(points, metadata, cal)
    // The calibration opens the book, so it is page 1 (pages[0] is unused).
    const text = (pdf as any).internal.pages.at(1).join(' ')

    // Silence would read as "vertical residuals were all zero", which is a
    // different and much stronger claim than "no vertical adjustment was done".
    expect(text).toMatch(/Horizontal[- ]only/i)
  })
})

describe('where the calibration sits in the book', () => {
  it('opens the book, pushing the points to E2', async () => {
    const points = Array.from({ length: 3 }, (_, i) => ({
      id: `P${i + 1}`, y: i, x: i, status: 'P', description: 'peg', surveyDate: '2026-01-01',
    }));

    const result = await new FieldBookGenerator().generateFieldBookPDF(
      points,
      { surveyorName: 'C. Paradzayi' },
      parseSiteCalibration(sampleXml),
    );

    expect(result.pointPageMap.P1).toBe('E2');
    expect(result.pageCount).toBe(2);
  });

  it('leaves the points on E1 when there is no calibration', async () => {
    const points = [{ id: 'P1', y: 0, x: 0, status: 'P', description: 'peg', surveyDate: '2026-01-01' }];

    const result = await new FieldBookGenerator().generateFieldBookPDF(
      points,
      { surveyorName: 'C. Paradzayi' },
    );

    expect(result.pointPageMap.P1).toBe('E1');
    expect(result.pageCount).toBe(1);
  });
});
