/**
 * app-shared/cutPointNames.js -- designations for the points a cut creates.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js cutPointNames-shared
 */
import { describe, test, expect } from '@jest/globals'
import { nameCutPoints } from '../../../../app-shared/cutPointNames.js'

const P = (y, x) => ({ y, x })

describe('nameCutPoints', () => {
  test('numbers them from 1 with the default prefix', () => {
    expect(nameCutPoints([P(1, 2), P(3, 4)], []).map((p) => p.name)).toEqual(['C1', 'C2'])
  })

  test('gives every point provenance "-", never found or placed', () => {
    // Spec Decision 6: defined by a click, so neither found nor placed.
    expect(nameCutPoints([P(1, 2)], []).map((p) => p.status)).toEqual(['-'])
  })

  test('keeps the coordinates exactly, without rounding them again', () => {
    // figureSplit already rounded these once, at creation. Rounding a second
    // time is how the outside-figure table and the Coordinate List come to
    // disagree in the last digit.
    const out = nameCutPoints([P(-85729.94, 2144164.76)], [])
    expect(out[0].y).toBe(-85729.94)
    expect(out[0].x).toBe(2144164.76)
  })

  test('does not mutate the points it was given', () => {
    const point = P(1, 2)
    nameCutPoints([point], [])
    expect(Object.keys(point).sort()).toEqual(['x', 'y'])
  })

  test('skips a designation the survey already uses', () => {
    // A survey with a beacon called C1 must not get a second C1 from the cut:
    // two rows under one designation in a lodged Coordinate List.
    expect(nameCutPoints([P(1, 2), P(3, 4)], ['C1', 'C3']).map((p) => p.name))
      .toEqual(['C2', 'C4'])
  })

  test('compares designations case-insensitively', () => {
    // 'c1' and 'C1' are the same designation to a reader.
    expect(nameCutPoints([P(1, 2)], ['c1']).map((p) => p.name)).toEqual(['C2'])
  })

  test('honours a caller-chosen prefix', () => {
    expect(nameCutPoints([P(1, 2)], [], 'SP').map((p) => p.name)).toEqual(['SP1'])
  })

  test('an empty input is an empty result, not a throw', () => {
    expect(nameCutPoints([], [])).toEqual([])
    expect(nameCutPoints(undefined, undefined)).toEqual([])
  })
})
