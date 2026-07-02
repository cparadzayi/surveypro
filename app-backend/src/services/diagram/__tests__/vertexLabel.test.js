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

  test('steps further out to avoid a colliding line segment', () => {
    const vertex = { px: 100, py: 40 }
    const blocker = [{ px: 60, py: 28 }, { px: 140, py: 28 }] // horizontal line above the vertex
    const clear = placeVertexLabel(vertex, centroid, { beaconR: 3, labelW: 6, labelH: 8, gap: 2, segments: [] })
    const avoided = placeVertexLabel(vertex, centroid, {
      beaconR: 3, labelW: 6, labelH: 8, gap: 2, segments: [blocker], step: 4, maxSteps: 12,
    })
    // The blocker forces the label further up (smaller y) than the unobstructed placement.
    expect(avoided.y).toBeLessThan(clear.y)
  })
})
