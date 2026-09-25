import { describe, it, expect } from 'vitest'
import { generateDSGCertificatePDF } from '../dsgCertificateGenerator'

const base = {
  surveyOf: 'STAND 403-405 MAGLAS TOWNSHIP OF STAND 87 MAGLAS TOWNSHIP',
  surveyorName: 'Charles Paradzayi',
  licenseNumber: 'RL 123',
  statement1: 'The consistency of data has been checked directly from General Plans.',
  statement2: 'The coordinates of beacons appearing on the diagrams have been checked against the coordinate list and calculations of the fixes of beacons.',
  statement3: 'All beacons shown on the diagrams have been placed and checked.',
  statement4: 'I have satisfied myself of the correctness of the checks mentioned in subparagraphs 1, 2 and 3 above.',
  surveyorTitle: 'LAND SURVEYOR',
  date: '2026-07-14',
}

describe('generateDSGCertificatePDF', () => {
  it('returns a non-empty PDF blob and at least one page', async () => {
    const { blob, pageCount } = await generateDSGCertificatePDF(base)
    expect(blob.size).toBeGreaterThan(0)
    expect(pageCount).toBeGreaterThanOrEqual(1)
  })

  it('renders the DSG/1/96 form reference above the certificate title', async () => {
    const { blob } = await generateDSGCertificatePDF(base)
    const content = await blob.text()
    expect(content).toContain('DSG/1/96')
    expect(content).toContain('CERTIFICATE')
    expect(content).toContain('LAND SURVEYOR')
  })

  it('prints the SURVEY OF line with a trailing period', async () => {
    const { blob } = await generateDSGCertificatePDF(base)
    const content = await blob.text()
    expect(content).toContain('SURVEY OF:')
    // The designation may wrap across content rows; the period is always
    // appended to the final word of the composed line.
    expect(content).toContain('TOWNSHIP.')
    expect(content).toContain('STAND 403-405 MAGLAS TOWNSHIP OF STAND 87 MAGLAS')
  })

  it('right-justifies the DSG/1/96 form reference', async () => {
    const { blob } = await generateDSGCertificatePDF(base)
    const content = await blob.text()
    // jsPDF emits the text anchor as "x y Td" on the line above the text.
    // A left-aligned reference anchors at the left margin (~70 when the stream
    // is scaled to points); right-justification anchors in the right half.
    const match = content.match(/([\d.]+) ([\d.]+) Td\n\(DSG\/1\/96\) Tj/)
    expect(match).toBeTruthy()
    const x = Number(match![1])
    expect(x).toBeGreaterThan(250)
  })

  it('honours an explicit form reference override', async () => {
    const { blob } = await generateDSGCertificatePDF({ ...base, formReference: 'DSG/2/99' })
    const content = await blob.text()
    expect(content).toContain('DSG/2/99')
    expect(content).not.toContain('DSG/1/96')
  })
})