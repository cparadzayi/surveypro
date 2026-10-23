import { fitRoadLabel } from '../roadLabelFit.js'

const widthAt = (fs) => fs * 3 // "Road" ~ 3 em
// Tagged edge along y=0 from x=0..100; the road lies to +y (normal [0,1]);
// its far line is y=GAP.
const edge = { a: [0, 0], b: [100, 0], normal: [0, 1] }
const line = (y) => [[-20, y], [120, y]]
const base = (gap, extra = {}) => fitRoadLabel({
  ...edge, segments: [line(0), line(gap)], widthAt, fontMax: 11, fontMin: 5, ...extra,
})

describe('fitRoadLabel', () => {
  test('sits midway between the two lines', () => {
    const f = base(30)
    expect(f.ok && f.clear).toBe(true)
    expect(f.cy).toBeCloseTo(15, 3)
    expect(f.fontSize).toBe(11)
  })

  test('far line is read from the geometry, not the typed width', () => {
    const f = base(30, { widthHint: 40 }) // within 2x of 30, so geometry wins
    expect(f.cy).toBeCloseTo(15, 3)
  })

  test('implausible geometry falls back to the typed width', () => {
    const f = fitRoadLabel({ ...edge, segments: [line(0), line(200)], widthAt, fontMax: 11, widthHint: 20 })
    expect(f.cy).toBeCloseTo(10, 3)
  })

  test('shrinks to fit a narrow road and never touches either line', () => {
    const f = base(8)
    expect(f.fontSize).toBeLessThan(11)
    const h = f.fontSize * 0.9
    expect(f.cy - h / 2).toBeGreaterThan(0)
    expect(f.cy + h / 2).toBeLessThan(8)
  })

  test('slides along the road rather than printing across a cross line', () => {
    // A side line at x=50 runs straight through the middle of the road.
    const cross = [[50, -5], [50, 40]]
    const f = fitRoadLabel({ ...edge, segments: [line(0), line(30), cross], widthAt, fontMax: 11, fontMin: 5 })
    expect(f.clear).toBe(true)
    const w = widthAt(f.fontSize)
    const clearOfCross = f.cx + w / 2 < 50 || f.cx - w / 2 > 50
    expect(clearOfCross).toBe(true)
  })

  test('no far line and no width: reports not ok so the caller keeps its fixed offset', () => {
    const f = fitRoadLabel({ ...edge, segments: [line(0)], widthAt, fontMax: 11 })
    expect(f.ok).toBe(false)
  })

  test('works with the normal pointing the other way (y-up frame)', () => {
    const f = fitRoadLabel({ a: [0, 0], b: [100, 0], normal: [0, -1], segments: [line(0), line(-30)], widthAt, fontMax: 11 })
    expect(f.cy).toBeCloseTo(-15, 3)
  })
})
