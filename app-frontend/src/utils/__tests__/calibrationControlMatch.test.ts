import { describe, it, expect } from 'vitest'
import { matchCalibrationControlPoints } from '../siteCalibration'

/**
 * When a GNSS site calibration has been imported, the control points it names
 * ARE the control this survey was tied to. Pre-selecting them beats the radius
 * search, which offers whatever happens to be nearby — including stations the
 * surveyor never observed.
 *
 * Matching is on the registry's `monu_num` (the designation: "50/T"), not
 * `monu_name` (the monument's name: "THORNHILL"). Calibration reports carry the
 * designation.
 */
const registry = [
  { id: 11, monu_num: '170/P', monu_name: 'MNYAMI' },
  { id: 12, monu_num: '176/P', monu_name: 'KENYANI' },
  { id: 13, monu_num: '49/T', monu_name: 'CHRISTMAS GIFT' },
  { id: 14, monu_num: '50/T', monu_name: 'THORNHILL' },
  { id: 15, monu_num: '187/T', monu_name: 'HAPPY VALLEY' },
]

const cal = (ids: string[]) => ({ pairs: ids.map(pointId => ({ pointId })) })

describe('matchCalibrationControlPoints', () => {
  it('selects exactly the control the calibration used', () => {
    const r = matchCalibrationControlPoints(cal(['170/P', '176/P', '49/T', '50/T']), registry)
    expect(r.ids).toEqual([11, 12, 13, 14])
    expect(r.unmatched).toEqual([])
    // 187/T is nearby but was not observed, so it must not be selected.
    expect(r.ids).not.toContain(15)
  })

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    const r = matchCalibrationControlPoints(cal([' 50/t ', '49/T']), registry)
    expect(r.ids).toEqual([14, 13])
  })

  it('reports control the registry does not have, rather than dropping it', () => {
    // Silence here would leave the surveyor believing every calibration point
    // was selected. They need to know which one to add by hand.
    const r = matchCalibrationControlPoints(cal(['50/T', '999/Z']), registry)
    expect(r.ids).toEqual([14])
    expect(r.matched).toEqual(['50/T'])
    expect(r.unmatched).toEqual(['999/Z'])
  })

  it('de-duplicates a point named twice in one report', () => {
    const r = matchCalibrationControlPoints(cal(['50/T', '50/T']), registry)
    expect(r.ids).toEqual([14])
  })

  it('returns nothing when there is no calibration', () => {
    expect(matchCalibrationControlPoints(undefined, registry).ids).toEqual([])
    expect(matchCalibrationControlPoints({ pairs: [] }, registry).ids).toEqual([])
  })

  it('survives a registry with missing designations', () => {
    const messy = [{ id: 1 }, { id: 2, monu_num: '' }, { id: 3, monu_num: '50/T' }] as any[]
    const r = matchCalibrationControlPoints(cal(['50/T']), messy)
    expect(r.ids).toEqual([3])
  })

  it('ignores blank point ids in the report', () => {
    const r = matchCalibrationControlPoints(cal(['', '  ', '50/T']), registry)
    expect(r.ids).toEqual([14])
    expect(r.unmatched).toEqual([])
  })
})
