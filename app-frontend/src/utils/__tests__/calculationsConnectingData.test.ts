/**
 * The Surveyor-General's examiners asked for the connecting data in the Calculations: the computation behind each
 * connection a diagram letters, not only its distance. Rows come from connections.ts, pages from Calculations Part 1.
 */
import { describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { connectingDataRows, type LoPoint } from '../../views/modules/cadastral-standard/connections'
import { CalculationsPart1Generator } from '../calculations-part1'

const pts = new Map<string, LoPoint>([
  ['SD2', { Y: -85774.379, X: 2144120.221 }],
  ['87D', { Y: -85729.993, X: 2144164.797 }],
  ['SD1', { Y: -85765.137, X: 2144017.161 }],
])
const conn = (fromBeacon: string, toBeacon: string) => ({ fromBeacon, toBeacon, distanceM: 0, bearingDeg: 0 })

describe('connectingDataRows', () => {
  it('computes differences, a south-oriented direction and a 2 dp distance from the coordinates', () => {
    const [r] = connectingDataRows('403', [conn('SD2', '87D')], pts)
    expect(r.stand).toBe('403')
    expect(r.dY).toBeCloseTo(44.386, 6)
    expect(r.dX).toBeCloseTo(44.576, 6)
    expect(r.distance).toBe(62.91)         // hypot(44.386, 44.576) = 62.9056...
    expect(r.direction).toMatch(/^\d{1,3} \d{2} \d{2}$/)
  })

  it('uses the coordinates, not the figures stored on the connection', () => {
    const [r] = connectingDataRows('403', [{ ...conn('SD2', '87D'), distanceM: 1, bearingDeg: 1 }], pts)
    expect(r.distance).toBeGreaterThan(60)
  })

  it('leaves out a connection whose beacon is unknown or which coincides', () => {
    expect(connectingDataRows('403', [conn('SD2', 'NOPE'), conn('SD2', 'SD2')], pts)).toEqual([])
  })
})

describe('Calculations Part 1 prints the connecting data', () => {
  const info = { name: 'x', licenseNumber: '1', firm: '', address: '', surveyDate: '2026-01-01', projectTitle: 't' }
  const point = { pointId: 'SD1', y: -85765.137, x: 2144017.161, status: 'P', description: '', surveyDate: '2026-01-01' }
  const pages = async (rows: ReturnType<typeof connectingDataRows>) => {
    setActivePinia(createPinia())
    const r: any = await new CalculationsPart1Generator().generateCalculationsPart1PDF([point], info, 116, false, [], {}, undefined, rows)
    return r.pageCount as number
  }

  it('adds a page when there is connecting data, and none otherwise', async () => {
    const none = await pages([])
    const one = await pages(connectingDataRows('403', [conn('SD2', '87D')], pts))
    expect(one).toBe(none + 1)
  })

  it('runs onto further pages when there are many connections', async () => {
    const many = Array.from({ length: 20 }, () => connectingDataRows('403', [conn('SD2', '87D')], pts)[0])
    expect(await pages(many)).toBeGreaterThanOrEqual((await pages([])) + 2)
  })
})
