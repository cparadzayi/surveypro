import { describe, it, expect } from 'vitest'
import {
  upsertServitude, removeServitude, servitudesForSubject, servitudesInvolving,
  hydrateServitudes, servitudeTypeLabel, beaconBoundary, resolveBeaconPair,
  sideMatchingBeaconPair, buildPartyWallStatementRows, type Servitude,
} from '../servitudes'
import { subjectSides } from '../sideAnnotations'

const s = (over: Partial<Servitude> = {}): Servitude => ({
  id: 'x', subjectId: '10', side: 'AB', type: 'party-wall', ...over,
})

describe('servitude list helpers', () => {
  it('upsert replaces by id, else appends', () => {
    const a = s({ id: '1' }); const b = s({ id: '2' })
    expect(upsertServitude([a], b).map(x => x.id)).toEqual(['1', '2'])
    expect(upsertServitude([a, b], s({ id: '1', side: 'CD' })).find(x => x.id === '1')!.side).toBe('CD')
    expect(upsertServitude([a, b], s({ id: '1', side: 'CD' }))).toHaveLength(2)
  })
  it('remove drops by id', () => {
    expect(removeServitude([s({ id: '1' }), s({ id: '2' })], '1').map(x => x.id)).toEqual(['2'])
  })
  it('servitudesForSubject filters by subjectId', () => {
    const list = [s({ id: '1', subjectId: '10' }), s({ id: '2', subjectId: '20' })]
    expect(servitudesForSubject(list, '10').map(x => x.id)).toEqual(['1'])
  })
  it('servitudesInvolving returns the subject\'s records plus shared party walls', () => {
    const list = [
      s({ id: '1', subjectId: '10', type: 'sewer' }),
      s({ id: '2', subjectId: '20', type: 'party-wall', adjoiningSubjectId: '10' }),
      s({ id: '3', subjectId: '20', type: 'party-wall', adjoiningSubjectId: '30' }),
      s({ id: '4', subjectId: '10', adjoiningStand: '7' }),
    ]
    expect(servitudesInvolving(list, '10').map(x => x.id)).toEqual(['1', '2', '4'])
    expect(servitudesInvolving(list, 20).map(x => x.id)).toEqual(['2', '3'])
  })
  it('hydrate keeps well-formed records, drops malformed ones (bare id, null, non-objects)', () => {
    // s({id:'1'}) is a complete Servitude; { id: '2' } lacks subjectId/side/type → dropped.
    expect(hydrateServitudes([s({ id: '1' }), null, { id: '2' }, 42])).toHaveLength(1)
    expect(hydrateServitudes([s({ id: '1' }), s({ id: '2' })])).toHaveLength(2)
    expect(hydrateServitudes('nope')).toEqual([])
  })
})

describe('servitudeTypeLabel', () => {
  it('maps enum to human label; uses typeLabelOther for other', () => {
    expect(servitudeTypeLabel(s({ type: 'party-wall' }))).toBe('Party wall')
    expect(servitudeTypeLabel(s({ type: 'storm-water' }))).toBe('Storm-water / drainage')
    expect(servitudeTypeLabel(s({ type: 'other', typeLabelOther: 'Eaves' }))).toBe('Eaves')
    expect(servitudeTypeLabel(s({ type: 'other' }))).toBe('Other')
  })
})

describe('beaconBoundary', () => {
  it('renders the beacon pair when named, else the raw side', () => {
    expect(beaconBoundary(s({ fromBeacon: '313A', toBeacon: '312A' }))).toBe('313A – 312A')
    expect(beaconBoundary(s({ side: 'DA' }))).toBe('DA')
  })
})

describe('resolveBeaconPair', () => {
  // Square ring -> sides AB, BC, CD, DA (index 0..3). edges align by index.
  const ring: [number, number][] = [[0, 0], [0, 10], [10, 10], [10, 0]]
  const sides = subjectSides(ring)
  const edges = [
    { from: { id: '10a' }, to: { id: '10b' } },
    { from: { id: '10b' }, to: { id: '10c' } },
    { from: { id: '10c' }, to: { id: '10d' } },
    { from: { name: '10d' }, to: { name: '10a' } },
  ]
  it('maps a letter side to the edge beacon pair', () => {
    expect(resolveBeaconPair(sides, edges, 'BC')).toEqual({ fromBeacon: '10b', toBeacon: '10c' })
    expect(resolveBeaconPair(sides, edges, 'DA')).toEqual({ fromBeacon: '10d', toBeacon: '10a' })
  })
  it('returns null for an unknown side or a missing/nameless edge', () => {
    expect(resolveBeaconPair(sides, edges, 'ZZ')).toBeNull()
    expect(resolveBeaconPair(sides, [{ from: {}, to: {} }], 'AB')).toBeNull()
  })
  it('spatially matches beacon names when edge endpoints only carry coordinates', () => {
    const coordinatePoints = [
      { name: '10b', y: 0, x: 10 },
      { name: '10c', y: 10, x: 10 },
    ]
    const spatialEdges = [
      { from: {}, to: {} },
      { from: { y: 0, x: 10 }, to: { y: 10, x: 10 } },
      { from: {}, to: {} },
      { from: {}, to: {} },
    ]
    expect(resolveBeaconPair(sides, spatialEdges, 'BC', coordinatePoints))
      .toEqual({ fromBeacon: '10b', toBeacon: '10c' })
  })
})

describe('sideMatchingBeaconPair', () => {
  const ring: [number, number][] = [[100, 100], [100, 110], [110, 110], [110, 100]]
  const sides = subjectSides(ring)
  const edges = [
    { from: { name: '312A' }, to: { name: '313A' } },
    { from: { name: '313A' }, to: { name: '313B' } },
    { from: { name: '313B' }, to: { name: '312B' } },
    { from: { name: '312B' }, to: { name: '312A' } },
  ]
  it('finds the ring side carrying a boundary, either direction', () => {
    expect(sideMatchingBeaconPair(sides, edges, [], { fromBeacon: '312A', toBeacon: '313A' })).toBe('AB')
    // Adjoining ring walks the same edge reversed — still matches.
    expect(sideMatchingBeaconPair(sides, edges, [], { fromBeacon: '313A', toBeacon: '312A' })).toBe('AB')
  })
  it('returns null when no side carries the pair', () => {
    expect(sideMatchingBeaconPair(sides, edges, [], { fromBeacon: '999A', toBeacon: '999B' })).toBeNull()
  })
})

describe('buildPartyWallStatementRows', () => {
  const standForParcel = (id: string) =>
    ({ '10': '2833', '20': '2469' } as Record<string, string>)[id] ?? undefined

  const pw = (over: Partial<Servitude> = {}): Servitude =>
    s({
      id: Math.random().toString(36).slice(2),
      subjectId: '10',
      adjoiningStand: '2469',
      type: 'party-wall',
      ...over,
    })

  it('renders only party-wall servitudes, subject-first stands and beacon boundary', () => {
    const rows = buildPartyWallStatementRows([
      pw({ adjoiningStand: '2469', fromBeacon: '2833A', toBeacon: '2833B' }),
      s({ type: 'storm-water', subjectId: '10' }),
    ], standForParcel)
    expect(rows).toEqual([{ stands: '2833, 2469', boundary: '2833A – 2833B' }])
  })

  it('resolves the adjoining stand from the reciprocal parcel id (shared-pattern capture)', () => {
    const rows = buildPartyWallStatementRows([
      pw({ adjoiningSubjectId: '20', fromBeacon: '2833A', toBeacon: '2833B' }),
    ], standForParcel)
    expect(rows).toEqual([{ stands: '2833, 2469', boundary: '2833A – 2833B' }])
  })

  it('falls back to the side letter when no beacon pair exists', () => {
    expect(buildPartyWallStatementRows([pw({ side: 'BC' })], standForParcel))
      .toEqual([{ stands: '2833, 2469', boundary: 'BC' }])
  })

  it('dedupes mirrored records (subject/adjoining swapped), keeping first order', () => {
    const rows = buildPartyWallStatementRows([
      pw({ subjectId: '10', adjoiningStand: '2469', fromBeacon: '2833A', toBeacon: '2833B' }),
      pw({ subjectId: '20', adjoiningStand: '2833', fromBeacon: '2833B', toBeacon: '2833A' }),
    ], standForParcel)
    // Canonical key sorts stands, so the mirror maps onto the first row.
    expect(rows).toEqual([{ stands: '2833, 2469', boundary: '2833A – 2833B' }])
  })

  it('skips records with no resolvable stand', () => {
    expect(buildPartyWallStatementRows([
      pw({ subjectId: '999', adjoiningStand: '' }),
    ], standForParcel)).toEqual([])
  })
})
