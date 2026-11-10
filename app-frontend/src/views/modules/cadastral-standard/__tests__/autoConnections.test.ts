import { describe, it, expect } from 'vitest'
import { autoConnections, mergeConnections, dismissConnection, type LoPoint } from '../connections'

// Brackenhurst: stand 405 beside the remaining extent. Coordinates are the project's own (Y westing, X southing).
const P = (name: string, y: number, x: number): [string, LoPoint] => [name, { Y: y, X: x }]
const points = new Map<string, LoPoint>([
  P('86B', -85728.708, 2143972.144), P('87B', -85741.418, 2143988.587), P('SD1', -85765.137, 2144017.161),
  P('SD5', -85710.106, 2144063.183), P('SD4', -85673.907, 2144027.044), P('SD6', -85723.396, 2144076.451),
  P('87A', -85809.635, 2144070.743), P('87C', -85816.303, 2144078.189), P('SD2', -85774.379, 2144120.221),
  P('SD3', -85682.515, 2144117.414), P('86C', -85633.04, 2144068.004), P('87D', -85729.993, 2144164.797),
])
// 87A and 87C are on the road line beyond SD1 only if the road runs straight; the real data decides.
const stand405 = ['86B', '87B', 'SD1', 'SD5', 'SD4']
const remainder = ['SD1', '87A', '87C', 'SD2', 'SD6', 'SD5']
const newBeacons = ['86B', '87B', 'SD1', 'SD5', 'SD4', 'SD6', 'SD2', 'SD3', '87D', '86C']

describe('autoConnections', () => {
  it('ties a corner to the old remainder beacon its side runs on to', () => {
    const got = autoConnections({ corners: stand405, remainder, newBeacons, points })
    expect(got.map(c => `${c.fromBeacon}>${c.toBeacon}`)).toEqual(['SD1>87A'])
  })

  it('the distance is to 2 decimal places and measured along the side', () => {
    const [c] = autoConnections({ corners: stand405, remainder, newBeacons, points })
    const raw = Math.hypot(-85809.635 - -85765.137, 2144070.743 - 2144017.161)
    expect(c.distanceM).toBe(Math.round(raw * 100) / 100)
    expect(c.distanceM).toBe(Number(c.distanceM.toFixed(2)))
  })

  it('never ties a corner to a beacon the subdivision itself has just placed', () => {
    // SD6 is on the remainder's ring and on the line of 404/405's side, but it is new.
    const got = autoConnections({ corners: stand405, remainder, newBeacons, points })
    expect(got.some(c => c.toBeacon === 'SD6')).toBe(false)
  })

  it('does not connect an old beacon that does not stand on the side', () => {
    const off = new Map(points); off.set('87A', { Y: -85809.635 + 5, X: 2144070.743 })
    expect(autoConnections({ corners: stand405, remainder, newBeacons, points: off })).toEqual([])
  })

  it('does not run past a new beacon to reach an old one', () => {
    const lined = new Map<string, LoPoint>([P('A', 0, 0), P('B', 0, 10), P('C', 10, 10), P('N', 0, 20), P('O', 0, 40)])
    // side C->B->... carried past B along x: N (new) at 20 blocks O (old) at 40
    const got = autoConnections({ corners: ['A', 'B', 'C'], remainder: ['O'], newBeacons: ['A', 'B', 'C', 'N'], points: lined })
    expect(got).toEqual([])
    const clear = autoConnections({ corners: ['A', 'B', 'C'], remainder: ['O'], newBeacons: ['A', 'B', 'C'], points: lined })
    expect(clear.map(c => `${c.fromBeacon}>${c.toBeacon}`)).toEqual(['B>O'])
  })

  it('rounds half to even: 20.785 -> 20.78, 20.795 -> 20.80', () => {
    const mk = (d: number) => new Map<string, LoPoint>([P('A', 0, 0), P('B', 0, 10), P('C', 10, 10), P('O', 0, 10 + d)])
    const at = (d: number) => autoConnections({ corners: ['A', 'B', 'C'], remainder: ['O'], newBeacons: ['A', 'B', 'C'], points: mk(d) })[0].distanceM
    expect(at(20.785)).toBe(20.78)
    expect(at(20.795)).toBe(20.8)
  })

  it('a corner with no coordinated beacon is skipped, not guessed', () => {
    expect(autoConnections({ corners: ['', '87B', 'SD1'], remainder, newBeacons, points })
      .every(c => c.fromBeacon !== '')).toBe(true)
  })
})

describe('mergeConnections and dismissConnection', () => {
  const auto = [{ fromBeacon: 'SD1', toBeacon: '87A', distanceM: 10, bearingDeg: 1 }]
  it('shows the generated connection when the surveyor has said nothing', () => {
    expect(mergeConnections(auto, [])).toEqual(auto)
  })
  it("the surveyor's own connection from the same beacon replaces it", () => {
    const own = { fromBeacon: 'SD1', toBeacon: '87C', distanceM: 12, bearingDeg: 2 }
    expect(mergeConnections(auto, [own])).toEqual([own])
  })
  it('a dismissal removes it, and stays removed', () => {
    const stored = dismissConnection([], 'SD1', true)
    expect(mergeConnections(auto, stored)).toEqual([])
  })
  it('clearing one the surveyor entered just removes it', () => {
    const own = { fromBeacon: 'X', toBeacon: 'Y', distanceM: 1, bearingDeg: 0 }
    expect(dismissConnection([own], 'X', false)).toEqual([])
  })
})
