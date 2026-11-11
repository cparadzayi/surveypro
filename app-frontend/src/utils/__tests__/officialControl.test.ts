import { describe, it, expect } from 'vitest'
import { isOfficialControl, isOfficialControlStatus, officialControlKindByName } from '../beaconStatus'
import { splitSurveyPointsForSections } from '../comprehensive-document'
import { controlPointsForInset, insetSymbolFor } from '../../views/modules/cadastral-standard/workingPlanSpec'

// Trig beacons (TRIG) and official control points (OCP, "6091/V") are one group: national control.
describe('official control', () => {
  it('names the kind from the designation', () => {
    expect(officialControlKindByName('6091/V')).toBe('OCP')
    expect(officialControlKindByName('TSM894/V')).toBe('OCP')
    expect(officialControlKindByName('170/P')).toBe('TRIG')
    expect(officialControlKindByName('TSM5168')).toBe('TRIG')
    expect(officialControlKindByName('1665A')).toBeUndefined()
  })

  it('a status of TRIG or OCP is control; found or placed alone is not', () => {
    expect(isOfficialControlStatus('TRIG')).toBe(true)
    expect(isOfficialControlStatus('OCP')).toBe(true)
    expect(isOfficialControlStatus('ocp/F')).toBe(true)
    expect(isOfficialControlStatus('F')).toBe(false)
    expect(isOfficialControlStatus('')).toBe(false)
  })

  it('with no kind stated, the designation decides: 6091/V typed in as found is still control', () => {
    expect(isOfficialControl({ id: '6091/V', status: 'F' })).toBe(true)
    expect(isOfficialControl({ id: '1665A', status: 'F' })).toBe(false)
    // a stated kind wins over the name
    expect(isOfficialControl({ id: '6091/V', status: 'RM' })).toBe(false)
  })

  it('an OCP stays out of the field book and Calculations, like a trig beacon', () => {
    const pts = [
      { pointId: '1665A', status: 'P', description: '12mm iron peg' },
      { pointId: '6091/V', status: 'OCP', description: '' },
      { pointId: '170/P', status: 'TRIG', description: '' },
    ]
    const { forCalculations } = splitSurveyPointsForSections(pts)
    expect(forCalculations.map(p => p.pointId)).toEqual(['1665A'])
  })

  it('a registry row of type OCP reaches the trig inset as an official control point', () => {
    const rows = controlPointsForInset([{ monu_num: '6091', y_gauss: 97500, x_gauss: 2247000, type: 'ocp', monu_name: '' }])
    expect(rows[0].type).toBe('OCP')
    expect(insetSymbolFor('6091/V')).toBe('ocp')
    expect(insetSymbolFor('170/P')).toBe('trig')
  })
})
