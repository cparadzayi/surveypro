import { describe, test, expect } from '@jest/globals'
import { layoutMeasured } from '../localityLayout.js'

// A cell of 129 x 86 mm, like the sheet's inset box.
const cell = { x0: 0, y0: 0, x1: 129, y1: 86 }
// The caption at the top left and the north arrow at the top right.
const reserved = [{ x0: 4, y0: 3, x1: 40, y1: 7 }, { x0: 114, y0: 5, x1: 121, y1: 24 }]
const ext = { l: 6, r: 6, u: 6, d: 8 }
const SCALES = [1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000]

const boxAt = (b, lay, ic) => {
  const kk = 1000 / lay.denominator
  const x = lay.cx + (b.e - ic.e) * kk, y = lay.cy - (b.n - ic.n) * kk
  return { x0: x - b.ext.l, x1: x + b.ext.r, y0: y - b.ext.u, y1: y + b.ext.d }
}
const hit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

describe('layoutMeasured', () => {
  test('draws at a round scale from the list, the finest at which everything fits', () => {
    // 3 000 m east-west and 1 500 m north-south: 1:50 000 would need 60 mm x 30 mm plus labels, which fits;
    // 1:25 000 would need 120 mm across, which does not.
    const beacons = [{ e: 0, n: 0, ext }, { e: 3000, n: 1500, ext }]
    const ic = { e: 1500, n: 750 }
    const lay = layoutMeasured({ beacons, cell, reserved, ic, scales: SCALES })
    expect(lay.fits).toBe(true)
    expect(SCALES).toContain(lay.denominator)
    expect(lay.denominator).toBe(50000)
  })

  test('is independent of the order the scales are given in', () => {
    const beacons = [{ e: 0, n: 0, ext }, { e: 3000, n: 1500, ext }]
    const a = layoutMeasured({ beacons, cell, reserved, ic: { e: 1500, n: 750 }, scales: SCALES })
    const b = layoutMeasured({ beacons, cell, reserved, ic: { e: 1500, n: 750 }, scales: [...SCALES].reverse() })
    expect(b).toEqual(a)
  })

  test('puts a tall layout clear of the caption and the arrow, as large as the cell allows', () => {
    // Two stations 3.3 km apart, one almost directly above the other (Scenic's 333/S and the site).
    const beacons = [{ e: 0, n: 3341, ext }, { e: 40, n: 0, ext }]
    const ic = { e: 20, n: 1670 }
    const lay = layoutMeasured({ beacons, cell, reserved, ic, scales: SCALES })
    expect(lay.fits).toBe(true)
    for (const b of beacons) {
      const box = boxAt(b, lay, ic)
      expect(box.x0).toBeGreaterThanOrEqual(1.5 - 1e-9)
      expect(box.x1).toBeLessThanOrEqual(129 - 1.5 + 1e-9)
      expect(box.y0).toBeGreaterThanOrEqual(1.5 - 1e-9)
      expect(box.y1).toBeLessThanOrEqual(86 - 1.5 + 1e-9)
      for (const r of reserved) expect(hit(box, r)).toBe(false)
    }
    // and no finer scale was possible: the next one down needs more height than the cell has
    const finer = SCALES[SCALES.indexOf(lay.denominator) - 1]
    if (finer) expect(3341 * (1000 / finer)).toBeGreaterThan(86 - 2 * 1.5 - ext.u - ext.d - 1)
  })

  test('keeps the stations true to the ground: one scale for both axes, the origin only slides', () => {
    const beacons = [{ e: 0, n: 3341, ext }, { e: 400, n: 0, ext }]
    const ic = { e: 200, n: 1670 }
    const lay = layoutMeasured({ beacons, cell, reserved, ic, scales: SCALES })
    const kk = 1000 / lay.denominator
    const [a, b] = beacons.map((q) => [lay.cx + (q.e - ic.e) * kk, lay.cy - (q.n - ic.n) * kk])
    expect(b[0] - a[0]).toBeCloseTo(400 * kk, 9)
    expect(b[1] - a[1]).toBeCloseTo(3341 * kk, 9) // the sheet's y runs down, so the northern station is higher up
  })

  test('when no scale is clean it says so and still draws the one with the fewest overlaps, the finest among equals', () => {
    // Two stations one metre apart cannot be separated at 1:100 000 or 1:500 000, and a third, far one is
    // fine at either: the overlap is the same at both scales, so the finer is drawn.
    const beacons = [{ e: 0, n: 0, ext }, { e: 1, n: 0, ext }]
    const lay = layoutMeasured({ beacons, cell, reserved, ic: { e: 0.5, n: 0 }, scales: [100000, 500000] })
    expect(lay.fits).toBe(false)
    expect(lay.denominator).toBe(100000)
  })

  test('chooses the placement with fewer faults when none is clean, not the coarsest scale blindly', () => {
    // Three stations: two a metre apart (always overlapping) and one 30 km away. At 1:50 000 the far one
    // would fall off the cell too, giving more faults than at 1:500 000, where only the pair overlaps.
    const beacons = [{ e: 0, n: 0, ext }, { e: 1, n: 0, ext }, { e: 30000, n: 0, ext }]
    const lay = layoutMeasured({ beacons, cell, reserved, ic: { e: 15000, n: 0 }, scales: [50000, 500000] })
    expect(lay.fits).toBe(false)
    expect(lay.denominator).toBe(500000)
  })

  test('a lone station avoids a reserved block at the centre', () => {
    const block = [{ x0: 50, y0: 30, x1: 80, y1: 56 }]
    const lay = layoutMeasured({ beacons: [{ e: 0, n: 0, ext }], cell, reserved: block, ic: { e: 0, n: 0 }, scales: SCALES })
    expect(lay.fits).toBe(true)
    expect(hit(boxAt({ e: 0, n: 0, ext }, lay, { e: 0, n: 0 }), block[0])).toBe(false)
  })
})
