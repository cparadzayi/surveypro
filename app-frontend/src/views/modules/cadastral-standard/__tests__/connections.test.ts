import { describe, it, expect } from 'vitest'
import {
  bearingSouthBetween, distanceBetween, makeConnection, upsertConnection,
  removeConnection, formatBearingDMS, normalizeBearingSouth, toLoPoint,
  vertexBeaconNames, type LoPoint,
} from '../connections'

const pts = new Map<string, LoPoint>([
  ['1B', { Y: -6084.19, X: 2144366.52 }],
  ['62Ax', { Y: -5951.24, X: 2144402.58 }],
  ['SAME', { Y: -6084.19, X: 2144366.52 }],
])

describe('bearingSouthBetween', () => {
  it('reads 0 due South and 90 due West, as the sides table does', () => {
    // South-oriented: 0 = South (increasing Southing), 90 = West (increasing
    // Westing). The same convention as the DIRECTIONS column on the sheet, so a
    // connection and a side cannot be read against different norths.
    const o = { Y: 0, X: 0 }
    expect(bearingSouthBetween(o, { Y: 0, X: 100 })).toBeCloseTo(0, 9)
    expect(bearingSouthBetween(o, { Y: 100, X: 0 })).toBeCloseTo(90, 9)
    expect(bearingSouthBetween(o, { Y: 0, X: -100 })).toBeCloseTo(180, 9)
    expect(bearingSouthBetween(o, { Y: -100, X: 0 })).toBeCloseTo(270, 9)
  })

  it('never reports a negative bearing', () => {
    const b = bearingSouthBetween({ Y: 0, X: 0 }, { Y: -1, X: 1 })
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(360)
  })

  it('normalises anything handed to it', () => {
    expect(normalizeBearingSouth(-90)).toBeCloseTo(270, 9)
    expect(normalizeBearingSouth(450)).toBeCloseTo(90, 9)
  })
})

describe('distanceBetween', () => {
  it('is plain planar distance — Lo coordinates are already metric', () => {
    expect(distanceBetween({ Y: 0, X: 0 }, { Y: 3, X: 4 })).toBeCloseTo(5, 12)
  })
})

describe('makeConnection', () => {
  it('computes the distance rather than taking it on trust', () => {
    const c = makeConnection('1B', '62Ax', pts)!
    const expected = Math.hypot(-5951.24 - -6084.19, 2144402.58 - 2144366.52)
    expect(c.distanceM).toBeCloseTo(expected, 9)
    expect(c.fromBeacon).toBe('1B')
    expect(c.toBeacon).toBe('62Ax')
  })

  it('records the bearing in the sheet’s own convention', () => {
    const c = makeConnection('1B', '62Ax', pts)!
    expect(c.bearingDeg).toBeCloseTo(
      bearingSouthBetween(pts.get('1B')!, pts.get('62Ax')!), 9)
  })

  it('refuses a parent that sits on the beacon it connects to', () => {
    // No direction to point. An arrow drawn anyway would assert something false.
    expect(makeConnection('1B', 'SAME', pts)).toBeNull()
  })

  it('refuses a beacon it cannot find', () => {
    expect(makeConnection('1B', 'GHOST', pts)).toBeNull()
    expect(makeConnection('GHOST', '62Ax', pts)).toBeNull()
  })
})

describe('upsertConnection', () => {
  it('replaces the connection from the same beacon rather than adding a second', () => {
    // A beacon connects to one parent; a second entry means the surveyor
    // changed their mind, not that both should be drawn.
    const first = makeConnection('1B', '62Ax', pts)!
    const list = upsertConnection([], first)
    const again = upsertConnection(list, { ...first, toBeacon: 'OTHER', distanceM: 1 })
    expect(again).toHaveLength(1)
    expect(again[0].toBeacon).toBe('OTHER')
  })

  it('leaves other beacons alone', () => {
    const a = makeConnection('1B', '62Ax', pts)!
    const b = { ...a, fromBeacon: '1A' }
    expect(upsertConnection([a], b).map(c => c.fromBeacon).sort()).toEqual(['1A', '1B'])
  })
})

describe('removeConnection', () => {
  it('drops only the named beacon’s connection', () => {
    const a = makeConnection('1B', '62Ax', pts)!
    const b = { ...a, fromBeacon: '1A' }
    expect(removeConnection([a, b], '1B').map(c => c.fromBeacon)).toEqual(['1A'])
  })
})

/**
 * Real values from the Brackenhurst project: a parcel ring comes out of PostGIS
 * as [Southing, Westing]; a coordinate point arrives as y=Westing, x=Southing.
 * Compared raw, every match fails -- which is what put "corner B has no
 * coordinated beacon" in front of a surveyor whose corner B plainly had one.
 */
describe('toLoPoint', () => {
  it('puts a ring vertex the right way round', () => {
    expect(toLoPoint(2143972.14, -85728.71)).toEqual({ Y: -85728.71, X: 2143972.14 })
  })

  it('leaves a coordinate point that is already canonical alone', () => {
    expect(toLoPoint(-85728.71, 2143972.14)).toEqual({ Y: -85728.71, X: 2143972.14 })
  })

  it('is idempotent — normalising twice changes nothing', () => {
    const once = toLoPoint(2143972.14, -85728.71)
    expect(toLoPoint(once.Y, once.X)).toEqual(once)
  })

  it('passes rubbish through rather than inventing a point', () => {
    expect(toLoPoint(NaN, 5)).toEqual({ Y: NaN, X: 5 })
  })
})

describe('vertexBeaconNames', () => {
  const points = new Map<string, LoPoint>([
    ['86B', { Y: -85728.71, X: 2143972.14 }],
    ['87B', { Y: -85741.42, X: 2143988.59 }],
    ['86C', { Y: -85633.04, X: 2144068.00 }],
  ])

  it('names the corners of a ring stored the PostGIS way round', () => {
    // The exact failure: [Southing, Westing] from the DB against y=Westing,
    // x=Southing from the coordinate list.
    const ring: Array<[number, number]> = [
      [2143972.14, -85728.71], [2143988.59, -85741.42], [2144068.00, -85633.04],
    ]
    expect(vertexBeaconNames(ring, points)).toEqual(['86B', '87B', '86C'])
  })

  it('names them just the same when the ring is already canonical', () => {
    const ring: Array<[number, number]> = [
      [-85728.71, 2143972.14], [-85741.42, 2143988.59], [-85633.04, 2144068.00],
    ]
    expect(vertexBeaconNames(ring, points)).toEqual(['86B', '87B', '86C'])
  })

  it('drops the closing vertex so a ring does not gain a corner', () => {
    const ring: Array<[number, number]> = [
      [2143972.14, -85728.71], [2143988.59, -85741.42], [2144068.00, -85633.04],
      [2143972.14, -85728.71],
    ]
    expect(vertexBeaconNames(ring, points)).toHaveLength(3)
  })

  it('leaves a corner unnamed rather than guessing a distant beacon', () => {
    const ring: Array<[number, number]> = [[2143972.14, -85728.71], [2144500, -85000]]
    expect(vertexBeaconNames(ring, points)).toEqual(['86B', ''])
  })

  it('takes the nearest beacon when two are within tolerance', () => {
    const crowded = new Map<string, LoPoint>([
      ['FAR', { Y: -85728.71, X: 2143972.54 }],
      ['NEAR', { Y: -85728.71, X: 2143972.20 }],
    ])
    expect(vertexBeaconNames([[2143972.14, -85728.71]], crowded)).toEqual(['NEAR'])
  })
})

describe('formatBearingDMS', () => {
  it('reads as the sides table prints directions', () => {
    expect(formatBearingDMS(314 + 57 / 60 + 40 / 3600)).toBe('314 57 40')
    expect(formatBearingDMS(0)).toBe('0 00 00')
  })
})
