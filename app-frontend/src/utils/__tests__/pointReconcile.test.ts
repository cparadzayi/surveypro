import { describe, it, expect } from 'vitest'
import { registryNames, keepRegistered, dropNamed } from '../pointReconcile'

// scenic 1: SLA, SLB and SLC were deleted (the registry holds 15 rows) but the saved import step and the
// saved calculation results still held all 18 points.
const saved = ['102B', '102C', '96C', 'SLA', 'SLB', 'SLC', 'SLE'].map((pointId) => ({ pointId }))
const db = ['102B', '102C', '96C', 'SLE'].map((name) => ({ name }))

describe('keeping the workflow copies in step with the registry', () => {
  it('drops saved points the registry no longer has', () => {
    const kept = keepRegistered(saved, (p) => p.pointId, registryNames(db))
    expect(kept.map((p) => p.pointId)).toEqual(['102B', '102C', '96C', 'SLE'])
  })

  it('compares names the way beacon names are compared (a lower-case suffix is the same beacon)', () => {
    const kept = keepRegistered([{ pointId: '102b' }, { pointId: 'SLA' }], (p) => p.pointId, registryNames([{ name: '102B' }]))
    expect(kept.map((p) => p.pointId)).toEqual(['102b'])
  })

  it('judges nothing when the registry has no rows (not exported yet, or the fetch failed)', () => {
    expect(keepRegistered(saved, (p) => p.pointId, registryNames([]))).toHaveLength(saved.length)
    expect(keepRegistered(saved, (p) => p.pointId, registryNames(null))).toHaveLength(saved.length)
  })

  it('drops points named as deleted', () => {
    expect(dropNamed(saved, (p) => p.pointId, ['SLA', 'SLB']).map((p) => p.pointId)).toEqual(['102B', '102C', '96C', 'SLC', 'SLE'])
  })

  it('copes with a missing list', () => {
    expect(keepRegistered(undefined, (p: any) => p, new Set(['A']))).toEqual([])
    expect(dropNamed(null, (p: any) => p, ['A'])).toEqual([])
  })
})
