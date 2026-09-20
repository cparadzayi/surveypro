/**
 * Dividing the sheet's one inset box between several insets.
 *
 * The A4 landscape working plan has exactly one uncommitted region: the inset
 * box at x 162.9-292.0, y 109.7-196.1. The figure panel, title, north arrow,
 * area statement and approval box account for everything else. So when a sheet
 * needs a locality diagram AND a detail of beacons that plot on top of each
 * other, they share that box rather than finding space elsewhere.
 *
 * One inset keeps the box exactly as it has always been, so a sheet with no
 * crowding is unchanged.
 */

import { describe, test, expect } from '@jest/globals'
import { insetCells, INSET_GUTTER_MM } from '../insetCells.js'

const BOX = { x0: 162.9, y0: 109.69, x1: 291.97, y1: 196.13 }

const size = (c) => ({ w: c.x1 - c.x0, h: c.y1 - c.y0 })

describe('insetCells', () => {
  test('one inset keeps the whole box, unchanged', () => {
    const [cell] = insetCells(BOX, 1)

    expect(cell).toEqual(BOX)
  })

  test('two insets split it side by side', () => {
    const cells = insetCells(BOX, 2)

    expect(cells).toHaveLength(2)
    expect(cells[0].y0).toBe(BOX.y0)
    expect(cells[0].y1).toBe(BOX.y1)
    // toBeCloseTo, not toEqual: the second cell's width comes out of arithmetic
    // on a larger origin, so the two differ in the last bit of a double.
    expect(size(cells[0]).w).toBeCloseTo(size(cells[1]).w, 6)
    expect(size(cells[0]).h).toBeCloseTo(size(cells[1]).h, 6)
    // Left cell first, so INSET 1 is where a reader already looks for it.
    expect(cells[0].x0).toBeLessThan(cells[1].x0)
  })

  test('three or four take quadrants', () => {
    for (const n of [3, 4]) {
      const cells = insetCells(BOX, n)
      expect(cells).toHaveLength(n)
      // Two columns, two rows.
      expect(new Set(cells.map((c) => c.x0.toFixed(2))).size).toBe(2)
      expect(new Set(cells.map((c) => c.y0.toFixed(2))).size).toBe(2)
    }
  })

  test('reads left to right, then down', () => {
    const [a, b, c, d] = insetCells(BOX, 4)

    expect(a.y0).toBe(b.y0)         // first row
    expect(a.x0).toBeLessThan(b.x0)
    expect(c.y0).toBeGreaterThan(a.y0)
    expect(c.x0).toBe(a.x0)
    expect(d.x0).toBe(b.x0)
  })

  test('never lets two cells touch', () => {
    const cells = insetCells(BOX, 4)
    const [a, b] = cells

    expect(b.x0 - a.x1).toBeCloseTo(INSET_GUTTER_MM, 6)
  })

  test('stays inside the box it was given', () => {
    for (const n of [1, 2, 3, 4, 5, 6, 9]) {
      for (const c of insetCells(BOX, n)) {
        expect(c.x0).toBeGreaterThanOrEqual(BOX.x0)
        expect(c.y0).toBeGreaterThanOrEqual(BOX.y0)
        expect(c.x1).toBeLessThanOrEqual(BOX.x1)
        expect(c.y1).toBeLessThanOrEqual(BOX.y1)
      }
    }
  })

  test('keeps every cell big enough to read', () => {
    // A schematic of two or three names needs room for a title and the marks.
    for (const c of insetCells(BOX, 9)) {
      expect(size(c).w).toBeGreaterThan(30)
      expect(size(c).h).toBeGreaterThan(20)
    }
  })

  test('asks for nothing when there is nothing to draw', () => {
    expect(insetCells(BOX, 0)).toEqual([])
  })
})
