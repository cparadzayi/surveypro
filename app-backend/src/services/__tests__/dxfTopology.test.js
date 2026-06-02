/**
 * Layer 1 unit tests for the DXF topological whitespace scanner.
 * Run with:  cd app-backend && npm run test -- dxfTopology
 */
import { describe, test, expect } from '@jest/globals'
import { computePolygonProfile } from '../dxfTopology.js'

describe('computePolygonProfile', () => {
  test('empty polygon → all 4 dictionaries empty', () => {
    const result = computePolygonProfile([], 10)
    expect(result.rightAt).toEqual({})
    expect(result.leftAt).toEqual({})
    expect(result.bottomAt).toEqual({})
    expect(result.topAt).toEqual({})
  })

  test('single vertex (no edges) → all dictionaries empty', () => {
    const result = computePolygonProfile([{ x: 5, y: 5 }], 10)
    expect(result.rightAt).toEqual({})
    expect(result.leftAt).toEqual({})
    expect(result.bottomAt).toEqual({})
    expect(result.topAt).toEqual({})
  })

  test('axis-aligned closed 10×10 rectangle → rightAt[y]=10, leftAt[y]=0 for all sampled y', () => {
    // Vertices closed: (0,0),(10,0),(10,10),(0,10),(0,0)
    const square = [
      { x: 0,  y: 0  },
      { x: 10, y: 0  },
      { x: 10, y: 10 },
      { x: 0,  y: 10 },
      { x: 0,  y: 0  },
    ]
    const { rightAt, leftAt } = computePolygonProfile(square, 2)
    // Y values 0, 2, 4, 6, 8, 10 should all see rightAt = 10 and leftAt = 0
    for (const y of [0, 2, 4, 6, 8, 10]) {
      expect(rightAt[y]).toBe(10)
      expect(leftAt[y]).toBe(0)
    }
  })

  test('axis-aligned closed 10×10 rectangle → topAt[x]=0, bottomAt[x]=10 for all sampled x', () => {
    const square = [
      { x: 0,  y: 0  },
      { x: 10, y: 0  },
      { x: 10, y: 10 },
      { x: 0,  y: 10 },
      { x: 0,  y: 0  },
    ]
    const { topAt, bottomAt } = computePolygonProfile(square, 2)
    for (const x of [0, 2, 4, 6, 8, 10]) {
      expect(topAt[x]).toBe(0)
      expect(bottomAt[x]).toBe(10)
    }
  })

  test('diagonal edge — sampling interpolates correctly', () => {
    // Open 2-vertex "polygon" (just one edge from (0,0) to (10,10))
    const edge = [{ x: 0, y: 0 }, { x: 10, y: 10 }]
    const { rightAt, bottomAt } = computePolygonProfile(edge, 2)
    // At each sampled y in [0, 10], x = y (since y = x on the diagonal)
    for (const y of [0, 2, 4, 6, 8, 10]) {
      expect(rightAt[y]).toBe(y)
    }
    // At each sampled x in [0, 10], y = x
    for (const x of [0, 2, 4, 6, 8, 10]) {
      expect(bottomAt[x]).toBe(x)
    }
  })

  test('step alignment — keys are multiples of scanStep', () => {
    // Edge from y=3 to y=47, scanStep=10 → samples at y=10, 20, 30, 40
    const edge = [{ x: 5, y: 3 }, { x: 5, y: 47 }]
    const { rightAt } = computePolygonProfile(edge, 10)
    expect(Object.keys(rightAt).map(Number).sort((a, b) => a - b)).toEqual([10, 20, 30, 40])
  })

  test('open polygon — final edge from last vertex back to first is NOT iterated', () => {
    // Open square: 4 vertices, last does NOT repeat first.
    // Iterated edges: [0→1] bottom, [1→2] right, [2→3] top. (3 edges total.)
    // The MISSING closing edge is the LEFT side: (0,10) back to (0,0).
    // If the closing edge were iterated, leftAt[5] would be min(0, 10) = 0.
    // Since it's NOT iterated, only the right side (10,0)→(10,10) contributes to leftAt[5],
    // so leftAt[5] = 10. This is a sharp test — the result depends on whether
    // the closing edge is iterated.
    const openSquare = [
      { x: 0,  y: 0  },  // bottom-left
      { x: 10, y: 0  },  // bottom-right
      { x: 10, y: 10 },  // top-right
      { x: 0,  y: 10 },  // top-left (NOT followed by (0,0))
    ]
    const { leftAt } = computePolygonProfile(openSquare, 5)
    expect(leftAt[5]).toBe(10)
  })

  test('L-shape (concave) — rightAt varies with y, reflecting the notch', () => {
    // L-shape with notch in upper-right (open corner at x∈[10,20], y∈[5,15]):
    // Closed outline: (0,0),(20,0),(20,5),(10,5),(10,15),(0,15),(0,0)
    // At y=0..5 (lower arm), polygon's right edge is at x=20 (max edge contribution).
    // At y=5..15 (upper arm), polygon's right edge drops to x=10.
    const lShape = [
      { x: 0,  y: 0  },
      { x: 20, y: 0  },
      { x: 20, y: 5  },
      { x: 10, y: 5  },
      { x: 10, y: 15 },
      { x: 0,  y: 15 },
      { x: 0,  y: 0  },
    ]
    const { rightAt } = computePolygonProfile(lShape, 5)
    // Below the notch: edge (20,0)→(20,5) contributes x=20 at y=0,5
    expect(rightAt[0]).toBe(20)
    expect(rightAt[5]).toBe(20)
    // Above the notch: only edge (10,5)→(10,15) contributes x=10
    expect(rightAt[10]).toBe(10)
    expect(rightAt[15]).toBe(10)
  })

  test('two edges crossing the same y slice — rightAt takes the max', () => {
    // Two parallel vertical edges, one at x=5 and one at x=15, both crossing y=10
    const polygon = [
      { x: 5,  y: 0  },
      { x: 5,  y: 20 },
      { x: 15, y: 20 },
      { x: 15, y: 0  },
      { x: 5,  y: 0  },
    ]
    const { rightAt, leftAt } = computePolygonProfile(polygon, 10)
    // At y=10, both vertical edges contribute. rightAt = max(5, 15) = 15.
    expect(rightAt[10]).toBe(15)
    expect(leftAt[10]).toBe(5)
  })
})
