import { describe, test, expect } from '@jest/globals'
import { findLabelSpot, rectClearance } from '../standLabelSpot.js'

// Stand 1720 of the Maglas General Plan at 1:500, in points: a chevron whose centroid
// (390, 266) falls in the notch of the V, beside a vertex.
const CHEVRON = [[521,456],[331,341],[214,415],[190,410],[162,428],[75,527],[29,522],[0,517],[25,485],[53,450],[78,406],[101,366],[34,327],[140,101],[257,180],[324,220],[397,264],[447,176],[509,55],[563,93],[571,124],[610,148],[645,89],[702,0],[792,53],[552,448]].map(([x, y]) => ({ x, y }))
const CENTROID = { x: 390.28, y: 266.13 }
const SQUARE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]

describe('findLabelSpot', () => {
  test('keeps the centroid when the label already stands clear of every edge', () => {
    const r = findLabelSpot({ polygon: SQUARE, width: 30, height: 12, anchor: { x: 50, y: 50 }, minClearance: 2 })
    expect(r).toMatchObject({ x: 50, y: 50 })
  })

  test('a chevron whose centroid is in the notch gets a spot wholly inside, clear of every line', () => {
    const w = 32, h = 14
    expect(rectClearance(CHEVRON, CENTROID.x, CENTROID.y, w, h)).toBeLessThan(1.5)   // the centroid is no place for it
    const r = findLabelSpot({ polygon: CHEVRON, width: w, height: h, anchor: CENTROID, minClearance: 1.5, maxClearance: 8 })
    expect(r).not.toBeNull()
    expect(rectClearance(CHEVRON, r.x, r.y, w, h)).toBeGreaterThanOrEqual(1.5)
    expect(r.clearance).toBeGreaterThanOrEqual(6)
  })

  test('a label an edge cuts across is refused even when all four corners are inside', () => {
    // a U: both arms are inside, the label is placed across the gap between them
    const U = [[0, 0], [30, 0], [30, 60], [70, 60], [70, 0], [100, 0], [100, 100], [0, 100]].map(([x, y]) => ({ x, y }))
    expect(rectClearance(U, 50, 30, 80, 10)).toBe(-1)
  })

  test('returns null when the rectangle fits nowhere', () => {
    expect(findLabelSpot({ polygon: SQUARE, width: 150, height: 12 })).toBeNull()
  })

  test('is quick enough to run per stand', () => {
    const t = Date.now()
    findLabelSpot({ polygon: CHEVRON, width: 40, height: 18, anchor: CENTROID, minClearance: 1.5, maxClearance: 8 })
    expect(Date.now() - t).toBeLessThan(1500)
  })
})
