import { describe, test, expect } from '@jest/globals'
import { placeFigureVertexName, vertexIndexAt } from '../dxfOutsideLabel.js'
import { rectangleOverlapsPolygon, isPointInPolygon } from '../dxfGeometry.js'

// DXF ground metres, y up, at 1:500. A 6.5 pt cap height is 1.15 m on the ground there.
const S = 500
const CAP = (6.5 * 25.4 / 72) * S / 1000
const R = 0.4
const place = (ring, index, o = {}) => placeFigureVertexName({ ring, index, text: 'M21', capHeight: CAP, beaconRadius: R, scaleDenominator: S, ...o })
// the text's ink box as placed
const boxOf = (p) => ({ x: p.cx - p.width / 2, y: p.cy - CAP / 2, width: p.width, height: CAP })

const square = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }]
// An L: the corner at (20,20) is REFLEX (the wedge there is mostly outside the figure).
const ell = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 40 }, { x: 0, y: 40 }]

describe('vertexIndexAt', () => {
  test('finds the vertex a beacon sits on, ignoring a closing repeat, and -1 elsewhere', () => {
    expect(vertexIndexAt([...square, square[0]], { x: 30, y: 0.2 })).toBe(1)
    expect(vertexIndexAt(square, { x: 15, y: 15 })).toBe(-1)
  })
})

describe('placeFigureVertexName', () => {
  test('every corner of a square gets its name wholly outside the figure, near the beacon', () => {
    square.forEach((v, i) => {
      const p = place(square, i)
      expect(p.found).toBe(true)
      expect(rectangleOverlapsPolygon(boxOf(p), square, 0)).toBe(false)
      expect(isPointInPolygon({ x: p.cx, y: p.cy }, square)).toBe(false)
      // within the PDF's own 30 pt bound for these labels, 30 pt = 5.3 m at 1:500
      expect(p.distance).toBeLessThan(5.3)
    })
  })

  test('the name goes OUT from the corner (the local outside), not along the side', () => {
    const p = place(square, 0) // corner (0,0): outside is down and to the left
    expect(p.cx).toBeLessThan(0)
    expect(p.cy).toBeLessThan(0)
    const q = place(square, 2) // corner (30,30): up and to the right
    expect(q.cx).toBeGreaterThan(30)
    expect(q.cy).toBeGreaterThan(30)
  })

  test('at a reflex corner it still ends up outside the figure', () => {
    const p = place(ell, 3) // (20,20), the inside corner of the L
    expect(p.found).toBe(true)
    expect(rectangleOverlapsPolygon(boxOf(p), ell, 0)).toBe(false)
    expect(isPointInPolygon({ x: p.cx, y: p.cy }, ell)).toBe(false)
  })

  test('works whichever way the ring is wound', () => {
    const cw = [...square].reverse()
    const p = place(cw, cw.findIndex((v) => v.x === 30 && v.y === 30))
    expect(rectangleOverlapsPolygon(boxOf(p), cw, 0)).toBe(false)
    expect(p.cx).toBeGreaterThan(30)
  })

  test('steps clear of a label already there', () => {
    const first = place(square, 0)
    const taken = boxOf(first)
    const hit = (r) => r.x < taken.x + taken.width && taken.x < r.x + r.width && r.y < taken.y + taken.height && taken.y < r.y + r.height
    const second = place(square, 0, { collides: hit })
    expect(hit(boxOf(second))).toBe(false)
    expect(rectangleOverlapsPolygon(boxOf(second), square, 0)).toBe(false)
  })

  test('is the same on paper at another scale', () => {
    const big = square.map((v) => ({ x: v.x * 2, y: v.y * 2 }))
    const a = place(square, 0)
    const b = placeFigureVertexName({ ring: big, index: 0, text: 'M21', capHeight: CAP * 2, beaconRadius: R * 2, scaleDenominator: S * 2 })
    expect(b.distance).toBeCloseTo(a.distance * 2, 6)
  })
})
