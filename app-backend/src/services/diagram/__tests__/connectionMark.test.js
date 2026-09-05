import { describe, test, expect } from '@jest/globals'
import {
  connectionMark, CONNECTION_STUB_MM, CONNECTION_ARROW_MM, CONNECTION_ARROW_HALF_MM,
} from '../connectionMark.js'
import { CONTIG_STUB_MM } from '../contiguousMarks.js'

/** The mark as a renderer builds it: lengths in the caller's own units. */
const mark = (at, toward, len = 10, arrow = 2, half = 0.75) =>
  connectionMark(at, toward, len, arrow, half)

describe('connectionMark', () => {
  test('points at the parent beacon, however far away it is', () => {
    // Only the DIRECTION is true. A parent 88 m away at 1:1500 is 59 mm, wider
    // than the figure, so the ray is drawn symbolically and the distance is
    // lettered instead.
    const near = mark([0, 0], [10, 0])
    const far = mark([0, 0], [10000, 0])
    expect(near.tip).toEqual(far.tip)
    expect(near.dir).toEqual([1, 0])
  })

  test('runs the length it is given, measured to the arrow tip', () => {
    const m = mark([5, 5], [5, 105], 12)
    expect(Math.hypot(m.tip[0] - 5, m.tip[1] - 5)).toBeCloseTo(12, 9)
  })

  test('puts the arrowhead at the far end, pointing away from the beacon', () => {
    const m = mark([0, 0], [1, 0], 10, 2, 0.75)
    const [tip, w1, w2] = m.arrow
    expect(tip).toEqual(m.tip)
    // the two barbs sit level with each other, one arrow-length back
    expect(w1[0]).toBeCloseTo(8, 9)
    expect(w2[0]).toBeCloseTo(8, 9)
    expect(w1[1]).toBeCloseTo(0.75, 9)
    expect(w2[1]).toBeCloseTo(-0.75, 9)
  })

  test('anchors the distance against the shaft it measures', () => {
    const m = mark([0, 0], [0, 1], 10, 2)
    // midway along the shaft, which stops where the head begins
    expect(m.labelAnchor).toEqual([0, 4])
  })

  test('holds its shape on a diagonal', () => {
    const m = mark([0, 0], [3, 4], 10, 2, 0.75)
    expect(Math.hypot(...m.dir)).toBeCloseTo(1, 12)
    expect(Math.hypot(m.tip[0], m.tip[1])).toBeCloseTo(10, 9)
    // barbs are symmetric about the shaft
    const [, w1, w2] = m.arrow
    const mid = [(w1[0] + w2[0]) / 2, (w1[1] + w2[1]) / 2]
    expect(Math.hypot(mid[0], mid[1])).toBeCloseTo(8, 9)
  })

  test('draws nothing when there is no direction to point', () => {
    // A parent beacon on top of the beacon it connects to is a data fault. An
    // arrow drawn in an arbitrary direction would assert something false.
    expect(mark([7, 7], [7, 7])).toBeNull()
  })

  test('reaches as far as an abutment stub, plus its head', () => {
    // Both are marks hanging off a beacon into open ground; one has no business
    // out-reaching the other, and sharing the number means retuning the stub
    // retunes this too.
    expect(CONNECTION_STUB_MM).toBeCloseTo(CONTIG_STUB_MM + CONNECTION_ARROW_MM, 9)
    expect(CONNECTION_ARROW_HALF_MM).toBeLessThan(CONNECTION_ARROW_MM)
  })
})
