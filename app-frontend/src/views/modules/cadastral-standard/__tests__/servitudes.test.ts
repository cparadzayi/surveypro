import { describe, it, expect } from 'vitest'
import {
  upsertServitude, removeServitude, servitudesForSubject, hydrateServitudes,
  servitudeTypeLabel, resolveBeaconPair, type Servitude,
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
})
