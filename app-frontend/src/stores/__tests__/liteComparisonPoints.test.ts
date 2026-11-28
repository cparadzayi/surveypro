// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useLiteWorkingPointsStore, comparisonWorkingPoints } from '../liteWorkingPoints'

const HERT = [
  { name: 'FS2-3', yH: 8539.02, xH: 2859.11, yS: -86750.76, xS: 2141404.39 },
  { name: 'RBNF', yH: 4836.82, xH: -886.39, yS: -83030.07, xS: 2145133.34 },
  { name: 'BM 005', yH: 0, xH: 0, yS: 0, xS: 0 },
]

describe('Beacon Comparison beacons as Lite working points', () => {
  beforeEach(() => { localStorage.clear(); setActivePinia(createPinia()) })

  it('gives each beacon at the survey position and its historical position as "(hist)", skipping unfilled rows', () => {
    expect(comparisonWorkingPoints(HERT)).toEqual([
      { name: 'FS2-3', y: -86750.76, x: 2141404.39, source: 'comparison' },
      { name: 'FS2-3 (hist)', y: 8539.02, x: 2859.11, source: 'historical' },
      { name: 'RBNF', y: -83030.07, x: 2145133.34, source: 'comparison' },
      { name: 'RBNF (hist)', y: 4836.82, x: -886.39, source: 'historical' },
    ])
  })

  it('replaces an earlier network and keeps typed and computed points', () => {
    const store = useLiteWorkingPointsStore()
    store.add({ name: 'Q1', y: 1, x: 2, source: 'polar' })
    store.syncComparison(HERT)
    store.syncComparison([{ name: 'NN-4', yH: 4241.96, xH: 1085.35, yS: -82440.62, xS: 2143158.13 }])
    expect(store.points.map(p => p.name).sort()).toEqual(['NN-4', 'NN-4 (hist)', 'Q1'])
    expect(store.matching('nn', 10).map(p => p.name)).toContain('NN-4')
    expect(JSON.parse(localStorage.getItem('lite-working-points')!).points).toHaveLength(3)
  })
})
