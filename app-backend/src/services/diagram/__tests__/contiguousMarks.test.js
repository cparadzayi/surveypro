import { describe, test, expect } from '@jest/globals'
import { contiguousMarks, continuedStubTip } from '../contiguousMarks.js'

const a = [0, 0]
const b = [100, 0]      // mid = [50, 0]

describe('contiguousMarks', () => {
  test("both: stubs at both terminals, label at the side midpoint", () => {
    expect(contiguousMarks(a, b, 'both')).toEqual({
      stubFrom: true, stubTo: true, labelAnchor: [50, 0],
    })
  })

  test("missing end defaults to both (back-compat)", () => {
    expect(contiguousMarks(a, b, undefined)).toEqual({
      stubFrom: true, stubTo: true, labelAnchor: [50, 0],
    })
  })

  test("from: stub at A only, label still centred on the side", () => {
    expect(contiguousMarks(a, b, 'from')).toEqual({
      stubFrom: true, stubTo: false, labelAnchor: [50, 0],
    })
  })

  test("to: stub at B only, label still centred on the side", () => {
    expect(contiguousMarks(a, b, 'to')).toEqual({
      stubFrom: false, stubTo: true, labelAnchor: [50, 0],
    })
  })

  test("mid: spans the middle with NO terminals -- no stubs, label still centred", () => {
    expect(contiguousMarks(a, b, 'mid')).toEqual({
      stubFrom: false, stubTo: false, labelAnchor: [50, 0],
    })
  })

  test("works off-axis (diagonal side): label at the side midpoint", () => {
    // a=(0,0) b=(40,80) -> mid (20,40); the label is centred regardless of end.
    expect(contiguousMarks([0, 0], [40, 80], 'from')).toEqual({
      stubFrom: true, stubTo: false, labelAnchor: [20, 40],
    })
  })
})

describe('continuedStubTip: an offshoot keeps the direction of the parcel under survey', () => {
  const dist = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1])
  // A parallelogram corner at B(0,0), the figure's adjacent side running to A(60,0); the side B->C(-20,55)
  // abuts a neighbour. The old stub was square to B->C; the neighbour's boundary leaves B along A->B carried on.
  test('at an oblique corner the stub runs on along the adjacent side, not square to the abutting side', () => {
    const B = [0, 0], A = [60, 0]
    const k = 8 / Math.hypot(20, 55)
    const perpendicular = [-55 * k, -20 * k]
    const tip = continuedStubTip(B, A, perpendicular)
    expect(tip[0]).toBeCloseTo(-8, 9)
    expect(tip[1]).toBeCloseTo(0, 9)
    expect(dist(B, tip)).toBeCloseTo(8, 9)               // the stub keeps its length
    expect(tip).not.toEqual(perpendicular)
  })

  test('at a right angle it is the same line as the perpendicular', () => {
    const tip = continuedStubTip([0, 0], [10, 0], [-8, 0])
    expect(tip[0]).toBeCloseTo(-8, 9)
    expect(tip[1]).toBeCloseTo(0, 9)
  })

  test('falls back to the perpendicular where the figure has no adjacent vertex', () => {
    expect(continuedStubTip([0, 0], null, [0, -8])).toEqual([0, -8])
  })

  test('falls back where carrying the side on would run back into the figure (a reflex corner)', () => {
    expect(continuedStubTip([0, 0], [0, -10], [0, -8])).toEqual([0, -8])
  })

  test('falls back where the adjacent side runs almost along the abutting side', () => {
    expect(continuedStubTip([0, 0], [-10, 0.5], [0, -8])).toEqual([0, -8])
  })
})
