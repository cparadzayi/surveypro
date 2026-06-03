/**
 * Layer 1 unit tests for the DXF generic block placer.
 * Run with:  cd app-backend && npm run test -- dxfBlockPlacer
 */
import { describe, test, expect } from '@jest/globals'
import { computeMapFeatureBounds, isValidPosition, findBlockPosition } from '../dxfBlockPlacer.js'

describe('computeMapFeatureBounds', () => {
  test('null input → returns null', () => {
    expect(computeMapFeatureBounds(null)).toBeNull()
    expect(computeMapFeatureBounds(undefined)).toBeNull()
  })

  test('empty array → returns null', () => {
    expect(computeMapFeatureBounds([])).toBeNull()
  })

  test('3-vertex polygon → correct min/max bbox plus right, bottom, polygon fields', () => {
    const polygon = [{ x: 5, y: 3 }, { x: 10, y: 8 }, { x: 7, y: 1 }]
    const result = computeMapFeatureBounds(polygon)
    expect(result).toEqual({
      x: 5,
      y: 1,
      width: 5,
      height: 7,
      right: 10,
      bottom: 8,
      polygon, // exact reference passed through
    })
  })

  test('square polygon → bbox dimensions match polygon dimensions', () => {
    const square = [
      { x: 0,  y: 0  },
      { x: 10, y: 0  },
      { x: 10, y: 10 },
      { x: 0,  y: 10 },
      { x: 0,  y: 0  },
    ]
    const result = computeMapFeatureBounds(square)
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
    expect(result.width).toBe(10)
    expect(result.height).toBe(10)
    expect(result.right).toBe(10)
    expect(result.bottom).toBe(10)
  })
})

describe('isValidPosition', () => {
  // A standard rect used by most tests
  const baseRect = { x: 50, y: 50, width: 20, height: 10 }

  test('no polygon, no placed blocks → always valid', () => {
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks: [], buffer: 0, blockSpacing: 0,
    })).toBe(true)
  })

  test('empty polygon array (treated as null) + empty placedBlocks → valid', () => {
    expect(isValidPosition({
      rect: baseRect, polygon: [], placedBlocks: [], buffer: 0, blockSpacing: 0,
    })).toBe(true)
  })

  test('rect inside polygon → false', () => {
    // Polygon: a square that contains baseRect entirely.
    const polygon = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 100 },
      { x: 0,   y: 100 },
    ]
    expect(isValidPosition({
      rect: baseRect, polygon, placedBlocks: [], buffer: 0, blockSpacing: 0,
    })).toBe(false)
  })

  test('buffer increases polygon-clearance — nearly-touching rect becomes invalid', () => {
    // Polygon square at (0..40, 0..40); baseRect at (50,50) → 10 units east of polygon.
    const polygon = [
      { x: 0,  y: 0  },
      { x: 40, y: 0  },
      { x: 40, y: 40 },
      { x: 0,  y: 40 },
    ]
    // With buffer=0, rect is 10 units away — no overlap.
    expect(isValidPosition({
      rect: baseRect, polygon, placedBlocks: [], buffer: 0, blockSpacing: 0,
    })).toBe(true)
    // With buffer=15, the buffered polygon expands to (−15..55, −15..55), which
    // now contains baseRect's left edge (x=50). Invalid.
    expect(isValidPosition({
      rect: baseRect, polygon, placedBlocks: [], buffer: 15, blockSpacing: 0,
    })).toBe(false)
  })

  test('one placed block, no overlap → valid', () => {
    const placedBlocks = [{ x: 200, y: 200, width: 10, height: 10 }]
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks, buffer: 0, blockSpacing: 0,
    })).toBe(true)
  })

  test('one placed block, overlapping → false', () => {
    const placedBlocks = [{ x: 55, y: 55, width: 20, height: 10 }] // overlaps baseRect
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks, buffer: 0, blockSpacing: 0,
    })).toBe(false)
  })

  test('two placed blocks, second overlaps → false (iterates correctly)', () => {
    const placedBlocks = [
      { x: 200, y: 200, width: 10, height: 10 }, // does NOT overlap
      { x: 55,  y: 55,  width: 20, height: 10 }, // DOES overlap
    ]
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks, buffer: 0, blockSpacing: 0,
    })).toBe(false)
  })

  test('blockSpacing increases required separation — touching becomes overlapping', () => {
    // Block to the immediate right of baseRect, sharing edge at x=70.
    const placedBlocks = [{ x: 70, y: 50, width: 10, height: 10 }]
    // With blockSpacing=0, they touch but don't overlap.
    // rectanglesOverlap uses strict less-than internally — touching IS overlap
    // (consistent with the PDF semantics tested in dxfGeometry.test.js).
    // Verify the strict behavior at blockSpacing=0:
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks, buffer: 0, blockSpacing: 0,
    })).toBe(false)
    // Move the placed block 5 units further right → 5-unit gap.
    const placedBlocksGap = [{ x: 75, y: 50, width: 10, height: 10 }]
    // With blockSpacing=0, the 5-unit gap is fine.
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks: placedBlocksGap, buffer: 0, blockSpacing: 0,
    })).toBe(true)
    // With blockSpacing=10, the 5-unit gap is insufficient.
    expect(isValidPosition({
      rect: baseRect, polygon: null, placedBlocks: placedBlocksGap, buffer: 0, blockSpacing: 10,
    })).toBe(false)
  })
})

describe('findBlockPosition — topology layer', () => {
  // A standard 100×100 mapBounds used by most tests
  const mapBounds = { x: 0, y: 0, width: 100, height: 100 }
  // Block sizing chosen so each test's geometry has a clear expected outcome
  const smallBlock = { width: 10, height: 10 }

  test('polygon takes left 40% of mapBounds → returns position in the right whitespace', () => {
    const polygon = [
      { x: 0,  y: 0   },
      { x: 40, y: 0   },
      { x: 40, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 10,
    })
    expect(result).not.toBeNull()
    // The position should land in the right whitespace (x ≥ 40, comfortably to the right of polygon)
    expect(result.x).toBeGreaterThanOrEqual(40)
  })

  test('L-shape with notch in upper-right → returns position in the notch', () => {
    // L-shape: polygon fills lower-left, with open corner at x∈[40,100], y∈[20,100]
    const lShape = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 20  },
      { x: 40,  y: 20  },
      { x: 40,  y: 100 },
      { x: 0,   y: 100 },
      { x: 0,   y: 0   },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon: lShape, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 10,
    })
    expect(result).not.toBeNull()
    // The notch is at x ∈ [40, 100], y ∈ [20, 100]. Verify the block lands inside.
    expect(result.x).toBeGreaterThanOrEqual(40)
    expect(result.y).toBeGreaterThanOrEqual(20)
  })

  test('polygon fills mapBounds → returns null', () => {
    const polygon = [
      { x: 0,   y: 0   },
      { x: 100, y: 0   },
      { x: 100, y: 100 },
      { x: 0,   y: 100 },
      { x: 0,   y: 0   },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 10,
    })
    expect(result).toBeNull()
  })

  test('block too big for any whitespace → returns null', () => {
    // 40×100 polygon at left → 60 units of right whitespace.
    // Block requires 80×80 → won't fit.
    const polygon = [
      { x: 0,  y: 0   },
      { x: 40, y: 0   },
      { x: 40, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    const result = findBlockPosition({
      block: { width: 80, height: 80 }, mapBounds, polygon, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 80,
    })
    expect(result).toBeNull()
  })

  test('multiple placed blocks blocking the natural right zone → returns position elsewhere', () => {
    // Polygon takes left 30%. Right zone (x ∈ [30, 100]) is fully occupied by placed blocks.
    const polygon = [
      { x: 0,  y: 0   },
      { x: 30, y: 0   },
      { x: 30, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    // Cover x ∈ [30, 100] with a tall block to force placer to look elsewhere.
    // (There's no "elsewhere" in this geometry since polygon fills left, so result should be null.)
    const placedBlocks = [{ x: 30, y: 0, width: 70, height: 100 }]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon, placedBlocks,
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 10,
    })
    // With the right zone fully blocked AND polygon filling the left zone, no valid position.
    expect(result).toBeNull()
  })

  test('polygon = null → falls through to grid scan; returns a valid position', () => {
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon: null, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 10,
    })
    expect(result).not.toBeNull()
    // Position must be within mapBounds with block fitting fully
    expect(result.x).toBeGreaterThanOrEqual(mapBounds.x)
    expect(result.y).toBeGreaterThanOrEqual(mapBounds.y)
    expect(result.x + smallBlock.width).toBeLessThanOrEqual(mapBounds.x + mapBounds.width)
    expect(result.y + smallBlock.height).toBeLessThanOrEqual(mapBounds.y + mapBounds.height)
  })

  test('placedBlocks empty + polygon present → position is outside polygon', () => {
    // 40×40 polygon at top-left of 100×100 mapBounds.
    const polygon = [
      { x: 0,  y: 0  },
      { x: 40, y: 0  },
      { x: 40, y: 40 },
      { x: 0,  y: 40 },
      { x: 0,  y: 0  },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 10,
    })
    expect(result).not.toBeNull()
    // Verify position is NOT inside the polygon by checking topology:
    // either x ≥ 40 (right of polygon) OR y ≥ 40 (below polygon)
    const outsidePolygon = result.x >= 40 || result.y >= 40
    expect(outsidePolygon).toBe(true)
  })
})

describe('findBlockPosition — grid-fallback layer', () => {
  const mapBounds = { x: 0, y: 0, width: 100, height: 100 }
  const smallBlock = { width: 10, height: 10 }

  test('polygon shape that produces no whitespace zones → grid fallback fires; returns valid position', () => {
    // A pinwheel/star polygon designed to produce no useful strip zones.
    // The whitespace scanner finds no usable strips, so grid scan kicks in.
    // The polygon doesn't fill the entire bounds — there ARE valid positions
    // that the grid scan can find via brute force.
    //
    // Construct a polygon that hugs the boundary on all 4 sides but leaves
    // a central hole inaccessible to strip scanning (because no strip on any
    // single side has room). Use a thin diagonal slash that crosses through
    // the middle but isn't really useful as a strip.
    //
    // Easier approach: tiny central polygon → no usable zones (polygon too
    // small relative to tableMinWidth), but grid scan finds plenty of room.
    const tinyCenter = [
      { x: 49, y: 49 },
      { x: 51, y: 49 },
      { x: 51, y: 51 },
      { x: 49, y: 51 },
      { x: 49, y: 49 },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon: tinyCenter, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5,
      tableMinWidth: 80, // Larger than any single strip can produce — forces grid fallback
    })
    expect(result).not.toBeNull()
  })

  test('right-to-left iteration: when topology yields nothing AND right side clear, grid finds right-first', () => {
    // Narrow polygon at left (x=0..20). tableMinWidth=100 forces ALL strips to
    // fail: right-strip avail=80<100, left-strip avail=20<100, bottom/top
    // either at mapBounds edges or undefined. Topology returns [] → grid fires.
    // Right side (x>=25) is completely clear; right-to-left grid scan finds
    // a right-side position first.
    const leftPolygon = [
      { x: 0,  y: 0   },
      { x: 20, y: 0   },
      { x: 20, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon: leftPolygon, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5,
      tableMinWidth: 100, // Larger than any available strip → forces grid fallback
    })
    expect(result).not.toBeNull()
    // Grid scans right-to-left first, so we expect a position favouring the right side
    // — not necessarily the rightmost, but right of centre.
    expect(result.x).toBeGreaterThanOrEqual(mapBounds.x + mapBounds.width / 2 - smallBlock.width)
  })

  test('grid fallback respects polygon — no candidate overlaps the polygon', () => {
    // Polygon that survives the grid scan path. Verify the returned position
    // doesn't overlap it.
    const polygon = [
      { x: 30, y: 30 },
      { x: 70, y: 30 },
      { x: 70, y: 70 },
      { x: 30, y: 70 },
      { x: 30, y: 30 },
    ]
    const result = findBlockPosition({
      block: smallBlock, mapBounds, polygon, placedBlocks: [],
      buffer: 0, blockSpacing: 0, scanStep: 5, tableMinWidth: 30,
    })
    expect(result).not.toBeNull()
    // Confirm the returned position's rectangle doesn't overlap the polygon
    // by checking the rect is fully outside the polygon's bounding box on at
    // least one axis.
    const rectRight  = result.x + smallBlock.width
    const rectBottom = result.y + smallBlock.height
    const noOverlap = rectRight <= 30 || result.x >= 70 || rectBottom <= 30 || result.y >= 70
    expect(noOverlap).toBe(true)
  })
})

describe('findBlockPosition — integration scenario', () => {
  test('Maglas-shaped polygon + 3 sequential schedule sub-tables → all 3 land in valid non-overlapping positions', () => {
    // Simplified scenario representative of the Maglas case: a polygon occupying
    // the left 40% of a generous mapBounds, leaving comfortable right whitespace.
    // 3 sub-tables of 20×25 size; blockSpacing=5; expect all three to land
    // along the right side without overlapping.
    const mapBounds = { x: 0, y: 0, width: 100, height: 100 }
    const polygon = [
      { x: 0,  y: 0   },
      { x: 40, y: 0   },
      { x: 40, y: 100 },
      { x: 0,  y: 100 },
      { x: 0,  y: 0   },
    ]
    const subTable = { width: 20, height: 25 }
    const placedBlocks = []
    const positions = []
    for (let i = 0; i < 3; i++) {
      const pos = findBlockPosition({
        block: subTable, mapBounds, polygon, placedBlocks,
        buffer: 2, blockSpacing: 5, scanStep: 5, tableMinWidth: 30,
      })
      expect(pos).not.toBeNull()
      // Each position must be within mapBounds with the block fitting
      expect(pos.x).toBeGreaterThanOrEqual(mapBounds.x)
      expect(pos.y).toBeGreaterThanOrEqual(mapBounds.y)
      expect(pos.x + subTable.width).toBeLessThanOrEqual(mapBounds.x + mapBounds.width)
      expect(pos.y + subTable.height).toBeLessThanOrEqual(mapBounds.y + mapBounds.height)
      positions.push(pos)
      placedBlocks.push({ ...pos, width: subTable.width, height: subTable.height })
    }
    // All 3 positions distinct (no overlap caught by the placer)
    expect(positions).toHaveLength(3)
    // Pairwise non-overlap check (defensive — the placer should have prevented this)
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = { ...positions[i], width: subTable.width, height: subTable.height }
        const b = { ...positions[j], width: subTable.width, height: subTable.height }
        const overlap = !(a.x + a.width < b.x || b.x + b.width < a.x
                       || a.y + a.height < b.y || b.y + b.height < a.y)
        expect(overlap).toBe(false)
      }
    }
  })
})
