import { describe, it, expect } from 'vitest'
import {
  planCalibrationSelection, localControlFromCalibration, localControlToRegistryRows, localControlFrom, MIN_CONTROL_POINTS,
} from '../siteCalibration'
import { controlPointsForInset } from '../../views/modules/cadastral-standard/workingPlanSpec'

// A calibration that names three registry stations and one the registry does not hold: 6091/V.
const pair = (pointId: string, N: number, E: number) => ({
  pointId, controlNorthing: N, controlEasting: E,
  globalLatitudeDegrees: -20.3, globalLongitudeDegrees: 30.07,
}) as any
const calibration = { pairs: [pair('170/P', 2247100, 97500), pair('49/T', 2247200, 97600), pair('50/T', 2247300, 97700), pair('6091/V', 2247400.5, 97800.25)] }
const registry = [{ id: 1, monu_num: '170/P' }, { id: 2, monu_num: '49/T' }, { id: 3, monu_num: '50/T' }]

describe('control the calibration names that the registry does not hold', () => {
  it('is carried with the report\'s own coordinates, typed by its designation', () => {
    const plan = planCalibrationSelection(calibration, registry)
    expect(plan.ids).toEqual([1, 2, 3])
    expect(plan.unmatched).toEqual(['6091/V'])
    expect(plan.local).toEqual([expect.objectContaining({ name: '6091/V', type: 'OCP', X: 2247400.5, Y: 97800.25, source: 'calibration' })])
    expect(plan.belowMinimum).toBe(false)
  })

  it('counts toward the minimum of three', () => {
    const two = planCalibrationSelection({ pairs: [pair('170/P', 1, 2), pair('6091/V', 3, 4)] }, [{ id: 1, monu_num: '170/P' }])
    expect(two.ids.length + two.local.length).toBe(2)
    expect(two.belowMinimum).toBe(true)
    const three = planCalibrationSelection({ pairs: [pair('170/P', 1, 2), pair('6091/V', 3, 4), pair('7000/V', 5, 6)] }, [{ id: 1, monu_num: '170/P' }])
    expect(three.ids.length + three.local.length).toBeGreaterThanOrEqual(MIN_CONTROL_POINTS)
    expect(three.belowMinimum).toBe(false)
  })

  it('a pair with no usable coordinates is not carried, and stays unmatched', () => {
    const plan = planCalibrationSelection({ pairs: [pair('6091/V', NaN, 4)] }, [])
    expect(plan.local).toEqual([])
    expect(plan.unmatched).toEqual(['6091/V'])
  })

  it('a trig designation that is missing from the registry is carried as TRIG', () => {
    expect(localControlFromCalibration(calibration, ['170/P'])[0].type).toBe('TRIG')
  })

  it('is shaped like a registry row, with an id no registry id can equal', () => {
    const rows = localControlToRegistryRows(localControlFromCalibration(calibration, ['6091/V']), 31)
    expect(rows[0]).toMatchObject({ id: 'local:6091/V', monu_num: '6091/V', type: 'OCP', gauss_lo: 31, y_gauss: 97800.25, x_gauss: 2247400.5, local: true })
    expect(rows[0].lat_wgs84).toBe(-20.3)
  })

  it('is read from either workflowState shape', () => {
    const local = localControlFromCalibration(calibration, ['6091/V'])
    expect(localControlFrom({ projectInfo: { localControlPoints: local } })).toHaveLength(1)
    expect(localControlFrom({ step_data: { 'control-point-selection': { local_control_points: local } } })).toHaveLength(1)
    expect(localControlFrom({})).toEqual([])
  })

  it('reaches the trig inset as an official control point', () => {
    const rows = controlPointsForInset(localControlToRegistryRows(localControlFromCalibration(calibration, ['6091/V']), 31))
    expect(rows).toEqual([expect.objectContaining({ name: '6091/V', X: 2247400.5, Y: 97800.25, type: 'OCP' })])
  })
})
