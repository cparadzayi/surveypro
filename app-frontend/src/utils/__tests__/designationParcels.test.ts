import {
  designationStandNames,
  isOutsideFigureParcel,
  isRemainderParcel,
  hasAreaConsistencyData,
} from '../designationParcels'

// Brackenhurst: stands 403/404/405 + remainder, all in the A&C data.
const brackethurst = [
  { id: 1528, stand: '405', designation: 'STAND 405', metadata: { residuals: { edges: [], report: {} }, cape_lo_points: [] } },
  { id: 1529, stand: '404', designation: 'STAND 404', metadata: { residuals: { edges: [] }, cape_lo_points: [] } },
  { id: 1530, stand: '403', designation: 'STAND 403', metadata: { residuals: { edges: [] }, cape_lo_points: [] } },
  { id: 1531, stand: 'REM', designation: 'REM', metadata: { residuals: { edges: [] }, cape_lo_points: [] } },
]

describe('designationParcels', () => {
  describe('isRemainderParcel', () => {
    test.each(['REM', 'REM.', 'REMAINDER', 'Remainder', 'Rem.', 'REM/', 'rem.'])(
      '%s → true',
      (name) => {
        expect(isRemainderParcel({ stand: name })).toBe(true)
        expect(isRemainderParcel({ designation: name, stand: '12' })).toBe(true)
      },
    )

    test('remarked by stand when designation is empty', () => {
      expect(isRemainderParcel({ stand: 'REM', designation: '' })).toBe(true)
    })

    test('an anchored match: REMBRANDT and 7 REM are stands, not the remainder', () => {
      expect(isRemainderParcel({ stand: 'REMBRANDT' })).toBe(false)
      expect(isRemainderParcel({ stand: 'Stand 7 REM' })).toBe(false)
    })

    test('the app-internal Outside Figure pseudo-parcel counts as the remainder', () => {
      expect(isRemainderParcel({ stand: 'OUTSIDE FIGURE' })).toBe(true)
      expect(isRemainderParcel({ designation: 'Outside_Figure' })).toBe(true)
    })
  })

  describe('isOutsideFigureParcel', () => {
    test('name containment is enough', () => {
      expect(isOutsideFigureParcel({ stand: 'Outside Figure' })).toBe(true)
      expect(isOutsideFigureParcel({ designation: 'outside figure' })).toBe(true)
    })
    test('stands are not outside figures', () => {
      expect(isOutsideFigureParcel({ stand: '403', designation: 'STAND 403' })).toBe(false)
    })
  })

  describe('hasAreaConsistencyData', () => {
    test('computed data present → true', () => {
      expect(hasAreaConsistencyData({ metadata: { residuals: { edges: [] } } })).toBe(true)
      expect(hasAreaConsistencyData({ metadata: { cape_lo_points: [] } })).toBe(true)
    })
    test('metadata with no computed keys → false', () => {
      expect(hasAreaConsistencyData({ metadata: {} })).toBe(false)
      expect(hasAreaConsistencyData({ metadata: { persisted: true } })).toBe(false)
    })
    test('no metadata at all → permissive (row shape omits it)', () => {
      expect(hasAreaConsistencyData({ standalone: true })).toBe(true)
      expect(hasAreaConsistencyData({})).toBe(true)
    })
  })

  describe('designationStandNames', () => {
    test('Brackenhurst: the surveyed stands, the remainder excluded', () => {
      expect(designationStandNames(brackethurst)).toEqual(['405', '404', '403'])
    })

    test('no area-consistency data → the parcel does not appear', () => {
      const parcels = [
        { stand: '10', metadata: { residuals: { edges: [] } } },
        { stand: '20', metadata: {} },
      ]
      expect(designationStandNames(parcels)).toEqual(['10'])
    })

    test('Outside Figure pseudo-parcel is dropped even when A&C data exists', () => {
      const parcels = [
        { stand: '3', metadata: { residuals: { edges: [] } } },
        { stand: 'outside figure', metadata: { residuals: { edges: [] } } },
      ]
      expect(designationStandNames(parcels)).toEqual(['3'])
    })

    test('blank names and empty input produce []', () => {
      expect(designationStandNames([])).toEqual([])
      expect(designationStandNames([{ stand: '  ' }])).toEqual([])
      expect(designationStandNames(null as any)).toEqual([])
    })

    test('deduplicates identical stand names and preserves parcel order', () => {
      const parcels = [
        { stand: '2', metadata: { residuals: { edges: [] } } },
        { stand: '1', metadata: { residuals: { edges: [] } } },
        { stand: '2', metadata: { residuals: { edges: [] } } },
      ]
      expect(designationStandNames(parcels)).toEqual(['2', '1'])
    })
  })
})