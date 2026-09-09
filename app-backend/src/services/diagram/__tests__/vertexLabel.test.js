import { describe, test, expect } from '@jest/globals'
import { placeVertexLabel } from '../vertexLabel.js'

const centroid = { px: 100, py: 100 }

describe('placeVertexLabel', () => {
  test('places the label outward (away from centroid), clear of the beacon circle', () => {
    const vertex = { px: 100, py: 40 } // directly above the centroid
    const r = placeVertexLabel(vertex, centroid, { beaconR: 3, labelW: 6, labelH: 8, gap: 2 })
    // Outward is straight up → the label box sits above the vertex.
    expect(r.y + 8).toBeLessThanOrEqual(vertex.py) // whole box above the vertex
    // Horizontally centred on the vertex.
    expect(Math.abs((r.x + 3) - vertex.px)).toBeLessThan(1)
    // Nearest box edge clears the circle (beaconR + gap).
    const boxBottom = r.y + 8
    expect(vertex.py - boxBottom).toBeGreaterThanOrEqual(3 + 2 - 0.01)
  })

  test('a vertex left of centroid pushes the label further left', () => {
    const vertex = { px: 40, py: 100 }
    const r = placeVertexLabel(vertex, centroid, { beaconR: 3, labelW: 6, labelH: 8, gap: 2 })
    expect(r.x + 6).toBeLessThan(vertex.px) // whole box left of the vertex
  })

  // A letter has to read as belonging to ONE beacon, so the search tries every
  // bearing at a given distance before any bearing further out. Setting
  // fanCount to 1 leaves only the straight-out bearing, which is exactly the
  // old radial-only search -- so these compare the new behaviour against the
  // behaviour it replaced, rather than against numbers copied out of a run.
  const dist = (r, v, w = 6, h = 8) => Math.hypot(r.x + w / 2 - v.px, r.y + h / 2 - v.py)
  const boxOf = (r, w = 6, h = 8) => ({ x: r.x, y: r.y, w, h })
  const crosses = ([p, q], b) => {
    const inside = (pt) => pt.px >= b.x && pt.px <= b.x + b.w && pt.py >= b.y && pt.py <= b.y + b.h
    if (inside(p) || inside(q)) return true
    const ss = (p1, p2, p3, p4) => {
      const d = (p2.px - p1.px) * (p4.py - p3.py) - (p2.py - p1.py) * (p4.px - p3.px)
      if (d === 0) return false
      const t = ((p3.px - p1.px) * (p4.py - p3.py) - (p3.py - p1.py) * (p4.px - p3.px)) / d
      const u = ((p3.px - p1.px) * (p2.py - p1.py) - (p3.py - p1.py) * (p2.px - p1.px)) / d
      return t >= 0 && t <= 1 && u >= 0 && u <= 1
    }
    const c1 = { px: b.x, py: b.y }, c2 = { px: b.x + b.w, py: b.y }
    const c3 = { px: b.x + b.w, py: b.y + b.h }, c4 = { px: b.x, py: b.y + b.h }
    return ss(p, q, c1, c2) || ss(p, q, c2, c3) || ss(p, q, c3, c4) || ss(p, q, c4, c1)
  }
  const opts = { beaconR: 3, labelW: 6, labelH: 8, gap: 2, step: 4, maxSteps: 12 }

  test('steps aside rather than away, staying nearer its beacon', () => {
    const vertex = { px: 100, py: 40 }
    const blocker = [{ px: 60, py: 28 }, { px: 140, py: 28 }] // across the outward path
    const fanned = placeVertexLabel(vertex, centroid, { ...opts, segments: [blocker] })
    const radial = placeVertexLabel(vertex, centroid, { ...opts, segments: [blocker], fanCount: 1 })
    // Both get clear of the blocker; the fanned one does it without retreating.
    expect(crosses(blocker, boxOf(fanned))).toBe(false)
    expect(dist(fanned, vertex)).toBeLessThan(dist(radial, vertex))
  })

  test('does not leave the letter sitting on the obstacle', () => {
    // The old search marched through every candidate and then returned the
    // FIRST one, obstacle and all -- which is how letters came to sit on the
    // road shading. Anything clear anywhere in the fan must beat that.
    const vertex = { px: 100, py: 40 }
    const blocker = [{ px: 60, py: 28 }, { px: 140, py: 28 }]
    const r = placeVertexLabel(vertex, centroid, { ...opts, segments: [blocker] })
    expect(crosses(blocker, boxOf(r))).toBe(false)
  })

  test('keeps the letter outside the figure, never swinging inboard', () => {
    // Held to the outward half-plane: a letter inside the figure would read as
    // belonging to the parcel rather than to its corner.
    const vertex = { px: 100, py: 40 }
    const wall = [{ px: 60, py: 30 }, { px: 140, py: 30 }]
    const r = placeVertexLabel(vertex, centroid, { ...opts, segments: [wall] })
    const outX = (vertex.px - centroid.px), outY = (vertex.py - centroid.py)
    const dx = (r.x + 3) - vertex.px, dy = (r.y + 4) - vertex.py
    expect(dx * outX + dy * outY).toBeGreaterThan(0)
  })

  test('holds the same clearance whichever way the letter is thrown', () => {
    // The reach is measured along the bearing actually used, so a letter placed
    // sideways is not shoved out as far as a letter placed upright would need.
    const sideways = placeVertexLabel({ px: 160, py: 100 }, centroid, opts)
    const upright = placeVertexLabel({ px: 100, py: 40 }, centroid, opts)
    const gapOf = (r, v) => dist(r, v) - (3 + 2)
    expect(gapOf(sideways, { px: 160, py: 100 })).toBeCloseTo(3, 5)   // labelW / 2
    expect(gapOf(upright, { px: 100, py: 40 })).toBeCloseTo(4, 5)     // labelH / 2
  })

  test('boxed in on every side, it returns the least obstructed box', () => {
    // Nothing is clear, so something has to give; it gives up the least.
    const vertex = { px: 100, py: 40 }
    const cage = [
      [{ px: 60, py: 28 }, { px: 140, py: 28 }],
      [{ px: 60, py: 20 }, { px: 140, py: 20 }],
      [{ px: 88, py: 60 }, { px: 88, py: 0 }],
      [{ px: 112, py: 60 }, { px: 112, py: 0 }],
    ]
    const r = placeVertexLabel(vertex, centroid, { ...opts, segments: cage })
    expect(Number.isFinite(r.x)).toBe(true)
    expect(Number.isFinite(r.y)).toBe(true)
    const n = cage.filter((seg) => crosses(seg, boxOf(r))).length
    expect(n).toBeLessThan(cage.length)
  })
})
