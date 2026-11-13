import { describe, it, expect } from 'vitest'
import { orderEdgesNorthClockwise, orderVerticesNorthClockwise } from '../outsideFigureOrder'
import { buildEdgeTable } from '../ofdClipping'

// Cape Lo: Y = westing, X = southing. North = smaller X, east = smaller Y.
const NW = { y: 100, x: 100 }, NE = { y: 90, x: 100 }, SE = { y: 90, x: 110 }, SW = { y: 100, x: 110 }
const bearing = (a: any, b: any) => (((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI) + 360) % 360
const edgesOf = (ring: any[]) => ring.map((from, i) => {
  const to = ring[(i + 1) % ring.length]
  return { from, to, bearingDeg: bearing(from, to), distance: Math.hypot(to.y - from.y, to.x - from.x), directionDMS: 'orig' }
})
const dms = (b: number, d: number) => `dms(${b.toFixed(1)},${d.toFixed(1)})`
const startsOf = (edges: any[]) => edges.map((e) => `${e.from.y},${e.from.x}`)
const key = (p: any) => `${p.y},${p.x}`

describe('orderEdgesNorthClockwise', () => {
  it('rotates a clockwise figure to start at the northmost vertex, keeping each side as it was', () => {
    const edges = edgesOf([SE, SW, NW, NE])
    const out = orderEdgesNorthClockwise(edges, dms)
    expect(startsOf(out)).toEqual([NW, NE, SE, SW].map(key))
    expect(out[0].directionDMS).toBe('orig')
  })

  it('reverses a counter-clockwise figure: from/to swap, the bearing turns through 180 degrees and is restated', () => {
    const edges = edgesOf([NW, SW, SE, NE])
    const out = orderEdgesNorthClockwise(edges, dms)
    expect(startsOf(out)).toEqual([NW, NE, SE, SW].map(key))
    // every side still joins its own start to the next side's start, closing the ring
    out.forEach((e, i) => expect(key(e.to!)).toBe(key(out[(i + 1) % out.length].from!)))
    // the bearing is what the side's own coordinates give, in the new direction
    out.forEach((e) => {
      expect(e.bearingDeg).toBeCloseTo(bearing(e.from, e.to), 6)
      expect(e.directionDMS).toBe(dms(e.bearingDeg as number, e.distance as number))
    })
  })

  it('leaves edges without coordinates, and a figure of fewer than three sides, as they are', () => {
    const noCoords = [{ distance: 1 }, { distance: 2 }, { distance: 3 }] as any[]
    expect(orderEdgesNorthClockwise(noCoords, dms)).toBe(noCoords)
    const two = edgesOf([NW, NE])
    expect(orderEdgesNorthClockwise(two, dms)).toBe(two)
  })
})

describe('orderVerticesNorthClockwise', () => {
  it('orders [y, x] pairs the same way', () => {
    const v = [[100, 100], [100, 110], [90, 110], [90, 100]]   // NW SW SE NE: anticlockwise
    expect(orderVerticesNorthClockwise(v)).toEqual([[100, 100], [90, 100], [90, 110], [100, 110]])
  })
})

describe('buildEdgeTable states the sides from the northmost vertex, clockwise', () => {
  const vert = (p: any, name: string) => ({ id: name, pointId: name, y: p.y, x: p.x, type: 'survey' as const })
  it('whatever order the part was walked in', () => {
    const a = buildEdgeTable([vert(SE, 'SE'), vert(NE, 'NE'), vert(NW, 'NW'), vert(SW, 'SW')])   // anticlockwise
    expect(a.edges.map((e) => e.side)).toEqual(['NW-NE', 'NE-SE', 'SE-SW', 'SW-NW'])
    expect(a.constants.pointId).toBe('NW')
    const b = buildEdgeTable([vert(NW, 'NW'), vert(NE, 'NE'), vert(SE, 'SE'), vert(SW, 'SW')])
    expect(b.edges.map((e) => e.side)).toEqual(a.edges.map((e) => e.side))
  })
})
