/**
 * SI 727 para (5) in the documents: the Calculations print a "Beacons on line" table, the Report on Survey a
 * "Beacons on line" paragraph, and a generated connection still ties a beacon that is within the limit.
 */
import { describe, it, expect } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { CalculationsPart1Generator } from '../calculations-part1'
import { generateNarrativeReportOnSurveyPDF } from '../reportOnSurveyNarrativeGenerator'
import { autoConnections, type LoPoint } from '../../views/modules/cadastral-standard/connections'
import type { AlignmentResult } from '../../../../app-shared/beaconAlignment'

const row = (beacon: string, band: AlignmentResult['band'], offset: number): AlignmentResult => ({
  beacon, from: '86C', to: '87D', offset, d: 67.08, nearest: '87D', limit: 0.0768, moveLimit: 0.0935, band,
})
const raw = async (blob: Blob) => Buffer.from(new Uint8Array(await blob.arrayBuffer())).toString('latin1')

describe('Calculations Part 1: Beacons on line', () => {
  const info = { name: 'x', licenseNumber: '1', firm: '', address: '', surveyDate: '2026-01-01', projectTitle: 't' }
  const point = { pointId: 'SD3', y: -85682.515, x: 2144117.414, status: 'P', description: '', surveyDate: '2026-01-01' }
  const gen = async (alignment: AlignmentResult[]) => {
    setActivePinia(createPinia())
    return await new CalculationsPart1Generator().generateCalculationsPart1PDF([point], info, 116, false, [], {}, undefined, [], alignment) as any
  }

  it('adds a page with each beacon, its line, offset, d, both limits and the result', async () => {
    const none = await gen([])
    const one = await gen([row('SD3', 'on-line', 0.008), row('SD9', 'may-stay', 0.085)])
    expect(one.pageCount).toBe(none.pageCount + 1)
    const text = await raw(one.pdf)
    expect(text).toContain('Beacons on line \\(SI 727, para \\(5\\)\\)')
    expect(text).toContain('(86C - 87D) Tj')
    expect(text).toContain('(0.008) Tj')
    expect(text).toContain('(On line) Tj')
    expect(text).toContain('(Need not move \\(i\\)) Tj')
  })
})

describe('Report on Survey: Beacons on line', () => {
  const reportData = {
    srNumber: '188/2026', purpose: { type: 'private-land', reference: '' },
    surveyBasis: { trigStations: false, townSurveyMarks: false, officialControlPoints: false, previousSurvey: false, localSystem: false },
    beacons: [], curvilinearBoundaries: { applicable: false }, unusualOccurrences: '',
  } as any
  const opts = { surveyorName: 'C. Paradzayi', licenseNumber: '293', firm: '', address: '', surveyDate: '2026-07-01', surveyOf: 'x' }

  it('names the beacons on line and the largest displacement, and states one that need not be moved', async () => {
    const { pdf } = await generateNarrativeReportOnSurveyPDF(reportData, {
      ...opts, alignment: [row('SD3', 'on-line', 0.008), row('SD4', 'on-line', 0.002), row('SD9', 'may-stay', 0.085)],
    })
    const text = (await raw(pdf)).replace(/\) Tj\s*[^(]*\(/g, ' ')
    expect(text).toContain('Beacons on line')
    expect(text).toMatch(/SD3 and SD4 were placed on the boundary/)
    expect(text).toMatch(/largest displacement 8 mm/)
    expect(text).toMatch(/SD9 is 85 mm off the line 86C - 87D/)
  })

  it('says nothing when no new beacon stands on the parent boundary', async () => {
    const { pdf } = await generateNarrativeReportOnSurveyPDF(reportData, { ...opts, alignment: [] })
    expect(await raw(pdf)).not.toContain('Beacons on line')
  })
})

describe('connections use para (5)\'s limit', () => {
  // V at the origin, its side from P runs due "north" (X decreasing), carried on to E 400 m ahead.
  const base = (eOff: number) => new Map<string, LoPoint>([
    ['P', { Y: 0, X: 100 }], ['V', { Y: 0, X: 0 }], ['Q', { Y: -50, X: 0 }],
    ['E', { Y: eOff, X: -400 }],
  ])
  const run = (eOff: number) => autoConnections({ corners: ['P', 'V', 'Q'], remainder: ['E', 'P'], newBeacons: ['V', 'Q'], points: base(eOff) })
  it('ties a parent beacon within 0,06 + 0,000 5d of the line, d being the nearer end, and not one beyond it', () => {
    // d = min(400, 100) = 100 m: limit 0,11 m (wider than the old fixed 0,10). 0,105 m is tied; 0,13 m is not.
    expect(run(0.105).map((c) => c.toBeacon)).toEqual(['E'])
    expect(run(0.13)).toEqual([])
  })
})
