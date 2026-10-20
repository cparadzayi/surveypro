import { describe, test, expect } from '@jest/globals'
import { buildPolygonForPlanner, buildPlannerObstacles } from '../polygonForPlanner.js'

// Cape Lo is Y-westing / X-southing. Both renderers draw north-up, east-right
// (PDF transformCoords: easting = -y, northing = -x; DXF capeLoToDxfSouthUp:
// x = -capeY, y = -capeX). The planner polygon is what blocks are seated around,
// so it has to be that same figure -- not its 180-degree rotation. Every fixture
// was a rectangle or a symmetric grid, which is its own rotation, so this went
// unnoticed until an irregular figure (fcmag3) made the planner and the drawn
// figure disagree. An L-shape has no such symmetry.
describe('planner polygon orientation', () => {
  // [capeY (westing), capeX (southing)] -- an L: wide base to the south, a
  // narrow arm to the north.
  const ring = [
    [1000, 5100], [1100, 5100], [1100, 5000], [1050, 5000], [1050, 5050], [1000, 5050], [1000, 5100],
  ]
  const outsideFigure = { geometry: { type: 'Polygon', coordinates: [ring] } }
  const mapBounds = { x: 0, y: 0, width: 4000, height: 4000 }
  const args = { outsideFigure, scaleDenom: 1000, mapBounds, alignX: 'left' }

  const pts = buildPolygonForPlanner(args)
  const at = (cy, cx) => pts[ring.findIndex(([y, x]) => y === cy && x === cx)]

  test('east is to the right: smaller westing -> larger x', () => {
    expect(at(1000, 5100).x).toBeGreaterThan(at(1100, 5100).x)
  })

  test('north is up: smaller southing -> smaller y (y grows downward)', () => {
    expect(at(1100, 5000).y).toBeLessThan(at(1100, 5100).y)
  })

  test('the narrow arm points up the page, the wide base is at the bottom', () => {
    // North-most corners are the arm tip (westing 1050..1100, southing 5000).
    const armTipY = at(1100, 5000).y
    const baseY = at(1100, 5100).y
    expect(armTipY).toBeLessThan(baseY)
    // The arm only spans half the width: its top corners are 50 m apart, the base 100 m.
    const armW = Math.abs(at(1100, 5000).x - at(1050, 5000).x)
    const baseW = Math.abs(at(1100, 5100).x - at(1000, 5100).x)
    expect(armW).toBeLessThan(baseW)
  })

  test('parcel segments use the same projection as the polygon', () => {
    const parcels = { features: [{ geometry: { type: 'Polygon', coordinates: [ring] } }] }
    const { polyPts, parcelSegments } = buildPlannerObstacles({ ...args, parcels })
    expect(parcelSegments[0].x1).toBeCloseTo(polyPts[0].x, 6)
    expect(parcelSegments[0].y1).toBeCloseTo(polyPts[0].y, 6)
  })
})

describe('planner polygon vertical placement', () => {
  const ring = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]
  const outsideFigure = { geometry: { type: 'Polygon', coordinates: [ring] } }
  const mapBounds = { x: 0, y: 50, width: 4000, height: 4000 }
  const top = (figureTop) => {
    const p = buildPolygonForPlanner({ outsideFigure, scaleDenom: 1000, mapBounds, figureTop })
    return Math.min(...p.map((q) => q.y)) - mapBounds.y
  }

  test('is centred when the format gives no rule', () => {
    const h = 100 * (1000 / 1000) * (72 / 25.4)          // 100 m at 1:1000, in pt
    expect(top(undefined)).toBeCloseTo((mapBounds.height - h) / 2, 6)
  })

  test('uses the format rule, e.g. centred below a title band', () => {
    const band = 300
    const h = 100 * (72 / 25.4)
    const t = top((polyH) => band + (mapBounds.height - band - polyH) / 2)
    expect(t).toBeCloseTo(band + (mapBounds.height - band - h) / 2, 6)
    expect(t).toBeGreaterThan((mapBounds.height - h) / 2)       // lower than plain centring
  })
})

describe('planner polygon clearance from the margin', () => {
  const ring = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]
  const outsideFigure = { geometry: { type: 'Polygon', coordinates: [ring] } }
  const mapBounds = { x: 142, y: 142, width: 4000, height: 4000 }
  const minX = (opts) => Math.min(...buildPolygonForPlanner({
    outsideFigure, scaleDenom: 1000, mapBounds, ...opts }).map((q) => q.x))

  test("a 'left'-aligned figure sits the clearance in from the margin, not on it", () => {
    expect(minX({ alignX: 'left' })).toBeCloseTo(mapBounds.x, 6)                    // flush (old)
    expect(minX({ alignX: 'left', insetLeftPt: 28 })).toBeCloseTo(mapBounds.x + 28, 6)
  })

  test('centring is symmetric, so the clearance leaves a centred figure where it was', () => {
    expect(minX({ alignX: 'center', insetLeftPt: 28 })).toBeCloseTo(minX({ alignX: 'center' }), 6)
  })
})
