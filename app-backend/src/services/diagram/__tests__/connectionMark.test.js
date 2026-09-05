import { describe, test, expect } from '@jest/globals'
import {
  connectionMark, CONNECTION_STUB_MM, CONNECTION_ARROW_MM, CONNECTION_ARROW_HALF_MM,
  CONNECTION_LABEL_PAD_MM,
} from '../connectionMark.js'
import {
  CONTIG_STUB_MM, dashSegments, ADJOINING_DASH_ON_MM, ADJOINING_DASH_OFF_MM,
} from '../contiguousMarks.js'

/** The mark as a renderer builds it: lengths in the caller's own units. */
const mark = (at, toward, len = 10, arrow = 2, half = 0.75) =>
  connectionMark(at, toward, len, arrow, half)

describe('dashSegments', () => {
  const len = (s) => Math.hypot(s[1][0] - s[0][0], s[1][1] - s[0][1])

  test('lays dashes along the line, starting at its tail', () => {
    const segs = dashSegments([0, 0], [10, 0], 2, 1)
    expect(segs[0]).toEqual([[0, 0], [2, 0]])
    expect(segs[1][0]).toEqual([3, 0])
  })

  test('never runs past the end', () => {
    for (const total of [10, 10.5, 11, 12.9]) {
      const segs = dashSegments([0, 0], [total, 0], 2, 1)
      expect(Math.max(...segs.map((s) => s[1][0]))).toBeLessThanOrEqual(total + 1e-9)
    }
  })

  test('inks less than the whole line — otherwise it is not dashed', () => {
    const segs = dashSegments([0, 0], [10, 0], 2, 1)
    expect(segs.reduce((t, s) => t + len(s), 0)).toBeLessThan(10)
  })

  test('works on a diagonal, keeping the dash length true', () => {
    const segs = dashSegments([0, 0], [6, 8], 2, 1)   // length 10
    expect(len(segs[0])).toBeCloseTo(2, 9)
  })

  test('drops a final sliver instead of printing it as a dot', () => {
    // The real case: an 8.4 mm shaft on a 2.794 mm period leaves 0.018 mm over,
    // which appeared on the sheet as a fourth, tiny dash.
    const segs = dashSegments([0, 0], [8.4, 0], 1.736, 1.058)
    expect(segs).toHaveLength(3)
    expect(Math.min(...segs.map(len))).toBeGreaterThan(1.7)
  })

  test('keeps a final dash that is long enough to read as one', () => {
    const segs = dashSegments([0, 0], [7.5, 0], 2, 1)
    expect(len(segs[segs.length - 1])).toBeGreaterThan(0.5)
  })

  test('draws a zero-length line as nothing, not as a dot', () => {
    expect(dashSegments([3, 3], [3, 3], 2, 1)).toEqual([])
  })

  test('falls back to a solid line rather than vanishing on a bad pattern', () => {
    expect(dashSegments([0, 0], [5, 0], 0, 1)).toEqual([[[0, 0], [5, 0]]])
  })
})

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

  test('measures label positions from the beacon, along the ray', () => {
    // The distance text is placed by its near edge so it can be held clear of
    // the corner the ray leaves, and only the caller knows how wide it is.
    const m = mark([0, 0], [0, 1], 10, 2)
    expect(m.along(0)).toEqual([0, 0])
    expect(m.along(4)).toEqual([0, 4])
    expect(m.along(10)).toEqual(m.tip)
  })

  test('pads the text clear of the beacon it springs from', () => {
    // A connection leaves a corner: two boundaries and a beacon circle all meet
    // there, and text centred on the shaft ran back across them.
    expect(CONNECTION_LABEL_PAD_MM).toBeGreaterThan(0)
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

  test('gives the shaft three dashes, the legibility floor the stub uses', () => {
    // The shaft is the stub's own 8.4 mm, which is exactly three periods of this
    // pattern. Arithmetic on the pattern, not a hardcoded count, so retuning
    // either the stub or the dash keeps this honest.
    const shaft = CONNECTION_STUB_MM - CONNECTION_ARROW_MM
    const period = ADJOINING_DASH_ON_MM + ADJOINING_DASH_OFF_MM
    expect(Math.floor((shaft + ADJOINING_DASH_OFF_MM) / period)).toBeGreaterThanOrEqual(3)
    expect(dashSegments([0, 0], [shaft, 0], ADJOINING_DASH_ON_MM, ADJOINING_DASH_OFF_MM).length)
      .toBeGreaterThanOrEqual(3)
  })

  test('reaches as far as an abutment stub, plus its head', () => {
    // Both are marks hanging off a beacon into open ground; one has no business
    // out-reaching the other, and sharing the number means retuning the stub
    // retunes this too.
    expect(CONNECTION_STUB_MM).toBeCloseTo(CONTIG_STUB_MM + CONNECTION_ARROW_MM, 9)
    expect(CONNECTION_ARROW_HALF_MM).toBeLessThan(CONNECTION_ARROW_MM)
  })
})
