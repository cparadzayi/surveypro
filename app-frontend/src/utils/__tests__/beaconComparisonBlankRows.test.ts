import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { parseBeaconCsv } from '../beaconComparisonCsv'
import { useSurveyAdjustmentStore } from '../../stores/surveyAdjustmentStore'

// Hertfordshire525's upload had four beacons and six rows of nothing but commas. Number('') is 0, so each
// blank row became a beacon at 0, 0 named BM 005 ... BM 010; they all coincided, every line among them
// "passed", and the comparison rejected the four real beacons (FS2, 40, o, n).
const HERTFORDSHIRE = 'Beacon,Hist_Y,Hist_X,Survey_Y,Survey_X\r\n'
  + 'FS2,8539.020,2859.110,-86750.758,2141404.388\r\n'
  + '40,7047.620,3891.000,-85265.323,2140366.322\r\n'
  + 'o,-4836.780,886.381,-83030.066,2145133.338\r\n'
  + 'n,-4241.923,-1085.339,-82440.618,2143158.126\r\n'
  + ',,,,\r\n,,,,\r\n,,,,\r\n,,,,\r\n,,,,\r\n,,,,\r\n'

describe('parseBeaconCsv and blank rows', () => {
  it('reads only the four beacons of the Hertfordshire525 upload', () => {
    const rows = parseBeaconCsv(HERTFORDSHIRE)
    expect(rows.map(r => r.name)).toEqual(['FS2', '40', 'o', 'n'])
    expect(rows.some(r => /^BM /.test(r.name))).toBe(false)
  })

  it('refuses a row with co-ordinates but no beacon name, naming the file row', () => {
    const text = 'Beacon,Hist_Y,Hist_X,Survey_Y,Survey_X\nA,1,2,3,4\nB,5,6,7,8\n,9,10,11,12\n'
    expect(() => parseBeaconCsv(text)).toThrow('Row 4: has co-ordinates but no beacon name.')
  })

  it('refuses an empty co-ordinate rather than reading it as 0', () => {
    const text = 'Beacon,Hist_Y,Hist_X,Survey_Y,Survey_X\nA,1,2,3,4\nB,5,6,7,8\nC,9,,11,12\n'
    expect(() => parseBeaconCsv(text)).toThrow('Row 4 (C): Hist_X is empty.')
  })
})

describe('the comparison refuses unfilled beacons', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('names the rows whose co-ordinates are all 0 and runs nothing', () => {
    const store = useSurveyAdjustmentStore()
    store.setPoints(parseBeaconCsv(HERTFORDSHIRE))
    store.addPoint()
    store.addPoint()
    store.compute()
    expect(store.result).toBeNull()
    expect(store.error).toMatch(/^BM 005, BM 006 have no co-ordinates \(all four are 0\)/)
  })

  it('compares the four uploaded beacons once the blank rows are gone', () => {
    const store = useSurveyAdjustmentStore()
    store.setPoints(parseBeaconCsv(HERTFORDSHIRE))
    store.compute()
    expect(store.error).toBeNull()
    expect(store.result.pts.map((p: any) => p.name)).toEqual(['FS2', '40', 'o', 'n'])
  })
})
