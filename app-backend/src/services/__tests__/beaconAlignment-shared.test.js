/**
 * SI 727 para (5): a new beacon on the parent property's boundary, held to the line between the parent beacons.
 * Fixture: Brackenhurst (Stand 87 subdivided into 403-405 and the remainder), the stored 3 dp coordinates.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js beaconAlignment
 */
import { describe, test, expect } from '@jest/globals'
import { alignmentLimits, alignmentBand, beaconAlignment, describeAlignment } from '../../../../app-shared/beaconAlignment.js'

const P = {
  '86B': [-85728.702, 2143972.144, 'F'], '86C': [-85633.03, 2144068.004, 'F'], '87A': [-85809.635, 2144070.743, 'F'],
  '87B': [-85741.413, 2143988.587, 'F'], '87C': [-85816.243, 2144078.189, 'F'], '87D': [-85729.993, 2144164.797, 'F'],
  SD1: [-85765.137, 2144017.161, 'P'], SD2: [-85774.379, 2144120.221, 'P'], SD3: [-85682.515, 2144117.414, 'P'],
  SD4: [-85673.907, 2144027.044, 'P'], SD5: [-85710.106, 2144063.183, 'P'], SD6: [-85723.396, 2144076.451, 'P'],
}
const rings = [
  ['SD6', 'SD2', '87D', 'SD3'],                 // 403
  ['SD4', 'SD5', 'SD6', 'SD3', '86C'],          // 404
  ['86B', '87B', 'SD1', 'SD5', 'SD4'],          // 405
  ['SD1', '87A', '87C', 'SD2', 'SD6', 'SD5'],   // remainder
]
const pointsOf = (over = {}) => new Map(Object.entries({ ...P, ...over }).map(([n, [y, x, s]]) => [n, { y, x, status: s }]))
const run = (points, extra = {}) => beaconAlignment({ rings, points, isParent: (n) => points.get(n)?.status === 'F', ...extra })

/** Move a beacon `by` metres square off the line A-B (to the left of A->B). */
function offLine(name, a, b, by) {
  const [ay, ax] = P[a], [by_, bx] = P[b], [vy, vx, s] = P[name]
  const L = Math.hypot(by_ - ay, bx - ax)
  return { [name]: [vy + (-(bx - ax) / L) * by, vx + ((by_ - ay) / L) * by, s] }
}

describe('limits', () => {
  test('0,06 + 0,000 25d and 0,06 + 0,000 5d, each at most one metre', () => {
    expect(alignmentLimits(100).limit).toBeCloseTo(0.085, 9)
    expect(alignmentLimits(100).moveLimit).toBeCloseTo(0.11, 9)
    expect(alignmentLimits(5000)).toEqual({ limit: 1, moveLimit: 1 })
    expect(alignmentBand(0.08, 100)).toBe('on-line')
    expect(alignmentBand(0.1, 100)).toBe('may-stay')
    expect(alignmentBand(0.12, 100)).toBe('correct')
  })
})

describe('Brackenhurst', () => {
  test('finds the four new beacons on Stand 87\'s boundary, each on line', () => {
    const r = run(pointsOf())
    expect(r.map((x) => [x.beacon, x.from, x.to, x.nearest, x.band])).toEqual([
      ['SD1', '87A', '87B', '87B', 'on-line'],
      ['SD2', '87C', '87D', '87C', 'on-line'],
      ['SD3', '86C', '87D', '87D', 'on-line'],
      ['SD4', '86B', '86C', '86C', 'on-line'],
    ])
    const sd3 = r.find((x) => x.beacon === 'SD3')
    expect(sd3.offset).toBeCloseTo(0.008, 3)
    expect(sd3.d).toBeCloseTo(67.08, 2)
    expect(sd3.limit).toBeCloseTo(0.06 + 0.00025 * sd3.d, 9)
    expect(sd3.limit).toBeCloseTo(0.077, 3)
  })

  test('SD2 found through its side carried on to 87C, with no connection given', () => {
    expect(run(pointsOf()).some((x) => x.beacon === 'SD2' && x.from === '87C')).toBe(true)
  })

  test('a beacon between the two limits need not be moved; beyond the second it must be corrected', () => {
    // SD3: d = 67 m, limits 77 mm and 94 mm.
    const stay = run(pointsOf(offLine('SD3', '87D', '86C', 0.085))).find((x) => x.beacon === 'SD3')
    expect(stay.band).toBe('may-stay')
    expect(describeAlignment(stay)).toMatch(/need not be moved \(proviso \(i\)\)/)
    const move = run(pointsOf(offLine('SD3', '87D', '86C', 0.3))).find((x) => x.beacon === 'SD3')
    expect(move.band).toBe('correct')
    expect(describeAlignment(move)).toMatch(/must be corrected .*proviso \(ii\)/)
  })

  test('a beacon over a metre off is a corner of the figure, not a beacon on a line', () => {
    expect(run(pointsOf(offLine('SD3', '87D', '86C', 1.5))).some((x) => x.beacon === 'SD3')).toBe(false)
  })

  test('a connection a surveyor entered is used as the line', () => {
    // Without rings tying SD1 to 87A, the connection alone puts SD1 on 87B - 87A.
    const points = pointsOf()
    const r = beaconAlignment({
      rings: [['86B', '87B', 'SD1', 'SD5', 'SD4']], points, isParent: (n) => points.get(n)?.status === 'F',
      connections: [{ fromBeacon: 'SD1', toBeacon: '87A' }],
    })
    expect(r.find((x) => x.beacon === 'SD1')?.from).toBe('87A')
  })
})
