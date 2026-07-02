import { describe, test, expect } from '@jest/globals'
import {
  bufferRing, clipRingToPolygon, ringExtent, isOutsideFigureFeature, polygonArea,
  neighbourBoundaryEdges,
} from '../neighbourBuffer.js'

// 100 m subject square, stored [Southing, Westing] (the DB order); normalized to
// [Y=Westing, X=Southing]: Westing 85000..85100, Southing 2144000..2144100.
const subjectRing = [
  [2144000, 85000], [2144100, 85000], [2144100, 85100], [2144000, 85100], [2144000, 85000],
]

describe('bufferRing', () => {
  test('offsets the subject outward ~10 m on every side', () => {
    const buf = bufferRing(subjectRing, 10)
    expect(buf.length).toBeGreaterThan(0)
    const e = ringExtent(buf)
    expect(Math.abs(e.minY - 84990)).toBeLessThan(1)
    expect(Math.abs(e.maxY - 85110)).toBeLessThan(1)
    expect(Math.abs(e.minX - 2143990)).toBeLessThan(1)
    expect(Math.abs(e.maxX - 2144110)).toBeLessThan(1)
  })
  test('returns [] for a degenerate ring', () => {
    expect(bufferRing([[2144000, 85000], [2144100, 85000]], 10)).toEqual([])
  })
})

describe('clipRingToPolygon', () => {
  const buf = bufferRing(subjectRing, 10)

  test('an abutting neighbour clips to a strip inside the buffer bbox', () => {
    // Neighbour abutting the subject on its Westing=85100 side, extending away.
    const abutting = [
      [2144000, 85100], [2144200, 85100], [2144200, 85500], [2144000, 85500], [2144000, 85100],
    ]
    const strips = clipRingToPolygon(abutting, buf)
    expect(strips.length).toBeGreaterThan(0)
    const se = ringExtent(strips)
    const be = ringExtent(buf)
    expect(se.minY).toBeGreaterThanOrEqual(be.minY - 1)
    expect(se.maxY).toBeLessThanOrEqual(be.maxY + 1)
    expect(se.minX).toBeGreaterThanOrEqual(be.minX - 1)
    expect(se.maxX).toBeLessThanOrEqual(be.maxX + 1)
  })

  test('a far neighbour clips to nothing', () => {
    const far = [
      [2144000, 90000], [2144100, 90000], [2144100, 90100], [2144000, 90100], [2144000, 90000],
    ]
    expect(clipRingToPolygon(far, buf)).toEqual([])
  })
})

describe('neighbourBoundaryEdges', () => {
  const buf = bufferRing(subjectRing, 10)
  // Neighbour abutting the subject on its Westing=85100 side, extending east/south
  // beyond the buffer. Its real edges within the buffer are on Westing=85100 and
  // Southing=2144000; the strip's outer edges lie on the buffer (clip) boundary.
  const abutting = [
    [2144000, 85100], [2144200, 85100], [2144200, 85500], [2144000, 85500], [2144000, 85100],
  ]
  const strip = clipRingToPolygon(abutting, buf)[0]

  test('returns only edges lying on the original neighbour boundary', () => {
    const edges = neighbourBoundaryEdges(strip, abutting)
    expect(edges.length).toBeGreaterThan(0)
    // The buffer-cut edges are excluded, so not every strip edge is returned.
    expect(edges.length).toBeLessThan(strip.length)
    // Every kept edge's midpoint sits on a real neighbour edge (Westing 85100 or Southing 2144000).
    for (const [a, b] of edges) {
      const midY = (a[0] + b[0]) / 2
      const midX = (a[1] + b[1]) / 2
      const onWest = Math.abs(midY - 85100) < 0.1
      const onSouth = Math.abs(midX - 2144000) < 0.1
      expect(onWest || onSouth).toBe(true)
    }
  })

  test('excludes the buffer-boundary (clip) edges near Westing 85110 / Southing 2144110', () => {
    const edges = neighbourBoundaryEdges(strip, abutting)
    for (const [a, b] of edges) {
      const midY = (a[0] + b[0]) / 2
      const midX = (a[1] + b[1]) / 2
      expect(Math.abs(midY - 85110) < 0.1 && midX > 2144000 && midX < 2144110).toBe(false)
    }
  })
})

describe('polygonArea', () => {
  test('computes the absolute area of a 100 m square', () => {
    expect(polygonArea([[0, 0], [0, 100], [100, 100], [100, 0]])).toBeCloseTo(10000, 6)
  })
})

describe('isOutsideFigureFeature', () => {
  test('detects the OUTSIDE FIGURE parcel by designation/stand/flag', () => {
    expect(isOutsideFigureFeature({ properties: { designation: 'OUTSIDE FIGURE' } })).toBe(true)
    expect(isOutsideFigureFeature({ properties: { stand: 'OF' } })).toBe(true)
    expect(isOutsideFigureFeature({ properties: { metadata: { is_outside_figure: true } } })).toBe(true)
  })
  test('a normal stand is not the outside figure', () => {
    expect(isOutsideFigureFeature({ properties: { stand: '404', designation: 'Stand 404' } })).toBe(false)
  })
})
