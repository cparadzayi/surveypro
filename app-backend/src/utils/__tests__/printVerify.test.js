/**
 * The pre-print check reads what a document prints and holds it to the project's data (banker's rounding, 2 dp).
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js printVerify
 */
import { describe, test, expect } from '@jest/globals'
import { verifyPrinted, printedCoordinates, allowedFigures, printedConnections, letteredDistances, alignmentFindings } from '../printVerify.js'

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

  test("the Beacon Comparison's survey column is held to the field data and its figures are not flagged", () => {
    const comparison = [
      { name: '86B', yH: -85728.77, xH: 2143972.22, yS: -85728.7, xS: 2143972.14 },   // the list's own figures: fine
      { name: 'RM7', yH: -85905.9, xH: 2144178.63, yS: -85905.85, xS: 2144178.57 },  // .845 rounded half-up
      { name: '86C', yH: -85633.12, xH: 2144068.03, yS: -85633.09, xS: 2144068 },    // 6 cm off the field value
    ]
    const text = `${clean}\nBEACON COMPARISON REPORT\n86B -85728.770 2143972.220 -85728.700 2143972.140`
    const f = verifyPrinted({ text, points, comparison })
    expect(f.filter((x) => x.code === 'COMPARISON_SURVEY_ROUNDING').map((x) => x.message)).toEqual([expect.stringMatching(/RM7/)])
    expect(f.filter((x) => x.code === 'COMPARISON_SURVEY_MISMATCH').map((x) => x.message)).toEqual([expect.stringMatching(/86C/)])
    expect(codes(f)).not.toContain('NEAR_MISS')
    expect(codes(f)).not.toContain('UNKNOWN_FIGURE')
  })

  describe('connections (Brackenhurst 403: SD2 -> 87C)', () => {
    const conPoints = [
      ...points,
      { name: 'SD2', status: 'P', y: -85774.379, x: 2144120.221 },
      { name: '87C', status: 'F', y: -85816.243, x: 2144078.189 },
    ]
    const calcs = [
      'Connecting data', 'Stand 403: SD2 to 87C',
      'SD2  Y -85774.379  X +2144120.221', '87C  Y -85816.243  X +2144078.189',
      'dY -41.864  dX -42.032', 'Direction 224 53 07  Distance 59.32 m',
    ].join('\n')
    const diagram = (d) => `DEDUCTIONS FROM THIS DIAGRAM ARE MADE ON THE BACK HEREOF\nE\n${d}\nKlein Road 25,19m`

    test('reads the Connecting data and the lettered distances', () => {
      expect(printedConnections(calcs)).toEqual([{ stand: '403', from: 'SD2', to: '87C', directionSec: 224 * 3600 + 53 * 60 + 7, distance: 59.32 }])
      expect(letteredDistances(diagram('59,32m'))).toEqual([59.32, 25.19])
    })

    test('a diagram lettering the distance the co-ordinates give passes', () => {
      const f = verifyPrinted({ text: `${clean}\n${calcs}\n${diagram('59,32m')}`, points: conPoints })
      expect(codes(f).filter((c) => c.startsWith('CONNECTION'))).toEqual([])
    })

    test('a diagram drawn before 87C moved (59,37m) is an error', () => {
      const f = verifyPrinted({ text: `${clean}\n${calcs}\n${diagram('59,37m')}`, points: conPoints })
      expect(f.find((x) => x.code === 'CONNECTION_LETTERED_MISMATCH').message).toMatch(/59,37m.*SD2 to 87C.*59\.32/)
      expect(codes(f, 'warning')).toContain('CONNECTION_NOT_LETTERED')
    })

    test('Connecting data with a stale distance or direction is an error', () => {
      const stale = calcs.replace('Distance 59.32', 'Distance 59.37').replace('224 53 07', '224 40 00')
      const f = verifyPrinted({ text: `${clean}\n${stale}`, points: conPoints })
      expect(codes(f, 'error')).toEqual(expect.arrayContaining(['CONNECTION_DISTANCE_MISMATCH', 'CONNECTION_DIRECTION_MISMATCH']))
    })

    test("a diagram saved on its own is held to the record's connections, and need not list every point", () => {
      const f = verifyPrinted({
        text: diagram('59,37m'), points: conPoints, listsAllPoints: false,
        extraConnections: [{ stand: '403', from: 'SD2', to: '87C' }],
      })
      expect(codes(f, 'error')).toEqual(['CONNECTION_LETTERED_MISMATCH'])
      expect(codes(f)).not.toContain('POINT_NOT_PRINTED')
    })
  })

  describe('SI 727 para (5) findings', () => {
    const r = (band) => ({ beacon: 'SD3', from: '86C', to: '87D', offset: 0.3, d: 67.08, nearest: '87D', limit: 0.077, moveLimit: 0.094, band })
    test('must be corrected is an error, need not be moved a warning, on line nothing', () => {
      const text = 'Beacons on line (SI 727, para (5))'
      expect(alignmentFindings([r('correct')], text).map((f) => [f.level, f.code])).toEqual([['error', 'ALIGNMENT_CORRECT']])
      expect(alignmentFindings([r('may-stay')], text).map((f) => [f.level, f.code])).toEqual([['warning', 'ALIGNMENT_MAY_STAY']])
      expect(alignmentFindings([r('on-line')], text)).toEqual([])
    })
    test('a record that does not state the check is told to be regenerated', () => {
      expect(alignmentFindings([r('on-line')], 'CALCULATIONS').map((f) => f.code)).toEqual(['ALIGNMENT_NOT_STATED'])
      expect(alignmentFindings([], 'CALCULATIONS')).toEqual([])
    })
  })

  test('a point missing from the document is reported', () => {
    const f = verifyPrinted({ text: '86B -85 728.70 +2 143 972.14', points })
    expect(codes(f, 'warning')).toContain('POINT_NOT_PRINTED')
  })
})
