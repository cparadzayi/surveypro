/**
 * app-shared/sheetDerivation.js -- what each sheet states about itself.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js sheetDerivation-shared
 */
import { describe, test, expect } from '@jest/globals'
import { centroid, orderSheets, assignStands } from '../../../../app-shared/sheetDerivation.js'

const P = (y, x) => ({ y, x })
/** An open box from (y0,x0) to (y1,x1), in ring order. */
const box = (y0, x0, y1, x1) => [P(y0, x0), P(y1, x0), P(y1, x1), P(y0, x1)]

describe('centroid', () => {
  test('finds the middle of a square', () => {
    const c = centroid(box(0, 0, 100, 100))
    expect(c.y).toBeCloseTo(50, 9)
    expect(c.x).toBeCloseTo(50, 9)
  })

  test('keeps easting and southing apart', () => {
    // Both other fixtures are diagonally symmetric, so a centroid that
    // accumulated the easting terms into the southing accumulator and vice versa
    // would pass them unchanged. This rectangle is wider than it is tall, so the
    // two coordinates cannot be swapped without the test noticing -- and Task 2
    // consumes centroid, so a silent axis swap here would travel.
    const wide = box(0, 0, 100, 20)
    const c = centroid(wide)
    expect(c.y).toBeCloseTo(50, 9)
    expect(c.x).toBeCloseTo(10, 9)
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

  test('runs west to east when two parts share a southing', () => {
    // Equal centroid southings, so the secondary key decides; y is easting, so
    // the smaller y is west.
    const west = box(0, 0, 50, 100)
    const east = box(50, 0, 100, 100)
    expect(orderSheets([east, west])).toEqual([2, 1])
  })

  test('reads a grid row by row: north row west to east, then south row', () => {
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

  test('the part whose middle lies further north comes first, even if it is east', () => {
    // This test was the other way round while orderSheets grouped parts into
    // bands of overlapping southing range. That rule chained two disjoint rows
    // into one band whenever a part spanned both, and interleaved them, so it
    // was replaced by the two-key centroid sort Decision 10 actually describes.
    // Under it, southing is the PRIMARY key: east's middle is 30 m further north
    // than west's, so east is sheet 1. A part whose middle lies further north is
    // further north.
    const west = box(0, 0, 50, 80)    // centroid (25, 40)
    const east = box(50, 0, 100, 20)  // centroid (75, 10)

    expect(orderSheets([west, east])).toEqual([2, 1])
  })

  test('a part spanning two rows never interleaves them', () => {
    // The defect that retired the banding rule. `bridge` spans the whole
    // southing extent, and the two rows it spans do not overlap each other at
    // all -- yet banding chained them and numbered the plan north-west,
    // SOUTH-west, north-east, south-east. Ordinary geometry: one wide part
    // beside two stacked narrower ones.
    const west1 = box(0, 0, 20, 20)
    const east1 = box(30, 0, 50, 20)
    const west2 = box(0, 80, 20, 100)
    const east2 = box(30, 80, 50, 100)
    const bridge = box(0, 60, 100, 80)
    const parts = [west1, east1, west2, east2, bridge]

    const order = orderSheets(parts)
    // The sequence must run monotonically north to south: no sheet may sit
    // further north than the sheet before it.
    const southings = order
      .map((sheet, i) => ({ sheet, x: centroid(parts[i]).x }))
      .sort((a, b) => a.sheet - b.sheet)
      .map((s) => s.x)

    expect(southings).toEqual([...southings].sort((a, b) => a - b))
  })
})

describe('assignStands', () => {
  const west = box(0, 0, 50, 100)
  const east = box(50, 0, 100, 100)
  const parts = [west, east]
  const stand = (name, y0, x0, y1, x1, extra = {}) =>
    ({ name, ring: box(y0, x0, y1, x1), ...extra })

  test('puts each stand on the part that holds it', () => {
    const r = assignStands(parts, [
      stand('1686', 10, 10, 20, 20),
      stand('1687', 60, 10, 70, 20),
    ])
    expect(r).toEqual({ ok: true, bySheet: [['1686'], ['1687']] })
  })

  test('keeps the order the stands were given', () => {
    const r = assignStands(parts, [
      stand('1687', 30, 10, 40, 20),
      stand('1686', 10, 10, 20, 20),
    ])
    expect(r.bySheet[0]).toEqual(['1687', '1686'])
  })

  test('refuses a stand no part holds, naming it', () => {
    const r = assignStands(parts, [stand('9999', 200, 200, 210, 210)])
    expect(r).toEqual({ ok: false, error: 'stand-off-plan', stands: ['9999'] })
  })

  test('refuses a stand two parts hold, naming it', () => {
    // A stand spanning the cut. standsCrossedBy refuses such a cut, so reaching
    // this means an earlier rule failed -- which is why it is caught rather than
    // resolved by picking a side.
    const r = assignStands(parts, [stand('1690', 40, 10, 60, 20)])
    expect(r).toEqual({ ok: false, error: 'stand-straddles-sheets', stands: ['1690'] })
  })

  test('names every unplaceable stand, not just the first', () => {
    const r = assignStands(parts, [
      stand('9998', 200, 200, 210, 210),
      stand('1686', 10, 10, 20, 20),
      stand('9999', 300, 300, 310, 310),
    ])
    expect(r.ok).toBe(false)
    expect(r.stands).toEqual(['9998', '9999'])
  })

  test('an unplaceable public place is skipped, not refused', () => {
    // Roads are not digitised yet -- the same reason Decision 7 exempts them
    // from the straddle rule. Refusing would block every split in a township.
    const r = assignStands(parts, [
      stand('1686', 10, 10, 20, 20),
      { name: 'Road', isPublicPlace: true },
    ])
    expect(r).toEqual({ ok: true, bySheet: [['1686'], []] })
  })

  test('a non-public stand with no usable ring is still refused', () => {
    const r = assignStands(parts, [{ name: 'NoRing' }])
    expect(r).toEqual({ ok: false, error: 'stand-off-plan', stands: ['NoRing'] })
  })
})
