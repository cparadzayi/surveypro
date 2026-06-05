/**
 * Unit tests for the DXF beacon placer.
 * Run with:  cd app-backend && npm run test -- dxfBeaconPlacer
 */
import { describe, test, expect } from '@jest/globals'
import {
  pickBeaconFontSize,
  computeBeaconRadius,
  createCollisionRegistry,
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
