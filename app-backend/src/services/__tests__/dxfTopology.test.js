/**
 * Layer 1 unit tests for the DXF topological whitespace scanner.
 * Run with:  cd app-backend && npm run test -- dxfTopology
 */
import { describe, test, expect } from '@jest/globals'
import { computePolygonProfile, computeWhitespaceZones } from '../dxfTopology.js'

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

describe('computeWhitespaceZones', () => {
  // A standard 100×100 map bounds used by most tests.
  const mapBounds = { x: 0, y: 0, width: 100, height: 100 }

  test('empty polygon → returns one full-bounds zone with side="full"', () => {
    const result = computeWhitespaceZones({
      polygon: [], mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      x: 0, y: 0, width: 100, height: 100, side: 'full', area: 10000,
    })
  })

  test('null polygon → same full-bounds zone special case', () => {
    const result = computeWhitespaceZones({
      polygon: null, mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    expect(result).toHaveLength(1)
    expect(result[0].side).toBe('full')
  })

  test('polygon with < 3 vertices → full-bounds zone special case', () => {
    const result = computeWhitespaceZones({
      polygon: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    expect(result).toHaveLength(1)
    expect(result[0].side).toBe('full')
  })

  test('polygon flush against right edge → no right zone, but may produce other side zones', () => {
    // 100×100 polygon filling the entire mapBounds → no whitespace anywhere
    const fullPolygon = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 100 },
      { x: 0,   y: 100 },
      { x: 0,   y: 0   },
    ]
    const result = computeWhitespaceZones({
      polygon: fullPolygon, mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    // No zone with usable width on any side
    expect(result.filter(z => z.side === 'right')).toHaveLength(0)
    expect(result.filter(z => z.side === 'left')).toHaveLength(0)
  })

  test('polygon inset on the right → at least one right zone with width≈right margin', () => {
    // 40×100 polygon at left edge of 100×100 mapBounds → 60 units of right whitespace
    const polygon = [
      { x: 0,  y: 0   },
      { x: 40, y: 0   },
      { x: 40, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    const result = computeWhitespaceZones({
      polygon, mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    const rightZones = result.filter(z => z.side === 'right')
    expect(rightZones.length).toBeGreaterThanOrEqual(1)
    // The band should span the full y range and have width ≈ 60
    const biggestRight = rightZones.reduce((a, b) => a.area > b.area ? a : b)
    expect(biggestRight.width).toBeCloseTo(60, 0)
    expect(biggestRight.x).toBeCloseTo(40, 0)
  })

  test('L-shape with notch in upper-right → at least one right zone in the notch', () => {
    // Same L as the Task 1 test — notch at x∈[40,100], y∈[20,100]
    const lShape = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 20  },
      { x: 40,  y: 20  },
      { x: 40,  y: 100 },
      { x: 0,   y: 100 },
      { x: 0,   y: 0   },
    ]
    const result = computeWhitespaceZones({
      polygon: lShape, mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    const rightZones = result.filter(z => z.side === 'right')
    expect(rightZones.length).toBeGreaterThanOrEqual(1)
    // Notch zone: x ≈ 40, width ≈ 60
    const notchZone = rightZones.find(z => Math.abs(z.x - 40) < 1)
    expect(notchZone).toBeDefined()
    expect(notchZone.width).toBeCloseTo(60, 0)
  })

  test('tableMinWidth larger than any available band → returns empty array', () => {
    // 40×100 polygon at left → 60 units of right whitespace
    const polygon = [
      { x: 0,  y: 0   },
      { x: 40, y: 0   },
      { x: 40, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    const result = computeWhitespaceZones({
      polygon, mapBounds, buffer: 0, tableMinWidth: 999, scanStep: 5,
    })
    expect(result).toEqual([])
  })

  test('zones sorted by side preference (right, bottom, left, top), then area descending', () => {
    // Small polygon in the center leaves whitespace on multiple sides.
    // 20×20 polygon at (40, 40) inside a 100×100 mapBounds.
    const polygon = [
      { x: 40, y: 40 },
      { x: 60, y: 40 },
      { x: 60, y: 60 },
      { x: 40, y: 60 },
      { x: 40, y: 40 },
    ]
    const result = computeWhitespaceZones({
      polygon, mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    // All sides should produce at least one zone. Check sort: right < bottom < left < top by sideOrder.
    const sideOrder = { right: 0, bottom: 1, left: 2, top: 3 }
    for (let i = 1; i < result.length; i++) {
      const prev = sideOrder[result[i - 1].side]
      const curr = sideOrder[result[i].side]
      expect(prev).toBeLessThanOrEqual(curr)
      // Within same side, area descending
      if (prev === curr) {
        expect(result[i - 1].area).toBeGreaterThanOrEqual(result[i].area)
      }
    }
  })

  test('buffer parameter increases required clear distance', () => {
    // 80×100 polygon at left → 20 units of right whitespace.
    // The PDF requires zone width STRICTLY > tableMinWidth (the band-form
    // guard uses `rx + buffer >= mRight - tableMinWidth` to flush, so
    // equality at the boundary is rejected).
    const polygon = [
      { x: 0,  y: 0   },
      { x: 80, y: 0   },
      { x: 80, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    // At buffer=0, tableMinWidth=10 → avail=20, comfortably > 10 → zone fits
    const zonesNoBuf = computeWhitespaceZones({
      polygon, mapBounds, buffer: 0, tableMinWidth: 10, scanStep: 5,
    })
    expect(zonesNoBuf.filter(z => z.side === 'right').length).toBeGreaterThanOrEqual(1)
    // At buffer=15, available width drops to 5 < tableMinWidth=10 → no right zone
    const zonesWithBuf = computeWhitespaceZones({
      polygon, mapBounds, buffer: 15, tableMinWidth: 10, scanStep: 5,
    })
    expect(zonesWithBuf.filter(z => z.side === 'right')).toHaveLength(0)
  })

  test('bottom-strip height heuristic — narrow strips with height < tableMinWidth/2 are filtered', () => {
    // Polygon filling most of the height — bottom margin is only 5 units.
    // tableMinWidth = 20 → tableMinWidth/2 = 10 → bottom strip needs height ≥ 10.
    // With 5-unit margin, bottom strip should be filtered out.
    const polygon = [
      { x: 0,   y: 0  },
      { x: 100, y: 0  },
      { x: 100, y: 95 },
      { x: 0,   y: 95 },
      { x: 0,   y: 0  },
    ]
    const result = computeWhitespaceZones({
      polygon, mapBounds, buffer: 0, tableMinWidth: 20, scanStep: 5,
    })
    expect(result.filter(z => z.side === 'bottom')).toHaveLength(0)
  })
})
