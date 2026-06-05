/**
 * Unit tests for the DXF beacon placer.
 * Run with:  cd app-backend && npm run test -- dxfBeaconPlacer
 */
import { describe, test, expect } from '@jest/globals'
import {
  pickBeaconFontSize,
  computeBeaconRadius,
  createCollisionRegistry,
  groupSplayBeacons,
  orderSplayGroupByAngle,
} from '../dxfBeaconPlacer.js'

describe('pickBeaconFontSize — PDF tier switch', () => {
  test('scale 500 → 6 pt', () => {
    expect(pickBeaconFontSize(500)).toBe(6)
  })
  test('scale 1000 → 6.5 pt', () => {
    expect(pickBeaconFontSize(1000)).toBe(6.5)
  })
  test('scale 2000 → 7 pt', () => {
    expect(pickBeaconFontSize(2000)).toBe(7)
  })
  test('scale 5000 → 7.5 pt (catch-all)', () => {
    expect(pickBeaconFontSize(5000)).toBe(7.5)
  })
  test('boundary case scale 501 → 6.5 pt', () => {
    expect(pickBeaconFontSize(501)).toBe(6.5)
  })
})

describe('computeBeaconRadius — logarithmic with PDF clamp', () => {
  // Base case: at scale 500 → baseRadiusMM × 1.0 = 0.75 mm,
  // = 2.13 pt; not clamped, returns ~0.75 mm.
  test('scale 500 → ~0.75 mm', () => {
    const r = computeBeaconRadius(500)
    expect(r).toBeGreaterThan(0.74)
    expect(r).toBeLessThan(0.76)
  })
  test('monotone non-decreasing in scale', () => {
    const r500  = computeBeaconRadius(500)
    const r1000 = computeBeaconRadius(1000)
    const r5000 = computeBeaconRadius(5000)
    expect(r1000).toBeGreaterThanOrEqual(r500)
    expect(r5000).toBeGreaterThanOrEqual(r1000)
  })
  test('clamped at PDF 1.8-3.0 pt window', () => {
    // 1.8 pt ≈ 0.635 mm, 3.0 pt ≈ 1.058 mm.
    const huge = computeBeaconRadius(100000)
    expect(huge).toBeGreaterThanOrEqual(0.63)
    expect(huge).toBeLessThanOrEqual(1.06)
  })
})

describe('createCollisionRegistry', () => {
  test('empty registry: no collisions, size 0', () => {
    const r = createCollisionRegistry()
    expect(r.size).toBe(0)
    expect(r.hasCollision({ x: 0, y: 0, width: 10, height: 10 })).toBe(false)
  })
  test('add then check overlapping rect → true', () => {
    const r = createCollisionRegistry()
    r.add({ x: 0, y: 0, width: 10, height: 10 })
    expect(r.hasCollision({ x: 5, y: 5, width: 10, height: 10 })).toBe(true)
    expect(r.size).toBe(1)
  })
  test('add then check non-overlapping rect → false', () => {
    const r = createCollisionRegistry()
    r.add({ x: 0, y: 0, width: 10, height: 10 })
    expect(r.hasCollision({ x: 50, y: 50, width: 10, height: 10 })).toBe(false)
  })
  test('padding catches edge-touching rects; 0 padding does not', () => {
    const r = createCollisionRegistry()
    r.add({ x: 0, y: 0, width: 10, height: 10 })
    // Rect at (11, 0) — 1 unit gap. padding=1 catches it; padding=0 does not.
    expect(r.hasCollision({ x: 11, y: 0, width: 5, height: 5 }, 1)).toBe(true)
    expect(r.hasCollision({ x: 11, y: 0, width: 5, height: 5 }, 0)).toBe(false)
  })
  test('all returns shallow copy of stored rects', () => {
    const r = createCollisionRegistry()
    r.add({ x: 1, y: 1, width: 1, height: 1 })
    r.add({ x: 2, y: 2, width: 1, height: 1 })
    const snapshot = r.all
    expect(snapshot.length).toBe(2)
    snapshot.push({ x: 99, y: 99, width: 1, height: 1 })   // mutate the snapshot
    expect(r.size).toBe(2)                                  // original unchanged
  })
})

describe('groupSplayBeacons', () => {
  test('two beacons within proximity → both appear with each other in neighbor lists', () => {
    const positions = new Map([
      ['A', { x: 0, y: 0 }],
      ['B', { x: 5, y: 0 }],
    ])
    // proximityFloor = 10, beaconRadius = 1. Threshold = max(10, 6) = 10.
    // Distance A-B = 5 < 10 → close pair.
    const map = groupSplayBeacons(positions, 1, 10)
    expect(map.get('A')).toBeDefined()
    expect(map.get('B')).toBeDefined()
    expect(map.get('A').map(n => n.name)).toEqual(['B'])
    expect(map.get('B').map(n => n.name)).toEqual(['A'])
  })

  test('beacons farther than threshold are absent from the map', () => {
    const positions = new Map([
      ['A', { x: 0,    y: 0 }],
      ['B', { x: 1000, y: 0 }],
    ])
    const map = groupSplayBeacons(positions, 1, 10)
    expect(map.size).toBe(0)
  })

  test('proximityFloor wins when beaconRadius·6 is smaller', () => {
    // beaconRadius·6 = 6; proximityFloor = 10. Threshold = 10.
    // Pair at distance 8 is close.
    const positions = new Map([
      ['A', { x: 0, y: 0 }],
      ['B', { x: 8, y: 0 }],
    ])
    const map = groupSplayBeacons(positions, 1, 10)
    expect(map.size).toBe(2)
  })

  test('beaconRadius·6 wins when proximityFloor is smaller', () => {
    // beaconRadius·6 = 60; proximityFloor = 5. Threshold = 60.
    // Pair at distance 50 is close.
    const positions = new Map([
      ['A', { x: 0,  y: 0 }],
      ['B', { x: 50, y: 0 }],
    ])
    const map = groupSplayBeacons(positions, 10, 5)
    expect(map.size).toBe(2)
  })

  test('neighbor entries include distance + position for caller introspection', () => {
    const positions = new Map([
      ['A', { x: 0, y: 0 }],
      ['B', { x: 3, y: 4 }],   // distance 5
    ])
    const map = groupSplayBeacons(positions, 1, 10)
    const [neighbor] = map.get('A')
    expect(neighbor.name).toBe('B')
    expect(neighbor.distance).toBeCloseTo(5, 6)
    expect(neighbor.pos).toEqual({ x: 3, y: 4 })
  })
})

describe('orderSplayGroupByAngle', () => {
  test('three beacons around a centroid → clockwise from angle 0', () => {
    // Centroid of A(10,0), B(0,10), C(-10,0) is at (0, ~3.33).
    // Angles from centroid:
    //   A is at (10, -3.33) → atan2(-3.33, 10) ≈ -0.32 rad (right + down)
    //   B is at (0, 6.67)   → atan2(6.67, 0)   = π/2 ≈ 1.57 rad
    //   C is at (-10, -3.33) → atan2(-3.33, -10) ≈ -2.82 rad
    // Sorted ascending: C, A, B.
    const ordered = orderSplayGroupByAngle([
      { name: 'A', pos: { x:  10, y:  0 } },
      { name: 'B', pos: { x:   0, y: 10 } },
      { name: 'C', pos: { x: -10, y:  0 } },
    ])
    expect(ordered.map(m => m.name)).toEqual(['C', 'A', 'B'])
  })

  test('single-member group → unchanged', () => {
    const single = [{ name: 'X', pos: { x: 0, y: 0 } }]
    expect(orderSplayGroupByAngle(single)).toEqual(single)
  })

  test('empty group → empty result', () => {
    expect(orderSplayGroupByAngle([])).toEqual([])
  })
})
