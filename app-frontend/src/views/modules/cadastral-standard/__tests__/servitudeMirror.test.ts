import { describe, it, expect } from 'vitest'
import { syncServitudeMirror, backfillServitudesFromAnnotations, type Servitude } from '../servitudes'
import type { SideAnnotation } from '../sideAnnotations'

const sv = (over: Partial<Servitude> = {}): Servitude => ({
  id: 's1', subjectId: '10', side: 'AB', type: 'party-wall', ...over,
})

describe('syncServitudeMirror', () => {
  it('rebuilds only role:servitude entries, preserving road/contiguous, tagging servitudeId', () => {
    const before: Record<string, SideAnnotation[]> = {
      '10': [
        { side: 'AB', role: 'servitude', servitudeId: 'OLD' }, // stale, must be replaced
        { side: 'CD', role: 'road', widthM: 6 },               // preserved
        { side: 'DA', role: 'contiguous' },                    // preserved
      ],
    }
    const out = syncServitudeMirror(before, [sv({ id: 's1', subjectId: '10', side: 'AB', widthM: 0.2, beneficiary: 'Stand 11' })])
    const bySide = Object.fromEntries(out['10'].map(a => [a.side, a]))
    expect(bySide['CD'].role).toBe('road')
    expect(bySide['DA'].role).toBe('contiguous')
    expect(bySide['AB']).toMatchObject({ role: 'servitude', servitudeId: 's1', widthM: 0.2, label: 'Stand 11' })
    // exactly one servitude entry, no leftover OLD
    expect(out['10'].filter(a => a.role === 'servitude')).toHaveLength(1)
  })
  it('creates a subject bucket when servitude targets a subject with no prior annotations', () => {
    const out = syncServitudeMirror({}, [sv({ subjectId: '99', side: 'EF' })])
    expect(out['99']).toEqual([{ side: 'EF', role: 'servitude', servitudeId: 's1', widthM: undefined, label: undefined }])
  })
})

describe('backfillServitudesFromAnnotations', () => {
  it('back-fills legacy servitude annotations lacking servitudeId, defaulting type party-wall', () => {
    const map: Record<string, SideAnnotation[]> = {
      '10': [
        { side: 'AB', role: 'servitude', widthM: 0.2, label: 'wall' }, // legacy -> back-fill
        { side: 'BC', role: 'servitude', servitudeId: 'already' },     // already linked -> skip
        { side: 'CD', role: 'road' },                                   // not a servitude -> skip
      ],
    }
    const out = backfillServitudesFromAnnotations(map)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ subjectId: '10', side: 'AB', type: 'party-wall', widthM: 0.2, purpose: 'wall' })
    expect(typeof out[0].id).toBe('string')
  })
})
