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

  test('with several insets the first keeps the whole height of the left column and about 70% of the box', () => {
    for (const n of [2, 3, 4]) {
      const [a, ...others] = insetCells(BOX, n)
      expect(a.y0).toBe(BOX.y0)
      expect(a.y1).toBe(BOX.y1)
      expect(a.x0).toBe(BOX.x0)
      expect(size(a).w * size(a).h).toBeGreaterThanOrEqual(0.69 * (BOX.x1 - BOX.x0) * (BOX.y1 - BOX.y0))
      expect(others).toHaveLength(n - 1)
      for (const o of others) {
        expect(o.x0 - a.x1).toBeCloseTo(INSET_GUTTER_MM, 6)   // to its right, a gutter apart
        expect(o.x1).toBeCloseTo(BOX.x1, 6)
      }
    }
  })

  test('the others stack, a gutter apart, and fill the column', () => {
    const [, b, c] = insetCells(BOX, 3)
    expect(b.y0).toBe(BOX.y0)
    expect(c.y1).toBeCloseTo(BOX.y1, 6)
    expect(c.y0 - b.y1).toBeCloseTo(INSET_GUTTER_MM, 6)
    expect(c.x0).toBeCloseTo(b.x0, 9)
  })

  test('five or more take a grid, reading left to right then down', () => {
    const cells = insetCells(BOX, 5)
    expect(cells).toHaveLength(5)
    expect(cells[0].y0).toBe(cells[1].y0)
    expect(cells[0].x0).toBeLessThan(cells[1].x0)
    expect(cells[3].y0).toBeGreaterThan(cells[0].y0)
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
