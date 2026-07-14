import { describe, it, expect } from 'vitest'
import { buildCertificateRows } from '../dispensationCertificate'
import type { Servitude } from '../../views/modules/cadastral-standard/servitudes'

const sv = (over: Partial<Servitude> = {}): Servitude => ({
  id: 's', subjectId: '10', side: 'AB', type: 'party-wall', ...over,
})
const parcels = [
  { id: 10, stand: '1620', area_m2: 174 },
  { id: 11, stand: '1621', area_m2: 169 },
  { id: 12, stand: '1650', area_m2: 300 },
]

describe('buildCertificateRows', () => {
  it('undeveloped: one row per parcel, blank boundary/servitudeType, all parcels in order', () => {
    const rows = buildCertificateRows(parcels, [sv()], 'undeveloped')
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.boundary === '' && r.servitudeType === '')).toBe(true)
    expect(rows.map((r) => r.stand)).toEqual(['1620', '1621', '1650'])
    expect(rows[0]).toMatchObject({ stand: '1620', areaM2: 174 })
  })

  it('developed: party-wall emits a row on BOTH the subject and adjoining stand with the shared boundary', () => {
    const servitudes = [
      sv({
        id: 's1', subjectId: '10', side: 'AB', type: 'party-wall',
        fromBeacon: '1620a', toBeacon: '1620b', adjoiningStand: '1621',
      }),
    ]
    const rows = buildCertificateRows(parcels, servitudes, 'developed')
    const row1620 = rows.find((r) => r.stand === '1620')!
    const row1621 = rows.find((r) => r.stand === '1621')!
    expect(row1620.boundary).toBe('1620a – 1620b')
    expect(row1620.servitudeType).toBe('Party wall')
    expect(row1621.boundary).toBe('1620a – 1620b')
    expect(row1621.servitudeType).toBe('Party wall')
    // Stand with no servitudes still emits one blank row.
    const row1650 = rows.find((r) => r.stand === '1650')!
    expect(row1650).toMatchObject({ boundary: '', servitudeType: '' })
  })

  it('developed: boundary falls back to the raw side when beacons are missing', () => {
    const servitudes = [sv({ id: 's1', subjectId: '10', side: 'BC', type: 'sewer' })]
    const row = buildCertificateRows(parcels, servitudes, 'developed').find((r) => r.stand === '1620')!
    expect(row.boundary).toBe('BC')
    expect(row.servitudeType).toBe('Sewer')
  })

  it('developed: non-party-wall servitudeType appends width and beneficiary', () => {
    const servitudes = [
      sv({
        id: 's1', subjectId: '10', side: 'AB', type: 'electricity',
        fromBeacon: '1620a', toBeacon: '1620b', widthM: 3, beneficiary: 'ZESA',
      }),
    ]
    const row = buildCertificateRows(parcels, servitudes, 'developed').find((r) => r.stand === '1620')!
    expect(row.servitudeType).toBe('Electricity, 3 m, in favour of ZESA')
  })

  it('developed: party-wall servitudeType does NOT append width/beneficiary', () => {
    const servitudes = [
      sv({
        id: 's1', subjectId: '10', side: 'AB', type: 'party-wall',
        fromBeacon: '1620a', toBeacon: '1620b', adjoiningStand: '1621', widthM: 1,
      }),
    ]
    const row = buildCertificateRows(parcels, servitudes, 'developed').find((r) => r.stand === '1620')!
    expect(row.servitudeType).toBe('Party wall')
  })

  it('developed: a stand with two servitudes yields two rows', () => {
    const servitudes = [
      sv({ id: 's1', subjectId: '10', side: 'AB', type: 'sewer', fromBeacon: '1620a', toBeacon: '1620b' }),
      sv({ id: 's2', subjectId: '10', side: 'BC', type: 'water', fromBeacon: '1620b', toBeacon: '1620c' }),
    ]
    const rows = buildCertificateRows(parcels, servitudes, 'developed').filter((r) => r.stand === '1620')
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.servitudeType)).toEqual(['Sewer', 'Water'])
  })
})
