import { describe, test, expect } from '@jest/globals'
import { edgeStrip } from '../edgeStrip.js'

describe('edgeStrip', () => {
  test('horizontal edge offsets outward, away from the centroid', () => {
    // edge (0,0)→(10,0); centroid below at (5,5) → outward is -y.
    const q = edgeStrip([0, 0], [10, 0], 4, [5, 5])
    expect(q[0]).toEqual([0, 0])
    expect(q[1]).toEqual([10, 0])
    expect(q[2][0]).toBeCloseTo(10, 6); expect(q[2][1]).toBeCloseTo(-4, 6)
    expect(q[3][0]).toBeCloseTo(0, 6);  expect(q[3][1]).toBeCloseTo(-4, 6)
  })

  test('flips to the other side when the centroid is on the other side', () => {
    // centroid above at (5,-5) → outward is +y.
    const q = edgeStrip([0, 0], [10, 0], 4, [5, -5])
    expect(q[2][1]).toBeCloseTo(4, 6)
    expect(q[3][1]).toBeCloseTo(4, 6)
  })

  test('vertical edge offsets in x', () => {
    // edge (0,0)→(0,10); centroid to the right (5,5) → outward is -x.
    const q = edgeStrip([0, 0], [0, 10], 3, [5, 5])
    expect(q[2][0]).toBeCloseTo(-3, 6)
    expect(q[3][0]).toBeCloseTo(-3, 6)
  })
})
