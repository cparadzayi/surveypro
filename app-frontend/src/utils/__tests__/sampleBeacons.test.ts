/**
 * The comparison tool's sample network (BM 001 - BM 008) reached the Surveyor-General in a Report on Survey once.
 * These checks are what the Found Beacons save and the Complete Survey Record generation refuse it with.
 */
import { describe, it, expect } from 'vitest'
import { SAMPLE_DATA as SAMPLE_JS } from '../surveyMath'

type Row = { name: string; yH: number; xH: number; yS: number; xS: number }
const SAMPLE_DATA: Row[] = SAMPLE_JS
import { sampleRowsIn, foundBeaconRows, sampleDataProblem } from '../sampleBeacons'

const real = [
  { name: '86B', yH: -85728.77, xH: 2143972.22, yS: -85728.7, xS: 2143972.14 },
  { name: '86C', yH: -85633.12, xH: 2144068.03, yS: -85633.03, xS: 2144068 },
  { name: '87A', yH: -85809.7, xH: 2144070.83, yS: -85809.64, xS: 2144070.74 },
]

describe('sampleRowsIn', () => {
  it('names every sample row', () => {
    expect(sampleRowsIn(SAMPLE_DATA)).toEqual(SAMPLE_DATA.map((p) => p.name))
  })
  it('finds nothing in a real survey', () => {
    expect(sampleRowsIn(real)).toEqual([])
  })
  it('a real beacon that happens to be called BM 001 is not the sample', () => {
    expect(sampleRowsIn([{ name: 'BM 001', yH: -85000, xH: 2144000, yS: -85000.01, xS: 2144000 }])).toEqual([])
  })
  it('one sample row mixed into real ones is still caught', () => {
    expect(sampleRowsIn([...real, SAMPLE_DATA[3]])).toEqual(['BM 004'])
  })
})

describe('the report found beacons', () => {
  // The FoundBeacon shape the Report on Survey stores (what Brackenhurst's report held).
  const asReport = (rows: Row[]) => rows.map((p) => ({
    beaconId: p.name, status: 'found', adopted: true,
    originalData: { source: 'previous-survey', coordinates: { y: p.yH, x: p.xH } },
    currentCoordinates: { y: p.yS, x: p.xS },
  }))

  it('a report built from the sample is a problem that says what to do', () => {
    const msg = sampleDataProblem(foundBeaconRows(asReport(SAMPLE_DATA)), 'The Report on Survey')
    expect(msg).toMatch(/BM 001/)
    expect(msg).toMatch(/Found Beacons/)
  })
  it('a real report is fine, and so is none at all', () => {
    expect(sampleDataProblem(foundBeaconRows(asReport(real)), 'x')).toBeNull()
    expect(sampleDataProblem(foundBeaconRows(undefined), 'x')).toBeNull()
  })
})
