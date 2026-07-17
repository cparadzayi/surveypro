import { describe, it, expect } from 'vitest'
import { parseBeaconCsv, CSV_HEADER } from '../beaconComparisonCsv'

const HEADER = 'Beacon,Hist_Y,Hist_X,Survey_Y,Survey_X'

describe('parseBeaconCsv', () => {
  it('CSV_HEADER is the canonical single format', () => {
    expect(CSV_HEADER).toBe(HEADER)
  })

  it('parses a headered file into name + 4 numbers, tolerating blank rows', () => {
    // NOTE: the plan's fixture supplied only 2 data rows, but parseBeaconCsv (ported
    // verbatim from CompareView.vue) enforces a 3-beacon minimum — see report for
    // this deviation. A 3rd row is added here to satisfy that guard while still
    // exercising the "tolerates blank rows" behavior.
    const text = [HEADER, '86B,-85728.77,2143972.22,-85728.7,2143972.14', '', '87A,-85809.7,2144070.83,-85809.64,2144070.74', '88F,-85741.48,2143988.66,-85741.41,2143988.59'].join('\n')
    const rows = parseBeaconCsv(text)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({ name: '86B', yH: -85728.77, xH: 2143972.22, yS: -85728.7, xS: 2143972.14 })
  })

  it('treats a headerless numeric first line as data', () => {
    const text = ['1,-85728.77,2143972.22,-85728.7,2143972.14', '2,-85809.7,2144070.83,-85809.64,2144070.74', '3,-85741.48,2143988.66,-85741.41,2143988.59'].join('\n')
    expect(parseBeaconCsv(text)).toHaveLength(3)
  })

  it('throws when fewer than 3 beacons', () => {
    const text = [HEADER, '86B,1,2,1,2'].join('\n')
    expect(() => parseBeaconCsv(text)).toThrow(/at least 3/i)
  })

  it('throws on a non-numeric coordinate', () => {
    const text = [HEADER, '86B,abc,2,1,2', '87A,1,2,1,2', '88F,1,2,1,2'].join('\n')
    expect(() => parseBeaconCsv(text)).toThrow(/not a valid number/i)
  })

  it('throws on a row with too few columns', () => {
    const text = [HEADER, '86B,1,2,1', '87A,1,2,1,2', '88F,1,2,1,2'].join('\n')
    expect(() => parseBeaconCsv(text)).toThrow(/expected 5 columns/i)
  })
})
