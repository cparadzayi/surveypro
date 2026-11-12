// @vitest-environment happy-dom
//
// The control the survey was tied to, in the Co-ordinate List: the registry's stations and the official
// control points the site calibration names that the registry does not hold (6091/V), all under TRIG
// BEACONS / TSMs. The carried point reaches the generator only as a control row (the 3rd parameter), so a
// caller that does not pass it leaves it out of the printed list -- which the comprehensive record did.

import { describe, it, expect } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { CoordinateListGenerator } from '../coordinate-list'
import { localControlFromCalibration, localControlToRegistryRows } from '../siteCalibration'

const surveyorInfo = {
  name: 'Test Surveyor', licenseNumber: 'LS001', firm: 'Test Firm', address: '1 Test St', surveyDate: 'September 2026',
  projectTitle: 'scenic 1', district: 'SELUKWE',
  surveyOf: 'Sebanga Park Township of Sebanga Park of Sebanga Poort',
  standNames: ['1343', '1344', '1345', '1694'],
} as any

const registryRow = (monu_num: string, monu_name: string, y: number, x: number) => ({ id: 1, monu_num, monu_name, y_gauss: y, x_gauss: x, type: 'SEC' })
const carried = localControlToRegistryRows(
  localControlFromCalibration({ pairs: [{ pointId: '6091/V', controlNorthing: 2175855.76, controlEasting: -103948.42 } as any] }, ['6091/V']),
  29,
)

async function render(controlRows: any[]) {
  setActivePinia(createPinia())
  const generator: any = new CoordinateListGenerator()
  let trig: any[] = []
  const sectionsFor = generator.sectionsFor.bind(generator)
  generator.sectionsFor = (grouped: any) => { trig = grouped.trig; return sectionsFor(grouped) }
  const result = await generator.generateCoordinateListPDF(
    [{ pointId: '1343C', status: 'P', description: '12mm iron peg in concrete', y: -103430.51, x: 2176687.4, fieldBookPage: '', calculationsPage: 0 }],
    surveyorInfo, controlRows,
  )
  return { trig, result }
}

describe('official control points in the Co-ordinate List', () => {
  it('a carried OCP is printed under TRIG BEACONS with the registry stations', async () => {
    const { trig } = await render([registryRow('332/S', 'ABERFOYLE', -95602.28, 2176681.81), ...carried])
    expect(trig.map((p) => p.pointId)).toEqual(['332/S', '6091/V'])
    const ocp = trig.find((p) => p.pointId === '6091/V')
    expect(ocp.status).toBe('OCP')
    expect(ocp.y).toBeCloseTo(-103948.42, 2)
    expect(ocp.x).toBeCloseTo(2175855.76, 2)
  })

  it('without it passed in, the OCP is missing (what the record generation did)', async () => {
    const { trig } = await render([registryRow('332/S', 'ABERFOYLE', -95602.28, 2176681.81)])
    expect(trig.map((p) => p.pointId)).toEqual(['332/S'])
  })
})
