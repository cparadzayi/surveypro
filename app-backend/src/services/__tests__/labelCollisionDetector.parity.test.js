import { describe, test, expect } from '@jest/globals'
import { LabelCollisionDetector } from '../pdfkitGeoPDF.js'
import { boxesIntersect } from '../../utils/collisionPrimitives.js'

/**
 * hasCollision() answers from a grid of regions whose edges were worked out once, when they were added.
 * It must say exactly what the plain question says: does the probe (grown by its padding) overlap any
 * registered region, touching included. Checked against asking that of every region, on small labels,
 * regions big enough to bypass the grid, touching edges and the paddings the renderer uses.
 */
function rng(seed) { let t = seed; return () => ((t = (t * 1664525 + 1013904223) % 4294967296) / 4294967296) }

describe('LabelCollisionDetector.hasCollision agrees with testing every registered region', () => {
  test.each([1, 2, 3, 4, 5, 6])('seed %i', (seed) => {
    const rnd = rng(seed * 977)
    const det = new LabelCollisionDetector()
    const q = (v) => Math.round(v * 4) / 4        // quarter points: edges land exactly on each other often
    for (let i = 0; i < 400; i++) {
      const big = rnd() < 0.03
      det.addRegion(q(rnd() * 600), q(rnd() * 400), big ? 400 + rnd() * 400 : q(2 + rnd() * 40), big ? 300 + rnd() * 300 : q(2 + rnd() * 12), [0, 1, 2, 3][Math.floor(rnd() * 4)])
    }
    let hits = 0, misses = 0
    for (let i = 0; i < 3000; i++) {
      const x = q(rnd() * 640 - 20), y = q(rnd() * 440 - 20), w = q(1 + rnd() * 30), h = q(1 + rnd() * 10)
      const padding = [0, 1, 2, 2, 3][Math.floor(rnd() * 5)]
      const probe = { x: x - padding, y: y - padding, width: w + padding * 2, height: h + padding * 2 }
      const expected = det.occupiedRegions.some((r) => boxesIntersect(probe, r, 0))
      expect(det.hasCollision(x, y, w, h, padding)).toBe(expected)
      if (expected) hits++; else misses++
    }
    expect(hits).toBeGreaterThan(100)
    expect(misses).toBeGreaterThan(100)
  })

  test('regions that touch collide; regions a hair apart do not', () => {
    const det = new LabelCollisionDetector()
    det.addRegion(10, 10, 10, 10, 0)                 // occupies [10,20] x [10,20]
    expect(det.hasCollision(20, 10, 5, 5, 0)).toBe(true)        // shares the edge x = 20
    expect(det.hasCollision(20.001, 10, 5, 5, 0)).toBe(false)
    expect(det.hasCollision(20.5, 10, 5, 5, 1)).toBe(true)      // padding closes the gap
  })
})
