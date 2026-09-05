import { describe, test, expect } from '@jest/globals'
import { resolveConnections } from '../connections.js'
import { contiguousMarks } from '../contiguousMarks.js'

/** The figure from the sample diagram: A-B-C-D, B and C newly pegged. */
const geometry = {
  vertices: [
    { letter: 'A', y: -6035.65, x: 2144318.05 },
    { letter: 'B', y: -6084.19, x: 2144366.52 },
    { letter: 'C', y: -6001.80, x: 2144449.03 },
    { letter: 'D', y: -5951.24, x: 2144402.58 },
  ],
}
const bcn = (name, y, x) => ({ properties: { name }, geometry: { coordinates: [x, y] } })
const beacons = {
  features: [
    bcn('62Bx', -6035.65, 2144318.05), bcn('1B', -6084.19, 2144366.52),
    bcn('1A', -6001.80, 2144449.03), bcn('62Ax', -5951.24, 2144402.58),
    bcn('PARENT1', -6200.00, 2144500.00), bcn('PARENT2', -5900.00, 2144600.00),
  ],
}

describe('resolveConnections', () => {
  test('letters the far end after the figure, continuing its sequence', () => {
    // The sample's figure runs A B C D and its two connections are lettered E
    // and F -- one sequence, not a second one starting again at A.
    const { marks } = resolveConnections({
      geometry, beacons,
      connections: [
        { fromBeacon: '1B', toBeacon: 'PARENT1', distanceM: 88.76 },
        { fromBeacon: '1A', toBeacon: 'PARENT2', distanceM: 68.84 },
      ],
    })
    expect(marks.map(m => m.letter)).toEqual(['E', 'F'])
    expect(marks.map(m => m.fromLetter)).toEqual(['B', 'C'])
    expect(marks[0].distanceM).toBeCloseTo(88.76, 6)
  })

  test('finds the beacon by name, not by the letter it happens to hold', () => {
    // Letters come from ring order, so re-digitising a parcel reassigns them.
    // A connection stored as 'B' would move to a different corner; stored as a
    // beacon name it follows its own beacon. Same ring, rotated:
    const rotated = {
      vertices: [
        { letter: 'A', y: -6084.19, x: 2144366.52 },   // was B
        { letter: 'B', y: -6001.80, x: 2144449.03 },
        { letter: 'C', y: -5951.24, x: 2144402.58 },
        { letter: 'D', y: -6035.65, x: 2144318.05 },
      ],
    }
    const { marks } = resolveConnections({
      geometry: rotated, beacons,
      connections: [{ fromBeacon: '1B', toBeacon: 'PARENT1', distanceM: 88.76 }],
    })
    expect(marks[0].fromLetter).toBe('A')          // followed its beacon
  })

  test('carries the parent coordinate so the ray can be aimed', () => {
    const { marks } = resolveConnections({
      geometry, beacons,
      connections: [{ fromBeacon: '1B', toBeacon: 'PARENT1', distanceM: 88.76 }],
    })
    expect(marks[0].toYX).toEqual([-6200, 2144500])
    expect(marks[0].fromYX).toEqual([-6084.19, 2144366.52])
  })

  test('skips a connection whose beacon is not a corner of this figure', () => {
    // Projects hold every beacon in the survey; a connection belonging to a
    // sister diagram must not be drawn at a guess on this one.
    const { marks, suppressed } = resolveConnections({
      geometry, beacons,
      connections: [{ fromBeacon: 'PARENT1', toBeacon: 'PARENT2', distanceM: 10 }],
    })
    expect(marks).toEqual([])
    expect(suppressed.size).toBe(0)
  })

  test('skips a connection whose parent is not in the coordinate list', () => {
    const { marks } = resolveConnections({
      geometry, beacons,
      connections: [{ fromBeacon: '1B', toBeacon: 'NOT_SURVEYED', distanceM: 10 }],
    })
    expect(marks).toEqual([])
  })

  test('is quiet when there are no connections', () => {
    expect(resolveConnections({ geometry, beacons, connections: undefined }).marks).toEqual([])
    expect(resolveConnections({ geometry, beacons, connections: [] }).marks).toEqual([])
  })

  test('names the beacons whose abutment stub the connection replaces', () => {
    const { suppressed } = resolveConnections({
      geometry, beacons,
      connections: [{ fromBeacon: '1B', toBeacon: 'PARENT1', distanceM: 88.76 }],
    })
    expect([...suppressed]).toEqual(['B'])
  })
})

describe('contiguousMarks — a connection replaces the abutment stub', () => {
  const a = [0, 0], b = [100, 0]

  test('drops only the terminal that carries a connection', () => {
    // Two marks on one beacon say two different things a reader cannot tell
    // apart. The connection is the one the SG requires, so it wins.
    const m = contiguousMarks(a, b, 'both', { from: true })
    expect(m.stubFrom).toBe(false)
    expect(m.stubTo).toBe(true)
  })

  test('leaves the side label alone', () => {
    // The neighbour is still named; it just stops being marked twice.
    const m = contiguousMarks(a, b, 'both', { from: true, to: true })
    expect(m.labelAnchor).toEqual([50, 0])
  })

  test('is unchanged when nothing is suppressed', () => {
    expect(contiguousMarks(a, b, 'both')).toEqual(contiguousMarks(a, b, 'both', {}))
    expect(contiguousMarks(a, b, 'from').stubFrom).toBe(true)
  })

  test('cannot resurrect a stub the abutment never asked for', () => {
    const m = contiguousMarks(a, b, 'from', { to: true })
    expect(m.stubFrom).toBe(true)
    expect(m.stubTo).toBe(false)
  })
})
