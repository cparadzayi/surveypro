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
  placeSuffixLabelPOIDirected,
  tryTightFullBeaconLabelPosition,
  calculateFullBeaconLabelOutsideOnEdge,
} from '../dxfBeaconPlacer.js'
import { createCollisionRegistry as makeReg } from '../dxfBeaconPlacer.js'

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

describe('computeBeaconRadius — fixed legible paper size', () => {
  // Beacon radius is now a fixed legible PAPER size (mm), not the old 0.63-1.06 mm
  // clamp which rendered too small. At scale 500 → baseRadiusMM × 1.0 = 1.8 mm.
  test('scale 500 → ~1.8 mm', () => {
    const r = computeBeaconRadius(500)
    expect(r).toBeGreaterThan(1.79)
    expect(r).toBeLessThan(1.81)
  })
  test('monotone non-decreasing in scale', () => {
    const r500  = computeBeaconRadius(500)
    const r1000 = computeBeaconRadius(1000)
    const r5000 = computeBeaconRadius(5000)
    expect(r1000).toBeGreaterThanOrEqual(r500)
    expect(r5000).toBeGreaterThanOrEqual(r1000)
  })
  test('clamped to the 1.5-2.4 mm legible window', () => {
    const huge = computeBeaconRadius(100000)
    expect(huge).toBeGreaterThanOrEqual(1.5)
    expect(huge).toBeLessThanOrEqual(2.4)
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

describe('placeSuffixLabelPOIDirected', () => {
  // Standard 100×100 square parcel for most tests
  const square = [
    { x: 0,   y: 0   },
    { x: 100, y: 0   },
    { x: 100, y: 100 },
    { x: 0,   y: 100 },
  ]

  test('beacon at corner, no obstacles → position inside polygon, on interior bisector', () => {
    const result = placeSuffixLabelPOIDirected({
      beaconPos: { x: 0, y: 0 },   // SW corner
      polygon: square,
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1,
      registry: makeReg(),
    })
    // Label TOP-LEFT should be at cx-5, cy-3 where (cx, cy) is the center.
    // Center should be inside the square (and toward upper-right since SW corner's
    // bisector points NE into the parcel).
    const cx = result.x + 5
    const cy = result.y + 3
    expect(cx).toBeGreaterThan(0)
    expect(cy).toBeGreaterThan(0)
    expect(cx).toBeLessThan(100)
    expect(cy).toBeLessThan(100)
    // NE bias: both should be > 0 (interior direction from SW corner)
    expect(cx).toBeGreaterThan(1)
    expect(cy).toBeGreaterThan(1)
  })

  test('collision: registered label at primary POI position → returns alternative', () => {
    const reg = makeReg()
    // First placement
    const first = placeSuffixLabelPOIDirected({
      beaconPos: { x: 0, y: 0 },
      polygon: square,
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1,
      registry: reg,
    })
    reg.add({ x: first.x, y: first.y, width: 10, height: 6 })
    // Second placement should pick a different position (perturbation or
    // larger distance), still inside the polygon.
    const second = placeSuffixLabelPOIDirected({
      beaconPos: { x: 0, y: 0 },
      polygon: square,
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1,
      registry: reg,
    })
    const sameSpot = Math.abs(first.x - second.x) < 0.01 && Math.abs(first.y - second.y) < 0.01
    expect(sameSpot).toBe(false)
    // Second is still inside the polygon
    const cx2 = second.x + 5
    const cy2 = second.y + 3
    expect(cx2).toBeGreaterThan(0)
    expect(cy2).toBeGreaterThan(0)
    expect(cx2).toBeLessThan(100)
    expect(cy2).toBeLessThan(100)
  })

  test('degenerate polygon (<3 unique vertices) → centroid fallback', () => {
    // Two-vertex "polygon" — degenerate.
    const line = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
    const result = placeSuffixLabelPOIDirected({
      beaconPos: { x: 0, y: 0 },
      polygon: line,
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1,
      registry: makeReg(),
    })
    // Centroid of the two-point "polygon" = (50, 0). Label center = (50, 0),
    // top-left = (45, -3).
    expect(result.x).toBeCloseTo(45, 3)
    expect(result.y).toBeCloseTo(-3, 3)
  })
})

describe('tryTightFullBeaconLabelPosition', () => {
  test('beacon left of parcel, both candidates outside → returns right (first-iteration preference)', () => {
    const parcel = [
      { x:  0, y:  0 },
      { x: 50, y:  0 },
      { x: 50, y: 50 },
      { x:  0, y: 50 },
    ]
    // Beacon at (-15, 25): right candidate ends at x = -3.5 (still outside parcel
    // which starts at x=0); left candidate ends at x = -16.5 → -26.5 (also outside).
    // Both candidates pass — placer returns 'right' as the first iteration.
    const result = tryTightFullBeaconLabelPosition({
      beaconPos: { x: -15, y: 25 },
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1, padding: 0.5,
      incidentPolygons: [parcel],
      registry: createCollisionRegistry(),
    })
    expect(result).not.toBeNull()
    expect(result.position).toBe('right')
    // 'right' x = beacon.x + radius + padding = -15 + 1 + 0.5 = -13.5
    expect(result.x).toBeCloseTo(-13.5, 3)
    // y centered = beacon.y - h/2 = 25 - 3 = 22
    expect(result.y).toBeCloseTo(22, 3)
  })

  test('right candidate overlaps polygon → falls through to left', () => {
    const parcel = [
      { x:  0, y:  0 },
      { x: 50, y:  0 },
      { x: 50, y: 50 },
      { x:  0, y: 50 },
    ]
    // Beacon at (-5, 25): right candidate (x=-3.5 to 6.5) overlaps parcel left edge.
    // Left candidate (x=-16.5 to -6.5) is outside.
    const result = tryTightFullBeaconLabelPosition({
      beaconPos: { x: -5, y: 25 },
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1, padding: 0.5,
      incidentPolygons: [parcel],
      registry: createCollisionRegistry(),
    })
    expect(result).not.toBeNull()
    expect(result.position).toBe('left')
  })

  test('both sides blocked by registry → returns null', () => {
    const parcel = [
      { x:  0, y:  0 },
      { x: 50, y:  0 },
      { x: 50, y: 50 },
      { x:  0, y: 50 },
    ]
    const reg = createCollisionRegistry()
    // Block both right and left of beacon at (60, 25)
    reg.add({ x: 61, y: 22, width: 10, height: 6 })   // covers right candidate
    reg.add({ x: 49, y: 22, width: 10, height: 6 })   // covers left candidate
    const result = tryTightFullBeaconLabelPosition({
      beaconPos: { x: 60, y: 25 },
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 0.5, padding: 0.5,
      incidentPolygons: [parcel],
      registry: reg,
    })
    expect(result).toBeNull()
  })
})

describe('calculateFullBeaconLabelOutsideOnEdge', () => {
  test('beacon at center of top edge of a square → label sits outside (above) that edge', () => {
    const square = [
      { x:  0, y:  0 },
      { x: 50, y:  0 },
      { x: 50, y: 50 },
      { x:  0, y: 50 },
    ]
    const result = calculateFullBeaconLabelOutsideOnEdge({
      beaconPos: { x: 25, y: 50 },   // on top edge
      incidentPolygons: [square],
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1,
      registry: createCollisionRegistry(),
    })
    expect(result).not.toBeNull()
    // Outward normal of top edge (y=50) points in +y direction.
    // Center = foot + outwardNormal × (1 + 3 + 1) = (25, 50) + (0, 5) = (25, 55).
    // Top-left = (20, 52).
    const cx = result.x + 5
    const cy = result.y + 3
    expect(cx).toBeCloseTo(25, 3)
    expect(cy).toBeGreaterThan(50)
  })

  test('no incident polygons → null', () => {
    const result = calculateFullBeaconLabelOutsideOnEdge({
      beaconPos: { x: 0, y: 0 },
      incidentPolygons: [],
      labelWidth: 10, labelHeight: 6,
      beaconRadius: 1,
      registry: createCollisionRegistry(),
    })
    expect(result).toBeNull()
  })
})
