/**
 * app-shared/sheetDerivation.js -- what each sheet states about itself.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js sheetDerivation-shared
 */
import { describe, test, expect } from '@jest/globals'
import { centroid, orderSheets } from '../../../../app-shared/sheetDerivation.js'

const P = (y, x) => ({ y, x })
/** An open box from (y0,x0) to (y1,x1), in ring order. */
const box = (y0, x0, y1, x1) => [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)]

describe('centroid', () => {
  test('finds the middle of a square', () => {
    const c = centroid(box(0, 0, 100, 100))
    expect(c.y).toBeCloseTo(50, 9)
    expect(c.x).toBeCloseTo(50, 9)
  })

  test('is area-weighted, not the mean of the vertices', () => {
    // An L-shape. The vertex mean and the area centroid differ, and only the
    // area centroid is inside the figure.
    const L = [P(0, 0), P(90, 0), P(90, 30), P(30, 30), P(30, 90), P(0, 90)]
    const c = centroid(L)
    const vertexMeanY = (0 + 90 + 90 + 30 + 30 + 0) / 6
    expect(c.y).not.toBeCloseTo(vertexMeanY, 3)
  })
})

describe('orderSheets', () => {
  test('a single part is sheet 1', () => {
    expect(orderSheets([box(0, 0, 100, 100)])).toEqual([1])
  })

  test('runs north to south', () => {
    // x is southing, so the smaller x is further north.
    const north = box(0, 0, 100, 50)
    const south = box(0, 50, 100, 100)
    expect(orderSheets([south, north])).toEqual([2, 1])
  })

  test('runs west to east within one band', () => {
    // Same southing range, so one band; y is easting, so the smaller y is west.
    const west = box(0, 0, 50, 100)
    const east = box(50, 0, 100, 100)
    expect(orderSheets([east, west])).toEqual([2, 1])
  })

  test('bands first, then west to east inside each band', () => {
    // Two rows of two, handed over scrambled. This is the test a plain
    // lexicographic sort fails.
    const nw = box(0, 0, 50, 50)
    const ne = box(50, 0, 100, 50)
    const sw = box(0, 50, 50, 100)
    const se = box(50, 50, 100, 100)
    expect(orderSheets([se, nw, sw, ne])).toEqual([4, 1, 3, 2])
  })

  test('every part gets exactly one number, and they are 1..n', () => {
    const parts = [box(0, 0, 40, 40), box(40, 0, 80, 40), box(0, 40, 40, 80)]
    const order = orderSheets(parts)
    expect([...order].sort()).toEqual([1, 2, 3])
  })

  test('west still precedes east when the east part reaches further north', () => {
    // THIS is the test that separates banding from a plain lexicographic sort.
    // On a tidy 2x2 grid the two agree, so the test above cannot tell them
    // apart. Here the parts share a band -- their southing ranges overlap, 0..80
    // and 0..20 -- but east's centroid is further NORTH than west's (x 10 against
    // x 40). Sorted lexicographically by southing then easting, east comes first
    // and the sheets are numbered right to left. Banded, they are one band and
    // run west to east, which is what Decision 10 says.
    const west = box(0, 0, 50, 80)    // centroid (25, 40)
    const east = box(50, 0, 100, 20)  // centroid (75, 10)

    expect(orderSheets([west, east])).toEqual([1, 2])
  })
})
