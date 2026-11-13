/**
 * app-shared/figureOrder.js -- a figure's data starts at the northmost point and runs clockwise.
 * Run: cd app-backend && node --experimental-vm-modules node_modules/jest/bin/jest.js figureOrder-shared
 *
 * Cape Lo: Y = westing, X = southing. North is SMALLER X; east is SMALLER Y.
 */
import { describe, test, expect } from '@jest/globals'
import { northmostIndex, northClockwiseOrder, northClockwise } from '../../../../app-shared/figureOrder.js'

const P = (y, x) => ({ y, x })

// A square, corners named by where they are on the plan. East = -Y, north = -X.
const NW = P(100, 100)   // west (large Y), north (small X)
const NE = P(90, 100)
const SE = P(90, 110)
const SW = P(100, 110)
const names = (pts) => pts.map((p) => ({ [NW.y + ',' + NW.x]: 'NW', [NE.y + ',' + NE.x]: 'NE', [SE.y + ',' + SE.x]: 'SE', [SW.y + ',' + SW.x]: 'SW' })[p.y + ',' + p.x])

describe('northmostIndex', () => {
  test('is the point with the smallest X (furthest north)', () => {
    expect(northmostIndex([P(0, 50), P(0, 10), P(0, 30)])).toBe(1)
  })

  test('of two level points takes the western one (larger Y), so the walk goes east along the top', () => {
    expect(northmostIndex([NE, NW, SE, SW])).toBe(1)
  })
})

describe('northClockwise', () => {
  test('a clockwise ring is only rotated to start at the northmost point', () => {
    // On the plan, clockwise from NW: NW -> NE -> SE -> SW
    const ring = [SE, SW, NW, NE]
    expect(northClockwiseOrder(ring).reversed).toBe(false)
    expect(names(northClockwise(ring))).toEqual(['NW', 'NE', 'SE', 'SW'])
  })

  test('a counter-clockwise ring is walked the other way round', () => {
    const ring = [NW, SW, SE, NE]                // NW -> SW -> SE -> NE is anticlockwise on the plan
    expect(northClockwiseOrder(ring).reversed).toBe(true)
    expect(names(northClockwise(ring))).toEqual(['NW', 'NE', 'SE', 'SW'])
  })

  test('the result is the same whichever way round, and wherever, the ring was started', () => {
    const cw = [NW, NE, SE, SW]
    for (let s = 0; s < 4; s++) {
      const rot = [...cw.slice(s), ...cw.slice(0, s)]
      expect(names(northClockwise(rot))).toEqual(['NW', 'NE', 'SE', 'SW'])
      expect(names(northClockwise([...rot].reverse()))).toEqual(['NW', 'NE', 'SE', 'SW'])
    }
  })

  test('a triangle pointing north starts at its apex and goes east, then south-west, then back', () => {
    const apex = P(95, 100), se = P(90, 110), sw = P(100, 110)
    expect(northClockwise([sw, apex, se])).toEqual([apex, se, sw])
    expect(northClockwise([apex, sw, se])).toEqual([apex, se, sw])
  })

  test('fewer than three points are left alone', () => {
    expect(northClockwise([P(1, 2), P(3, 4)])).toEqual([P(1, 2), P(3, 4)])
    expect(northClockwise([])).toEqual([])
  })

  test('does not mutate its input', () => {
    const ring = [NW, SW, SE, NE]
    const copy = [...ring]
    northClockwise(ring)
    expect(ring).toEqual(copy)
  })
})
