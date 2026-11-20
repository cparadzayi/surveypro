/**
 * The pre-print check reads what a document prints and holds it to the project's data (banker's rounding, 2 dp).
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js printVerify
 */
import { describe, test, expect } from '@jest/globals'
import { verifyPrinted, printedCoordinates, allowedFigures } from '../printVerify.js'

const points = [
  { name: '86B', status: 'F', y: -85728.702, x: 2143972.144 },
  { name: '86C', status: 'F', y: -85633.03, x: 2144068.004 },
  { name: 'RM7', status: 'F', y: -85905.845, x: 2144178.569 },   // a half: banker's gives .84, half-up .85
  { name: 'SD1', status: 'P', y: -85765.137, x: 2144017.161 },
]
const codes = (f, level) => f.filter((x) => !level || x.level === level).map((x) => x.code)

const clean = [
  '86B -85728.702 2143972.144 F', '86C -85633.030 2144068.004 F', 'RM7 -85905.845 2144178.569 F', 'SD1 -85765.137 2144017.161 P',
  '86B -85 728.70 +2 143 972.14', '86C -85 633.03 +2 144 068.00', 'RM7 -85 905.84 +2 144 178.57', 'SD1 -85 765.14 +2 144 017.16',
].join('\n')

describe('printedCoordinates', () => {
  test('reads the formats the documents use and ignores small figures', () => {
    const v = printedCoordinates('- 85 633,03  +2 144 068.00  -85633.030  40.35  4 047').map((c) => c.value)
    expect(v).toEqual([85633.03, 2144068, 85633.03])
  })
})

describe('allowedFigures', () => {
  test('a half rounds to even: -85905.845 prints as .84, not .85', () => {
    const a = allowedFigures(points)
    expect(a.has('85905.84')).toBe(true)
    expect(a.has('85905.85')).toBe(false)
    expect(a.has('85905.845')).toBe(true)
  })
})

describe('verifyPrinted', () => {
  test('a document that prints the stored figures, banker-rounded, has no errors', () => {
    expect(codes(verifyPrinted({ text: clean, points }), 'error')).toEqual([])
  })

  test('template beacons are an error (BM 001 - BM 008 reached the Surveyor-General once)', () => {
    const f = verifyPrinted({ text: `${clean}\nBM 001 50000.000 2200000.000`, points })
    expect(codes(f, 'error')).toContain('TEMPLATE_DATA')
  })

  test('a real beacon printed 0.01 m off is an error (the diagram/list disagreement)', () => {
    const f = verifyPrinted({ text: `${clean}\n- 85 633,04 + 2 144 068,00`, points })
    expect(f.find((x) => x.code === 'NEAR_MISS').message).toMatch(/86C/)
  })

  test('half-up rounding of a half is caught', () => {
    const f = verifyPrinted({ text: `${clean}\nRM7 -85 905.85`, points })
    expect(codes(f, 'error')).toContain('NEAR_MISS')
  })

  test('a figure that is no beacon of the survey is a warning to review, not an error', () => {
    const f = verifyPrinted({ text: `${clean}\n50000.013`, points })
    expect(codes(f, 'warning')).toContain('UNKNOWN_FIGURE')
    expect(codes(f, 'error')).toEqual([])
  })

  test('control figures passed in are legitimate', () => {
    const f = verifyPrinted({ text: `${clean}\n-81572.343`, points, extraFigures: [-81572.343] })
    expect(codes(f)).not.toContain('UNKNOWN_FIGURE')
  })

  test('a Beacon Comparison with none saved is an error', () => {
    const f = verifyPrinted({ text: `${clean}\nBEACON COMPARISON REPORT`, points, comparisonNames: [] })
    expect(codes(f, 'error')).toContain('COMPARISON_NOT_SAVED')
  })

  test('a point missing from the document is reported', () => {
    const f = verifyPrinted({ text: '86B -85 728.70 +2 143 972.14', points })
    expect(codes(f, 'warning')).toContain('POINT_NOT_PRINTED')
  })
})
