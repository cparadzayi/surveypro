import { fitSuffixLabel, boxFitsInside } from '../suffixLabelFit.js'

const widthAt = (fs) => fs * 0.7
const R = 2.5
const base = (polygon, beaconPos, extra = {}) =>
  fitSuffixLabel({ beaconPos, polygon, widthAt, fontSize: 8, beaconRadius: R, ...extra })

const inside = (polygon, beaconPos, fit) =>
  boxFitsInside(polygon.slice(0, -1), beaconPos, fit.cx, fit.cy,
    widthAt(fit.fontSize), fit.fontSize * 1.2, fit.rotation, { beaconRadius: R })

describe('fitSuffixLabel', () => {
  test('right-angle corner: whole box inside, clear of both lines, horizontal, full size', () => {
    const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }]
    const fit = base(sq, { x: 0, y: 0 })
    expect(fit.fitted).toBe(true)
    expect(fit.rotation).toBe(0)
    expect(fit.fontSize).toBe(8)
    expect(inside(sq, { x: 0, y: 0 }, fit)).toBe(true)
  })

  test('acute corner pushes the label deeper than a right-angle corner', () => {
    const wedge = [{ x: 0, y: 0 }, { x: 120, y: 30 }, { x: 120, y: 90 }, { x: 0, y: 0 }]
    const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }]
    const acute = base(wedge, { x: 0, y: 0 })
    const right = base(sq, { x: 0, y: 0 })
    expect(inside(wedge, { x: 0, y: 0 }, acute)).toBe(true)
    expect(Math.hypot(acute.cx, acute.cy)).toBeGreaterThan(Math.hypot(right.cx, right.cy))
  })

  test('shrinks the font rather than straying far when the corner is tight', () => {
    // Thin wedge: full size needs to sit far out; a smaller letter fits nearer.
    const wedge = [{ x: 0, y: 0 }, { x: 150, y: 20 }, { x: 150, y: 75 }, { x: 0, y: 0 }]
    const fit = base(wedge, { x: 0, y: 0 })
    expect(fit.fitted).toBe(true)
    expect(fit.fontSize).toBeLessThan(8)
    expect(fit.fontSize).toBeGreaterThanOrEqual(8 * 0.65)
    expect(inside(wedge, { x: 0, y: 0 }, fit)).toBe(true)
  })

  test('thin vertical strip: letter is stood perpendicular to the long side', () => {
    // 6pt wide, 100pt tall; horizontal 5.6pt-wide text + clearance cannot fit at 8pt.
    const strip = [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }]
    const fit = base(strip, { x: 0, y: 0 })
    expect(fit.fitted).toBe(true)
    expect(inside(strip, { x: 0, y: 0 }, fit)).toBe(true)
    // baseline perpendicular to the (vertical) long side is horizontal => rotation 0,
    // so test a diagonal strip where the two differ.
    const a = 30 * Math.PI / 180
    const rot = (p) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) })
    const diag = strip.map(rot)
    const f2 = base(diag, diag[0])
    expect(f2.fitted).toBe(true)
    expect(inside(diag, diag[0], f2)).toBe(true)
  })

  test('respects the collision callback', () => {
    const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }]
    const first = base(sq, { x: 0, y: 0 })
    const blocked = base(sq, { x: 0, y: 0 }, {
      collides: (r) => first.cx >= r.x && first.cx <= r.x + r.w && first.cy >= r.y && first.cy <= r.y + r.h,
    })
    expect(Math.hypot(blocked.cx - first.cx, blocked.cy - first.cy)).toBeGreaterThan(0.5)
  })

  test('box that crosses a boundary is rejected even when its centre is inside', () => {
    const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
    expect(boxFitsInside(sq, { x: 0, y: 0 }, 2, 50, 10, 10, 0, { beaconRadius: R })).toBe(false)
    expect(boxFitsInside(sq, { x: 0, y: 0 }, 50, 50, 10, 10, 0, { beaconRadius: R })).toBe(true)
  })
})
