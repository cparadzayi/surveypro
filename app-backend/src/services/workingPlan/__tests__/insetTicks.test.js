import { describe, test, expect } from '@jest/globals'
import { placeInsetTicks, tickBox, TICK_INTERVALS } from '../insetTicks.js'

// A 63 x 86 mm cell, a scale of 1:25 000 (so 1 000 m is 40 mm), and the sheet's tick geometry.
const cell = { x0: 0, y0: 0, x1: 63, y1: 86 }
const geometry = { arm: 6, labelW: 25, drop: 17.4 }
const D = 25000
// The ground point (e0, n0) sits at the cell's middle, and is itself a node of the 500 m lattice (X = 4500, Y = -1000).
const e0 = 1000, n0 = -4500
const T = (e, n) => [31.5 + ((e - e0) / D) * 1000, 43 - ((n - n0) / D) * 1000]
const Tinv = (x, y) => [e0 + ((x - 31.5) * D) / 1000, n0 - ((y - 43) * D) / 1000]
const base = { cell, D, T, Tinv, geometry }

const inCell = (b) => b.x0 >= 0 && b.y0 >= 0 && b.x1 <= 63 && b.y1 <= 86
const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

describe('placeInsetTicks', () => {
  test('always places at least one tick, at a round coordinate, with its box inside the cell', () => {
    const r = placeInsetTicks(base)
    expect(r.ticks.length).toBeGreaterThanOrEqual(1)
    const t = r.ticks[0]
    expect(Math.abs(t.X % r.interval)).toBe(0)
    expect(Math.abs(t.Y % r.interval)).toBe(0)
    expect(inCell(t.box)).toBe(true)
    expect(r.clear).toBe(true)
  })

  test('the tick stands where the ground puts that coordinate: X = -n, Y = -e, through the inset’s own mapping', () => {
    const t = placeInsetTicks(base).ticks[0]
    expect(t.e).toBe(-t.Y)
    expect(t.n).toBe(-t.X)
    const [x, y] = T(t.e, t.n)
    expect(t.x).toBeCloseTo(x, 9)
    expect(t.y).toBeCloseTo(y, 9)
  })

  test('uses a lattice spacing wide enough to read: at least 20 mm on paper', () => {
    const r = placeInsetTicks(base)
    expect((r.interval * 1000) / D).toBeGreaterThanOrEqual(20)
    expect(TICK_INTERVALS).toContain(r.interval)
  })

  test('keeps clear of the reserved rectangles and of what is already drawn', () => {
    const reserved = [{ x0: 4, y0: 3, x1: 40, y1: 8 }, { x0: 48, y0: 5, x1: 55, y1: 24 }]
    const obstacles = [{ x0: 40, y0: 30, x1: 62, y1: 80 }]
    const r = placeInsetTicks({ ...base, reserved, obstacles })
    expect(r.clear).toBe(true)
    for (const o of [...reserved, ...obstacles]) expect(hit(r.ticks[0].box, o)).toBe(false)
  })

  test('tries the other side of a node before giving it up', () => {
    // A block on the right of the middle but not the left: a node near the middle can still carry its figures leftward.
    const obstacles = [{ x0: 40, y0: 0, x1: 63, y1: 86 }]
    const r = placeInsetTicks({ ...base, obstacles })
    expect(r.clear).toBe(true)
    expect(hit(r.ticks[0].box, obstacles[0])).toBe(false)
  })

  test('takes the clear node nearest the cell’s middle', () => {
    const open = placeInsetTicks(base).ticks[0]
    const blocked = placeInsetTicks({ ...base, obstacles: [{ x0: open.box.x0 - 1, y0: open.box.y0 - 1, x1: open.box.x1 + 1, y1: open.box.y1 + 1 }] }).ticks[0]
    const d = (t) => Math.hypot(t.x - 31.5, t.y - 43)
    expect(d(blocked)).toBeGreaterThanOrEqual(d(open))
    expect(blocked.X === open.X && blocked.Y === open.Y && blocked.side === open.side).toBe(false)
  })

  test('still places one when nothing has room, at the node that hides least, and says it is not clear', () => {
    // The whole cell is blocked.
    const r = placeInsetTicks({ ...base, obstacles: [{ x0: 0, y0: 0, x1: 63, y1: 86 }] })
    expect(r.ticks).toHaveLength(1)
    expect(r.clear).toBe(false)
    expect(r.ticks[0].x).toBeGreaterThanOrEqual(0)
    expect(r.ticks[0].x).toBeLessThanOrEqual(63)
  })

  test('works at every inset scale the sheet uses, from 1:1.5 to 1:4 000 000', () => {
    for (const d of [1.5, 5, 50, 500, 2500, 12500, 75000, 250000, 2000000, 4000000]) {
      const Tk = (e, n) => [31.5 + ((e - e0) / d) * 1000, 43 - ((n - n0) / d) * 1000]
      const Tkinv = (x, y) => [e0 + ((x - 31.5) * d) / 1000, n0 - ((y - 43) * d) / 1000]
      const r = placeInsetTicks({ cell, D: d, T: Tk, Tinv: Tkinv, geometry })
      expect([d, r.ticks.length >= 1]).toEqual([d, true])
      expect([d, Number.isFinite(r.ticks[0].X) && Number.isFinite(r.ticks[0].Y)]).toEqual([d, true])
    }
  })

  test('a tick box reads toward its side', () => {
    expect(tickBox(10, 10, 'right', geometry).x1).toBe(35)
    expect(tickBox(10, 10, 'left', geometry).x0).toBe(-15)
  })
})
