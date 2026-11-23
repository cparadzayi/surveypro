// @vitest-environment happy-dom
//
// The Lite modules share one list of working points (picked, typed or computed) and one points layer, so a
// point computed in Polar can be picked in Join without retyping it, and the list survives a reload.
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLiteWorkingPointsStore, nextFreeName, MAX_WORKING_POINTS } from '../liteWorkingPoints'
import { joinsCsv } from '../../views/modules/lite/join/joinsCsv'
import { joinPoints } from '../../utils/join'

beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })

describe('the Lite working points', () => {
  it('keeps one point per name (case and spaces ignored), the newest figures winning', () => {
    const s = useLiteWorkingPointsStore()
    s.add({ name: 'Q1', y: 1, x: 2, source: 'polar' })
    s.add({ name: ' q1 ', y: 3, x: 4, source: 'typed' })
    expect(s.points).toHaveLength(1)
    expect(s.points[0]).toMatchObject({ name: 'q1', y: 3, x: 4, source: 'typed' })
  })

  it('does not keep a point without a name or without numbers', () => {
    const s = useLiteWorkingPointsStore()
    s.add({ name: '  ', y: 1, x: 2, source: 'typed' })
    s.add({ name: 'A', y: NaN, x: 2, source: 'typed' })
    expect(s.points).toHaveLength(0)
  })

  it('survives a reload, with the shared layer', () => {
    const s = useLiteWorkingPointsStore()
    s.add({ name: '87C', y: 33332.88, x: 1860173, source: 'layer' })
    s.setLayer(4)
    setActivePinia(createPinia())
    const again = useLiteWorkingPointsStore()
    expect(again.layerId).toBe(4)
    expect(again.points.map((p) => p.name)).toEqual(['87C'])
  })

  it('finds points by part of the name, newest first, and drops the oldest past the cap', () => {
    const s = useLiteWorkingPointsStore()
    for (let i = 0; i < MAX_WORKING_POINTS + 5; i++) {
      s.add({ name: `P${i}`, y: i, x: i, source: 'typed' })
      s.points[s.points.length - 1].at = i // a deterministic order
    }
    s.add({ name: 'P999', y: 0, x: 0, source: 'typed' })
    expect(s.points.length).toBe(MAX_WORKING_POINTS)
    expect(s.points.some((p) => p.name === 'P0')).toBe(false)
    expect(s.matching('P99', 3)[0].name).toBe('P999')
  })

  it('names computed points Q1, Q2, ... skipping names already used', () => {
    expect(nextFreeName([], 'Q')).toBe('Q1')
    expect(nextFreeName([{ name: 'q1' }, { name: 'Q2' }, { name: 'Q4' }], 'Q')).toBe('Q3')
  })
})

describe('joinsCsv', () => {
  it('writes the figures as shown, banker\'s-rounded, one row per join', () => {
    const j = joinPoints({ y: 1000, x: 2000 }, { y: 1003, x: 2004 })!
    const csv = joinsCsv([{ from: 'A, west', to: 'B', result: j }])
    const lines = csv.trim().split('\r\n')
    expect(lines[0]).toBe('From,To,Direction (D:M:S),Distance (m),Reverse direction (D:M:S),dY (m),dX (m)')
    expect(lines[1]).toBe('"A, west",B,36:52:12,5.00,216:52:12,3.00,4.00')
  })
})
