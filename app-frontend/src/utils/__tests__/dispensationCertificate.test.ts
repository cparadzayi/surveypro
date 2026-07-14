import { describe, it, expect } from 'vitest'
import { buildServitudeSentence, buildCertificateRows } from '../dispensationCertificate'
import type { Servitude } from '../../views/modules/cadastral-standard/servitudes'

const sv = (over: Partial<Servitude> = {}): Servitude => ({
  id: 's', subjectId: '10', side: 'AB', type: 'party-wall', ...over,
})
const parcels = [
  { id: 10, stand: '1620', area_m2: 174 },
  { id: 11, stand: '1621', area_m2: 169 },
  { id: 12, stand: '1650', area_m2: 300 },
]

describe('buildServitudeSentence', () => {
  it('uses the beacon pair and type label', () => {
    expect(buildServitudeSentence(sv({ type: 'sewer', fromBeacon: '1620a', toBeacon: '1620b', widthM: 3 }), '1620'))
      .toBe('The boundary (1620a – 1620b) is subject to a Sewer, 3 m servitude')
  })
  it('falls back to the raw side when beacons are missing, and names both stands for a party wall', () => {
    expect(buildServitudeSentence(sv({ type: 'party-wall', side: 'BC', adjoiningStand: '1621' }), '1620'))
      .toBe('The boundary (BC) is subject to a Party wall servitude between Stand 1620 and Stand 1621')
  })
  it('adds in-favour-of for a beneficiary (non party-wall)', () => {
    expect(buildServitudeSentence(sv({ type: 'electricity', fromBeacon: '1620a', toBeacon: '1620b', beneficiary: 'ZESA' }), '1620'))
      .toBe('The boundary (1620a – 1620b) is subject to a Electricity servitude in favour of ZESA')
  })
})

describe('buildCertificateRows', () => {
  it('undeveloped: area-only rows, blank servitudes, all parcels', () => {
    const rows = buildCertificateRows(parcels, [sv()], 'undeveloped')
    expect(rows).toHaveLength(3)
    expect(rows.every(r => r.servitudeText === '')).toBe(true)
    expect(rows[0]).toMatchObject({ stand: '1620', areaM2: 174 })
  })
  it('developed: emits the servitude on its stand and reciprocally on the adjoining stand', () => {
    const servitudes = [sv({ id: 's1', subjectId: '10', side: 'AB', type: 'party-wall', fromBeacon: '1620a', toBeacon: '1620b', adjoiningStand: '1621' })]
    const rows = buildCertificateRows(parcels, servitudes, 'developed')
    const byStand = Object.fromEntries(rows.map(r => [r.stand, r.servitudeText]))
    expect(byStand['1620']).toContain('between Stand 1620 and Stand 1621')
    expect(byStand['1621']).toContain('between Stand 1620 and Stand 1621')
    expect(byStand['1650']).toBe('')
  })
  it('developed: joins multiple servitudes on one stand with "; "', () => {
    const servitudes = [
      sv({ id: 's1', subjectId: '10', type: 'sewer', fromBeacon: '1620a', toBeacon: '1620b' }),
      sv({ id: 's2', subjectId: '10', type: 'water', fromBeacon: '1620b', toBeacon: '1620c' }),
    ]
    const text = buildCertificateRows(parcels, servitudes, 'developed').find(r => r.stand === '1620')!.servitudeText
    expect(text.split('; ')).toHaveLength(2)
  })
})
