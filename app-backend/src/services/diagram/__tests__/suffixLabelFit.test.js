import { fitSuffixLabel, boxFitsInside, MAX_TILT_DEG } from '../suffixLabelFit.js'

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

  test('thin strip: stays inside, horizontal or only slightly tilted, never stood on end', () => {
    // 9pt wide, 100pt tall: a horizontal 5.6pt-wide letter fits between the lines.
    const strip = [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }]
    const fit = base(strip, { x: 0, y: 0 })
    expect(fit.fitted).toBe(true)
    expect(inside(strip, { x: 0, y: 0 }, fit)).toBe(true)
    expect(Math.abs(fit.rotation)).toBeLessThanOrEqual(MAX_TILT_DEG)
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

  test('reflex corner (parcel wraps a neighbour): letter stays beside its beacon', () => {
    // Stand 1423 / 1421 shape: the beacon is the inner corner of an L, interior
    // angle 270 degrees, so the summed edge vectors point OUT of the parcel.
    const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 40, y: 40 },
      { x: 40, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }]
    const corner = { x: 40, y: 40 }
    const fit = base(L, corner)
    expect(fit.fitted).toBe(true)
    expect(Math.hypot(fit.cx - corner.x, fit.cy - corner.y)).toBeLessThan(15)
    expect(inside(L, corner, fit)).toBe(true)
  })

  describe('two close beacons on one edge (D and E)', () => {
    // Interior to the right; T above, L below, 40pt apart down a left-hand kink.
    const ring = [{ x: 20, y: -40 }, { x: 0, y: 0 }, { x: 8, y: 40 }, { x: 60, y: 70 },
      { x: 200, y: 70 }, { x: 200, y: -40 }, { x: 20, y: -40 }]
    const T = { x: 0, y: 0 }, L = { x: 8, y: 40 }
    const dist = (f, b) => Math.hypot(f.cx - b.x, f.cy - b.y)
    const box = (f) => ({ x: f.cx - widthAt(f.fontSize) / 2, y: f.cy - f.fontSize * 0.6, w: widthAt(f.fontSize), h: f.fontSize * 1.2 })
    const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

    test.each([['lower first', true], ['upper first', false]])('each letter is nearer its own beacon (%s)', (_n, lowerFirst) => {
      const [firstB, firstOther, secondB, secondOther] = lowerFirst ? [L, T, T, L] : [T, L, L, T]
      const f1 = base(ring, firstB, { neighbours: [firstOther] })
      const placed = box(f1)
      const f2 = base(ring, secondB, { neighbours: [secondOther], collides: (r) => overlap(r, placed) })
      const [fl, ft] = lowerFirst ? [f1, f2] : [f2, f1]
      expect(dist(ft, T)).toBeLessThan(dist(ft, L))
      expect(dist(fl, L)).toBeLessThan(dist(fl, T))
      expect(overlap(box(ft), box(fl))).toBe(false)
    })

    test('placed lower first, cooperating is never worse than placing greedily', () => {
      // Circles 10pt apart, with letters held within 30 degrees of the axes.
      const tight = [{ x: 25, y: -40 }, { x: 0, y: 0 }, { x: 5, y: 10 }, { x: 40, y: 35 },
        { x: 200, y: 35 }, { x: 200, y: -40 }]
      const t = { x: 0, y: 0 }, l = { x: 5, y: 10 }
      const hit = (r, f) => { const b = box(f); return r.x < b.x + b.w && b.x < r.x + r.w && r.y < b.y + b.h && b.y < r.y + r.h }
      const greedyL = base(tight, l)
      const greedyT = base(tight, t, { collides: (r) => hit(r, greedyL) })
      const coopL = base(tight, l, { neighbours: [t] })
      const coopT = base(tight, t, { neighbours: [l], collides: (r) => hit(r, coopL) })
      expect(coopL.fontSize + coopT.fontSize).toBeGreaterThanOrEqual(greedyL.fontSize + greedyT.fontSize - 1e-9)
      expect(Math.min(coopL.fontSize, coopT.fontSize)).toBeGreaterThanOrEqual(8 * 0.65)
    })
  })

  describe('in-parcel letters are horizontal, tilting only slightly and only when needed', () => {
    test('clear corner: exactly horizontal', () => {
      const sq = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }]
      for (const corner of sq.slice(0, 4)) expect(base(sq, corner).rotation).toBe(0)
    })

    test('whatever the geometry, the tilt never exceeds the limit', () => {
      for (const deg of [0, 20, 30, 45, 60, 75, 90, 120]) {
        const a = deg * Math.PI / 180
        const rot = (p) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) })
        const strip = [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 120 }, { x: 0, y: 120 }, { x: 0, y: 0 }].map(rot)
        for (const corner of strip.slice(0, 4)) {
          expect(Math.abs(base(strip, corner).rotation)).toBeLessThanOrEqual(MAX_TILT_DEG)
        }
      }
    })

    test('a small tilt is used to clear a boundary when horizontal cannot', () => {
      // A narrow slot leaning 15 degrees: a horizontal 5.6pt letter is a tight fit,
      // a letter tilted with the slot clears it at full size.
      const a = 15 * Math.PI / 180
      const rot = (p) => ({ x: p.x * Math.cos(a) - p.y * Math.sin(a), y: p.x * Math.sin(a) + p.y * Math.cos(a) })
      const slot = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 120 }, { x: 0, y: 120 }, { x: 0, y: 0 }].map(rot)
      const f = base(slot, slot[0])
      expect(f.fitted).toBe(true)
      expect(Math.abs(f.rotation)).toBeLessThanOrEqual(MAX_TILT_DEG)
      expect(inside(slot, slot[0], f)).toBe(true)
    })
  })

  describe('stands too narrow to hold the letter (1392A / 1393A / 1398C / 1400C)', () => {
    // A 3pt-wide, 120pt-long stand: no letter fits wholly inside anywhere.
    const strip = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 120 }, { x: 0, y: 120 }, { x: 0, y: 0 }]
    const dist = (f, b) => Math.hypot(f.cx - b.x, f.cy - b.y)

    test('letter stays beside its beacon instead of being dropped at the centroid', () => {
      const b = { x: 0, y: 0 }
      const f = base(strip, b)
      expect(dist(f, b)).toBeLessThan(12) // the centroid is 60pt away
      expect(f.cy).toBeGreaterThan(0)     // up the stand, centre inside it
      expect(f.cx).toBeGreaterThan(0)
      expect(f.cx).toBeLessThan(3)
    })

    test('two beacons at the tip of a narrow stand each keep their letter near them', () => {
      const tipL = { x: 0, y: 0 }, tipR = { x: 3, y: 0 }
      const hit = (r, f) => { const w = widthAt(f.fontSize), h = f.fontSize * 1.2
        return r.x < f.cx + w / 2 && f.cx - w / 2 < r.x + r.w && r.y < f.cy + h / 2 && f.cy - h / 2 < r.y + r.h }
      const fl = base(strip, tipL, { neighbours: [tipR] })
      const fr = base(strip, tipR, { neighbours: [tipL], collides: (r) => hit(r, fl) })
      expect(dist(fl, tipL)).toBeLessThan(15)
      expect(dist(fr, tipR)).toBeLessThan(25)
    })
  })
})
