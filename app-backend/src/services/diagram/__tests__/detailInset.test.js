import { describe, test, expect } from '@jest/globals'
import {
  interiorAngleDeg, sharpVertices, clipSegmentToCircle, pointInPolygon, insetDenominator,
  findInsetCentre, pointSegmentDistance, segmentHitsBox, boxesOverlap, placeLabel, planDetailInset,
} from '../detailInset.js'

const square = [[0, 0], [10, 0], [10, 10], [0, 10]]
// A thin wedge: the point at (0, 0) is about 11.4 degrees.
const wedge = [[0, 0], [100, 10], [100, 30]]

describe('interior angle', () => {
  test('a square has 90 degree corners whichever way it winds', () => {
    for (const ring of [square, [...square].reverse()]) {
      for (let i = 0; i < 4; i++) expect(interiorAngleDeg(ring, i)).toBeCloseTo(90, 6)
    }
  })

  test('a reflex corner reads above 180, not as its small outer wedge', () => {
    const arrow = [[0, 0], [10, 5], [0, 10], [4, 5]] // the notch at (4, 5) points inward
    expect(interiorAngleDeg(arrow, 3)).toBeGreaterThan(180)
  })

  test('picks out only the sharp corner of a wedge', () => {
    expect(sharpVertices(wedge, 30)).toEqual([0])
    expect(sharpVertices(square, 30)).toEqual([])
  })
})

describe('clipSegmentToCircle', () => {
  const c = [0, 0]
  test('keeps a segment wholly inside', () => {
    expect(clipSegmentToCircle([-1, 0], [1, 0], c, 5)).toEqual([[-1, 0], [1, 0]])
  })
  test('cuts a segment that crosses the rim at the rim', () => {
    const [p, q] = clipSegmentToCircle([-10, 0], [10, 0], c, 5)
    expect(p[0]).toBeCloseTo(-5, 9)
    expect(q[0]).toBeCloseTo(5, 9)
  })
  test('cuts a segment that starts inside and leaves', () => {
    const [p, q] = clipSegmentToCircle([0, 0], [10, 0], c, 5)
    expect(p).toEqual([0, 0])
    expect(q[0]).toBeCloseTo(5, 9)
  })
  test('returns null for a segment wholly outside or that stops short of the circle', () => {
    expect(clipSegmentToCircle([10, 10], [20, 10], c, 5)).toBeNull()
    expect(clipSegmentToCircle([-10, 0], [-6, 0], c, 5)).toBeNull()
  })
})

describe('geometry helpers', () => {
  test('point in polygon', () => {
    expect(pointInPolygon([5, 5], square)).toBe(true)
    expect(pointInPolygon([15, 5], square)).toBe(false)
  })
  test('point to segment distance', () => {
    expect(pointSegmentDistance([5, 3], [0, 0], [10, 0])).toBeCloseTo(3, 9)
    expect(pointSegmentDistance([13, 4], [0, 0], [10, 0])).toBeCloseTo(5, 9)
  })
})

describe('insetDenominator', () => {
  test('is a round figure at least three times larger in scale', () => {
    expect(insetDenominator(2000)).toBe(500)
    expect(insetDenominator(750)).toBe(250)
    expect(insetDenominator(1000)).toBe(250)
  })
  test('is null when the plan is already at a large scale', () => {
    expect(insetDenominator(100)).toBeNull()
  })
})

describe('findInsetCentre', () => {
  const bounds = { x: 0, y: 0, width: 300, height: 200 }
  test('finds the free spot nearest the target and keeps clear of segments', () => {
    const segs = [[[140, 0], [140, 200]]] // a wall down the middle
    const c = findInsetCentre({ target: [150, 100], r: 30, bounds, margin: 4, clear: 6, minFromTarget: 40, segments: segs })
    expect(c).not.toBeNull()
    for (const [a, b] of segs) expect(pointSegmentDistance(c, a, b)).toBeGreaterThanOrEqual(36)
    expect(Math.hypot(c[0] - 150, c[1] - 100)).toBeGreaterThanOrEqual(40)
  })
  test('returns null when nothing is free', () => {
    const wall = [[[0, 100], [300, 100]], [[150, 0], [150, 200]]]
    expect(findInsetCentre({ target: [150, 100], r: 90, bounds, margin: 4, clear: 6, minFromTarget: 0, segments: wall })).toBeNull()
  })
})

describe('label placement', () => {
  const box = { x: 0, y: 0, w: 10, h: 10 }
  test('a segment through, touching or inside a box hits it; one clear of it does not', () => {
    expect(segmentHitsBox([-5, 5], [15, 5], box)).toBe(true)
    expect(segmentHitsBox([2, 2], [4, 4], box)).toBe(true)
    expect(segmentHitsBox([-5, 20], [15, 20], box)).toBe(false)
    expect(segmentHitsBox([12, 0], [12, 10], box, 1)).toBe(false)
    expect(segmentHitsBox([12, 0], [12, 10], box, 3)).toBe(true)
  })

  test('boxes overlap only when they share area', () => {
    expect(boxesOverlap(box, { x: 5, y: 5, w: 10, h: 10 })).toBe(true)
    expect(boxesOverlap(box, { x: 20, y: 0, w: 5, h: 5 })).toBe(false)
  })

  test('takes the first candidate that touches nothing, skipping one on a line', () => {
    const circle = { c: [0, 0], r: 50 }
    const line = [[-30, 0], [30, 0]]
    const at = placeLabel({ w: 10, h: 6, candidates: [[0, 0], [0, 12]], circle, segments: [line], boxes: [] })
    expect(at.clean).toBe(true)
    expect(at.y + at.h / 2).toBeCloseTo(12, 9)
  })

  test('avoids a label already placed', () => {
    const circle = { c: [0, 0], r: 50 }
    const placed = { x: -5, y: -3, w: 10, h: 6 }
    const at = placeLabel({ w: 10, h: 6, candidates: [[0, 0], [20, 0]], circle, segments: [], boxes: [placed] })
    expect(at.x + at.w / 2).toBeCloseTo(20, 9)
  })

  test('rejects a candidate whose box would leave the circle, and reports an unclean fallback', () => {
    const circle = { c: [0, 0], r: 10 }
    const at = placeLabel({ w: 10, h: 6, candidates: [[9, 0]], circle, segments: [], boxes: [] })
    expect(at).toBeNull()
    const line = [[-30, 0], [30, 0]]
    const fallback = placeLabel({ w: 6, h: 4, candidates: [[0, 0]], circle: { c: [0, 0], r: 50 }, segments: [line], boxes: [] })
    expect(fallback.clean).toBe(false)
  })
})

describe('planDetailInset', () => {
  // The wedge's sharp point is vertex 0 at (0, 0); two neighbours have a corner within the ring round it.
  const ring = [[0, 0], [400, 20], [400, 60]]
  const nbs = [
    { key: 'A', stand: '1344', ring: [[0, 0], [-6, 8], [-30, 0], [0, 0]] },
    { key: 'B', stand: '1345', ring: [[5, 6], [8, -10], [30, 0], [5, 6]] },
  ]
  const base = {
    ring, i: 0, nbs, denom: 2000, insetDenom: 500, bounds: { x: 100, y: 100, width: 600, height: 500 },
    obstacles: [], fs: 8, widthOf: (t) => t.length * 4.5, letters: ['A', 'B', 'C'], number: 1,
  }

  test('plans a circle at the magnification, titled with its number', () => {
    const p = planDetailInset(base)
    expect(p).not.toBeNull()
    expect(p.k).toBe(4)
    expect(p.title).toBe('Inset 1')
    expect(p.caption).toBe('Scale 1 : 500')
    expect(planDetailInset({ ...base, number: 3 }).title).toBe('Inset 3')
  })

  test('names the neighbours it magnifies, and only those', () => {
    const p = planDetailInset(base)
    expect([...p.taken].sort()).toEqual(['A', 'B'])
    expect(p.labels.filter((l) => l.kind === 'name').map((l) => l.text).sort()).toEqual(['1344', '1345'])
  })

  test('no label touches a drawn line, a beacon or another label', () => {
    const p = planDetailInset(base)
    const drawn = [...p.nbSegs, ...p.subjSegs]
    const boxes = p.labels.map((l) => ({ x: l.x, y: l.y, w: l.text.length * 4.5, h: 8 }))
    for (const b of boxes) for (const [u, v] of drawn) expect(segmentHitsBox(u, v, b)).toBe(false)
    for (const q of p.beacons) for (const b of boxes) {
      expect(boxesOverlap(b, { x: q[0] - p.beaconR, y: q[1] - p.beaconR, w: 2 * p.beaconR, h: 2 * p.beaconR })).toBe(false)
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(boxesOverlap(boxes[i], boxes[j])).toBe(false)
  })

  test('is not planned when fewer than two neighbours have a corner at the beacon', () => {
    expect(planDetailInset({ ...base, nbs: [nbs[0]] })).toBeNull()
  })

  test('is not planned when the sheet has no room for the circle', () => {
    expect(planDetailInset({ ...base, bounds: { x: 0, y: 0, width: 60, height: 60 } })).toBeNull()
  })

  test('reports the space it takes, so the main figure keeps its letters clear of it', () => {
    const p = planDetailInset(base)
    expect(p.blocks.length).toBeGreaterThan(20)
  })
})
